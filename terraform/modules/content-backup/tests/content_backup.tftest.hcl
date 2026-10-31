# Content Backup Module Tests
#
# The archive provider is mocked as well, so plan does not need a built
# bootstrap binary. Role ARNs are overridden because mock_provider otherwise
# returns placeholder strings that fail the provider's ARN validation.

mock_provider "aws" {
  override_data {
    target = data.aws_caller_identity.current
    values = {
      account_id = "123456789012"
    }
  }

  override_data {
    target = data.aws_iam_policy_document.lambda_assume_role
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  override_resource {
    target          = aws_iam_role.export
    override_during = plan
    values = {
      arn = "arn:aws:iam::123456789012:role/serverless-blog-content-backup-prd-role"
    }
  }

  override_resource {
    target          = aws_iam_role.scheduler
    override_during = plan
    values = {
      arn = "arn:aws:iam::123456789012:role/serverless-blog-content-backup-prd-scheduler"
    }
  }

  override_resource {
    target          = aws_s3_bucket.backup
    override_during = plan
    values = {
      id  = "serverless-blog-content-backup-prd-123456789012"
      arn = "arn:aws:s3:::serverless-blog-content-backup-prd-123456789012"
    }
  }

  override_resource {
    target          = aws_lambda_function.export
    override_during = plan
    values = {
      arn = "arn:aws:lambda:ap-northeast-1:123456789012:function:serverless-blog-content-backup-prd"
    }
  }
}

mock_provider "archive" {}

variables {
  project_name          = "serverless-blog"
  source_region         = "ap-northeast-1"
  environment           = "prd"
  posts_table_name      = "serverless-blog-posts-prd"
  posts_table_arn       = "arn:aws:dynamodb:ap-northeast-1:123456789012:table/serverless-blog-posts-prd"
  categories_table_name = "serverless-blog-categories-prd"
  categories_table_arn  = "arn:aws:dynamodb:ap-northeast-1:123456789012:table/serverless-blog-categories-prd"
  object_lock_mode      = "COMPLIANCE"
  retention_days        = 30
  enable_alarm          = true
  alarm_topic_arn       = "arn:aws:sns:ap-northeast-1:123456789012:alarms"
}

run "bucket_is_object_locked_in_backup_region" {
  command = plan

  assert {
    condition     = aws_s3_bucket.backup.object_lock_enabled == true
    error_message = "The backup bucket must have Object Lock enabled"
  }

  assert {
    condition = alltrue([
      aws_s3_bucket.backup.region == "ap-northeast-3",
      aws_s3_bucket_versioning.backup.region == "ap-northeast-3",
      aws_s3_bucket_object_lock_configuration.backup.region == "ap-northeast-3",
      aws_s3_bucket_lifecycle_configuration.backup.region == "ap-northeast-3",
      aws_s3_bucket_policy.backup.region == "ap-northeast-3",
    ])
    error_message = "Every bucket resource must be created in the backup region"
  }

  assert {
    condition     = aws_s3_bucket.backup.force_destroy == false
    error_message = "force_destroy must default to false"
  }

  assert {
    condition     = aws_s3_bucket_versioning.backup.versioning_configuration[0].status == "Enabled"
    error_message = "Object Lock requires versioning"
  }
}

run "default_retention_follows_variables" {
  command = plan

  assert {
    condition     = aws_s3_bucket_object_lock_configuration.backup.rule[0].default_retention[0].mode == "COMPLIANCE"
    error_message = "Default retention mode must follow object_lock_mode"
  }

  assert {
    condition     = aws_s3_bucket_object_lock_configuration.backup.rule[0].default_retention[0].days == 30
    error_message = "Default retention days must follow retention_days"
  }

  assert {
    condition     = one([for rule in aws_s3_bucket_lifecycle_configuration.backup.rule : rule.expiration[0].days]) == 31
    error_message = "Snapshots must expire one day after their lock"
  }
}

run "encryption_is_sse_s3_and_public_access_blocked" {
  command = plan

  assert {
    condition     = one([for rule in aws_s3_bucket_server_side_encryption_configuration.backup.rule : one(rule.apply_server_side_encryption_by_default).sse_algorithm]) == "AES256"
    error_message = "Use SSE-S3 so locked versions do not depend on a KMS key"
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.backup.block_public_acls,
      aws_s3_bucket_public_access_block.backup.block_public_policy,
      aws_s3_bucket_public_access_block.backup.ignore_public_acls,
      aws_s3_bucket_public_access_block.backup.restrict_public_buckets,
    ])
    error_message = "All public access must be blocked"
  }
}

run "bucket_policy_denies_tls_bypass_and_retention_changes" {
  command = plan

  assert {
    condition     = strcontains(aws_s3_bucket_policy.backup.policy, "aws:SecureTransport")
    error_message = "Bucket policy must deny non-TLS requests"
  }

  assert {
    condition     = strcontains(aws_s3_bucket_policy.backup.policy, "s3:PutObjectRetention") && strcontains(aws_s3_bucket_policy.backup.policy, "s3:PutObjectLegalHold")
    error_message = "Bucket policy must deny per-object retention and legal hold changes"
  }
}

run "export_role_is_read_scan_and_put_only" {
  command = plan

  assert {
    condition     = jsondecode(aws_iam_role_policy.export.policy).Statement[0].Action == ["dynamodb:Scan"] && jsondecode(aws_iam_role_policy.export.policy).Statement[1].Action == ["s3:PutObject"]
    error_message = "The export role must only Scan the tables and PutObject to the bucket"
  }

  assert {
    condition     = jsondecode(aws_iam_role_policy.export.policy).Statement[1].Resource == "arn:aws:s3:::serverless-blog-content-backup-prd-123456789012/snapshots/*"
    error_message = "PutObject must be limited to the snapshots/ prefix"
  }
}

run "lambda_targets_backup_bucket_region" {
  command = plan

  assert {
    condition     = aws_lambda_function.export.environment[0].variables.BACKUP_BUCKET_REGION == "ap-northeast-3"
    error_message = "The Lambda must build its S3 client for the backup region"
  }

  assert {
    condition     = one(aws_lambda_function.export.architectures) == "arm64" && aws_lambda_function.export.runtime == "provided.al2023"
    error_message = "The Lambda must match the other Go functions (arm64, provided.al2023)"
  }
}

run "daily_schedule_in_tokyo_time" {
  command = plan

  assert {
    condition     = aws_scheduler_schedule.export.schedule_expression == "cron(0 3 * * ? *)" && aws_scheduler_schedule.export.schedule_expression_timezone == "Asia/Tokyo"
    error_message = "The export must run daily at 03:00 JST by default"
  }
}

run "alarm_created_only_when_enabled" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.export_errors) == 1
    error_message = "enable_alarm = true must create the failure alarm"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.export_errors[0].threshold == 1
    error_message = "A single failed run must alarm"
  }
}

run "alarm_absent_when_disabled" {
  command = plan

  variables {
    enable_alarm    = false
    alarm_topic_arn = ""
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.export_errors) == 0
    error_message = "enable_alarm = false must not create the alarm"
  }
}

run "rejects_retention_longer_than_90_days" {
  command = plan

  variables {
    retention_days = 365
  }

  expect_failures = [var.retention_days]
}

run "rejects_unknown_lock_mode" {
  command = plan

  variables {
    object_lock_mode = "NONE"
  }

  expect_failures = [var.object_lock_mode]
}

run "rejects_backup_in_source_region" {
  command = plan

  variables {
    backup_region = "ap-northeast-1"
  }

  expect_failures = [var.backup_region]
}

run "completion_freshness" {
  command = plan
  assert {
    condition     = aws_cloudwatch_log_metric_filter.completed[0].pattern == "{ $.msg = \"content backup completed\" }"
    error_message = "Only the actual structured completion message counts as success."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.freshness[0].evaluation_periods == 26 && aws_cloudwatch_metric_alarm.freshness[0].datapoints_to_alarm == 26 && aws_cloudwatch_metric_alarm.freshness[0].threshold == 1 && !aws_cloudwatch_metric_alarm.freshness[0].actions_enabled
    error_message = "Initial deployment must observe 26 hourly buckets with notifications disabled until the first success."
  }
  assert {
    condition     = anytrue([for q in aws_cloudwatch_metric_alarm.freshness[0].metric_query : q.expression == "FILL(completed, 0)" && q.return_data])
    error_message = "Missing success metrics must explicitly become zeros."
  }
}
run "completion_freshness_notifications_opt_in" {
  command = plan
  variables { freshness_alarm_actions_enabled = true }
  assert {
    condition     = aws_cloudwatch_metric_alarm.freshness[0].actions_enabled && aws_cloudwatch_metric_alarm.freshness[0].alarm_actions == toset([var.alarm_topic_arn])
    error_message = "After first success, notifications must use the existing SNS topic."
  }
}
run "completion_freshness_disabled" {
  command = plan
  variables { enable_alarm = false }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.freshness) == 0 && length(aws_cloudwatch_log_metric_filter.completed) == 0
    error_message = "DEV default must not create paid monitoring resources."
  }
}
