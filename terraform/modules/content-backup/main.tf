# Content Backup Module
#
# Exports every post (drafts included) as Markdown, plus the categories, to an
# S3 bucket in another region once a day. PITR protects against mistakes in the
# source region; this copy covers loss of that region and deletion by someone
# holding admin credentials (COMPLIANCE mode). It does not survive closure of
# the AWS account itself. Images are not copied (the image bucket keeps
# noncurrent versions for 90 days).
#
# Layout and restore procedure: docs/content-backup.md

data "aws_caller_identity" "current" {}

locals {
  bucket_name   = "${var.project_name}-content-backup-${var.environment}-${data.aws_caller_identity.current.account_id}"
  function_name = "${var.project_name}-content-backup-${var.environment}"
  binary_name   = "posts-export_backup"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Module      = "content-backup"
    ManagedBy   = "terraform"
  })
}

#------------------------------------------------------------------------------
# Backup bucket (backup region)
#------------------------------------------------------------------------------

resource "aws_s3_bucket" "backup" {
  region              = var.backup_region
  bucket              = local.bucket_name
  object_lock_enabled = true
  force_destroy       = var.force_destroy

  lifecycle {
    prevent_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = local.bucket_name
    Type = "content-backup"
  })
}

resource "aws_s3_bucket_versioning" "backup" {
  region = var.backup_region
  bucket = aws_s3_bucket.backup.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "backup" {
  region = var.backup_region
  bucket = aws_s3_bucket.backup.id

  rule {
    default_retention {
      mode = var.object_lock_mode
      days = var.retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.backup]
}

# SSE-S3 rather than KMS: deleting or disabling a KMS key would make locked
# versions unreadable, which defeats the point of the lock.
#trivy:ignore:AVD-AWS-0132 SSE-S3 keeps locked backups readable without depending on a KMS key's lifecycle
resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  region = var.backup_region
  bucket = aws_s3_bucket.backup.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  region = var.backup_region
  bucket = aws_s3_bucket.backup.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Each snapshot is written under a new prefix, so current versions expire one
# day after their lock does. A locked version is never removed by lifecycle;
# expiration only places a delete marker, which `days` also cleans up later.
resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  region = var.backup_region
  bucket = aws_s3_bucket.backup.id

  rule {
    id     = "expire-snapshots"
    status = "Enabled"

    filter {}

    expiration {
      days = var.retention_days + 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.backup]
}

resource "aws_s3_bucket_policy" "backup" {
  region = var.backup_region
  bucket = aws_s3_bucket.backup.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # AWS FSBP S3.5: deny any request that does not use TLS.
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.backup.arn, "${aws_s3_bucket.backup.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        # Nothing here sets per-object retention or legal holds; everything uses
        # the bucket default. Denying them stops a leaked credential from
        # extending COMPLIANCE retention (up to 100 years, irreversible).
        Sid       = "DenyPerObjectRetentionChanges"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:PutObjectRetention", "s3:PutObjectLegalHold"]
        Resource  = "${aws_s3_bucket.backup.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.backup]
}

#------------------------------------------------------------------------------
# Export Lambda (source region)
#------------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "export" {
  name               = "${local.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "export_basic_execution" {
  role       = aws_iam_role.export.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "export_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.export.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# Read-only on the tables, PutObject only on the bucket: the role cannot
# delete, overwrite retention or change the bucket's lock configuration.
resource "aws_iam_role_policy" "export" {
  name = "${local.function_name}-policy"
  role = aws_iam_role.export.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ScanSourceTables"
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = [var.posts_table_arn, var.categories_table_arn]
      },
      {
        Sid      = "WriteSnapshots"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.backup.arn}/snapshots/*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "export" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.environment == "prd" ? 90 : 14
  tags              = local.common_tags
}

data "archive_file" "export" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.binary_name}.zip"
  output_file_mode = "0644"
}

resource "aws_lambda_function" "export" {
  function_name = local.function_name
  description   = "Daily Markdown export of posts and categories to the cross-region backup bucket (Go)"
  role          = aws_iam_role.export.arn

  filename         = data.archive_file.export.output_path
  source_code_hash = data.archive_file.export.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 120

  environment {
    variables = {
      TABLE_NAME            = var.posts_table_name
      CATEGORIES_TABLE_NAME = var.categories_table_name
      BACKUP_BUCKET_NAME    = aws_s3_bucket.backup.id
      BACKUP_BUCKET_REGION  = var.backup_region
    }
  }

  tracing_config {
    mode = var.enable_xray ? "Active" : "PassThrough"
  }

  depends_on = [aws_cloudwatch_log_group.export]
  tags       = local.common_tags
}

# A failed run is retried by Lambda's asynchronous invocation; each attempt
# writes a new prefix, and only a prefix with manifest.json is complete.
resource "aws_lambda_function_event_invoke_config" "export" {
  function_name                = aws_lambda_function.export.function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 3600
}

#------------------------------------------------------------------------------
# Daily schedule
#------------------------------------------------------------------------------

resource "aws_iam_role" "scheduler" {
  name = "${local.function_name}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "scheduler.amazonaws.com" }
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "scheduler" {
  name = "invoke-content-backup"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.export.arn
    }]
  })
}

resource "aws_scheduler_schedule" "export" {
  #checkov:skip=CKV_AWS_297:No TargetInput payload is configured; a CMK only double-encrypts target payloads, while AWS-owned keys already protect all schedule metadata.
  name                         = local.function_name
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.export.arn
    role_arn = aws_iam_role.scheduler.arn
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 2
    }
  }
}

#------------------------------------------------------------------------------
# Failure alarm
#------------------------------------------------------------------------------

# The account-wide Lambda error alarm needs more than 5 errors in 5 minutes, so
# a once-a-day failure would never reach it.
resource "aws_cloudwatch_metric_alarm" "export_errors" {
  count = var.enable_alarm ? 1 : 0

  alarm_name          = "${local.function_name}-errors"
  alarm_description   = "Content backup export failed. Snapshots without manifest.json are incomplete; see docs/content-backup.md."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 3600
  dimensions = {
    FunctionName = aws_lambda_function.export.function_name
  }

  alarm_actions = [var.alarm_topic_arn]
  tags          = local.common_tags
}
