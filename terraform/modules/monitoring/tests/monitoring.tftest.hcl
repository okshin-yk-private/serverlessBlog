# Monitoring Module Tests
# TDD: Tests to validate monitoring module functionality
# Requirements: 8.1, 8.2, 8.3, 8.4, 8.5

# Mock provider for testing without AWS credentials
mock_provider "aws" {}

variables {
  environment           = "prd"
  project_name          = "serverless-blog"
  alarm_email           = "test@example.com"
  lambda_function_names = ["createPost", "getPost"]
  dynamodb_table_names  = ["BlogPosts"]
  api_gateway_name      = "BlogApi"
  api_gateway_stage     = "prd"
  enable_alarms         = true
  tags                  = {}
}

# Test 1: Verify SNS topic is created when alarms are enabled
run "verify_sns_topic_created" {
  command = plan

  assert {
    condition     = length(aws_sns_topic.alarms) == 1
    error_message = "SNS topic must be created when alarms are enabled"
  }

  assert {
    condition     = aws_sns_topic.alarms[0].display_name == "Blog Platform Alarms"
    error_message = "SNS topic must have correct display name"
  }
}

# Test 2: Verify the aggregated Lambda error alarm is created
# Requirement 8.x: per-function alarms were consolidated into a single
# metric-math alarm (lambda_errors_all) that sums Errors across all
# functions, for cost optimization (see main.tf).
run "verify_lambda_error_alarms" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_errors_all) == 1
    error_message = "Aggregated Lambda error alarm must be created"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_errors_all[0].threshold == 5
    error_message = "Aggregated Lambda error threshold must be 5"
  }
}

# Test 3: Verify the aggregated Lambda duration alarm is created with correct threshold
run "verify_lambda_duration_alarms" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_duration_all) == 1
    error_message = "Aggregated Lambda duration alarm must be created"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_duration_all[0].threshold == 10000
    error_message = "Aggregated Lambda duration threshold must be 10000ms"
  }
}

# Test 4: Verify DynamoDB throttle alarms are created
run "verify_dynamodb_throttle_alarms" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dynamodb_read_throttles) == 1
    error_message = "DynamoDB read throttle alarm must be created"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.dynamodb_write_throttles) == 1
    error_message = "DynamoDB write throttle alarm must be created"
  }
}

# Test 5: Verify API Gateway alarms are created with correct thresholds
run "verify_api_gateway_alarms" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_4xx_errors) == 1
    error_message = "API Gateway 4XX error alarm must be created"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_4xx_errors[0].threshold == 10
    error_message = "API Gateway 4XX error threshold must be 10"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_5xx_errors[0].threshold == 5
    error_message = "API Gateway 5XX error threshold must be 5"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.api_latency[0].threshold == 2000
    error_message = "API Gateway latency threshold must be 2000ms"
  }
}

# Test 6: Verify CloudWatch dashboard is created
run "verify_dashboard_created" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_dashboard.main) == 1
    error_message = "CloudWatch dashboard must be created when alarms are enabled"
  }

  assert {
    condition     = aws_cloudwatch_dashboard.main[0].dashboard_name == "BlogPlatform-Monitoring"
    error_message = "CloudWatch dashboard must have correct name"
  }
}

# Test 7: Verify alarms are not created when disabled
run "verify_alarms_disabled" {
  command = plan

  variables {
    enable_alarms = false
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_errors_all) == 0
    error_message = "Lambda alarms must not be created when disabled"
  }

  assert {
    condition     = length(aws_sns_topic.alarms) == 0
    error_message = "SNS topic must not be created when alarms are disabled"
  }

  assert {
    condition     = length(aws_cloudwatch_dashboard.main) == 0
    error_message = "Dashboard must not be created when alarms are disabled"
  }
}

run "publication_signals" {
  command = plan
  variables {
    codebuild_project_name = "blog-astro-build-prd"
    sitebuild_dlq_name     = "blog-astro-build-prd-reconcile-dlq"
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.codebuild_failures[0].dimensions.ProjectName == "blog-astro-build-prd" && aws_cloudwatch_metric_alarm.codebuild_failures[0].threshold == 1 && aws_cloudwatch_metric_alarm.codebuild_failures[0].treat_missing_data == "notBreaching"
    error_message = "A failed build must notify, but an idle project must not."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.sitebuild_dlq[0].dimensions.QueueName == "blog-astro-build-prd-reconcile-dlq" && aws_cloudwatch_metric_alarm.sitebuild_dlq[0].datapoints_to_alarm == 2 && aws_cloudwatch_metric_alarm.sitebuild_dlq[0].period == 300
    error_message = "Only persistent DLQ backlog should notify."
  }
}
run "publication_signals_disabled" {
  command = plan
  variables {
    enable_alarms          = false
    codebuild_project_name = "blog-astro-build-dev"
    sitebuild_dlq_name     = "blog-astro-build-dev-reconcile-dlq"
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.codebuild_failures) == 0 && length(aws_cloudwatch_metric_alarm.sitebuild_dlq) == 0
    error_message = "Disabled monitoring must not create publication alarms."
  }
}
run "publication_signals_opt_in" {
  command = plan
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.codebuild_failures) == 0 && length(aws_cloudwatch_metric_alarm.sitebuild_dlq) == 0
    error_message = "Other module callers must not get alarms for nonexistent projects/queues."
  }
}

run "publication_observability_reuses_existing_dashboard" {
  command = plan
  variables {
    enable_publication_observability = true
    codebuild_project_name           = "blog-astro-build-prd"
    publication_lambda_log_groups    = ["/aws/lambda/blog-create-post-go", "/aws/lambda/blog-reconcile-build-post-go"]
  }
  assert {
    condition     = jsondecode(aws_cloudwatch_dashboard.main[0].dashboard_body).start == "-PT30H" && length(aws_cloudwatch_dashboard.main) == 1
    error_message = "Reuse one dashboard with a bounded window covering a daily backup."
  }
  assert {
    condition     = length([for widget in jsondecode(aws_cloudwatch_dashboard.main[0].dashboard_body).widgets : widget if widget.type == "log"]) == 4
    error_message = "Only four scoped log queries should execute when the dashboard refreshes."
  }
  assert {
    condition     = alltrue([for widget in jsondecode(aws_cloudwatch_dashboard.main[0].dashboard_body).widgets : !strcontains(jsonencode(widget), "SOURCE logGroups")])
    error_message = "Never use account-wide prefix discovery for these queries."
  }
  assert {
    condition     = strcontains(local.publication_timing_query, "site-public-confirmed") && strcontains(local.publication_timing_query, "min(o.confirmedAtMs)") && strcontains(local.publication_timing_query, "(confirmedAtMs - requestedAtMs) / 1000")
    error_message = "Measure explicit first public confirmation, not successful CodeBuild completion."
  }
  assert {
    condition     = strcontains(local.publication_timing_query, "| display buildId, contentRevision, releaseRevision, lastEvent, requestedAtMs, confirmedAtMs, saveToPublicSeconds") && !strcontains(local.publication_timing_query, "| fields buildId")
    error_message = "Display aggregated columns without redefining ephemeral fields."
  }
  assert {
    condition     = strcontains(local.admin_latency_query, "resourcePath like /^\\/admin\\//") && !strcontains(local.admin_latency_query, "sourceIp") && !strcontains(local.admin_errors_query, "userAgent")
    error_message = "API widgets must be admin-scoped aggregates without personal data columns."
  }
  assert {
    condition     = strcontains(local.admin_latency_query, "toNumber(responseLatency)") && strcontains(local.admin_errors_query, "toNumber(status)")
    error_message = "API access-log numeric strings must be converted before aggregation/filtering."
  }
  assert {
    condition     = alltrue([for metric in jsondecode(aws_cloudwatch_dashboard.main[0].dashboard_body).widgets[2].properties.metrics : length(metric) == 4 && metric[2] == "ProjectName"])
    error_message = "CodeBuild metrics must use project-level dimensions, not revision/build IDs."
  }
  assert {
    condition     = jsondecode(aws_cloudwatch_dashboard.main[0].dashboard_body).widgets[6].y == 27
    error_message = "Existing Lambda widgets must move below the new section without overlapping."
  }
}

run "publication_observability_opt_in" {
  command = plan
  assert {
    condition     = length([for widget in jsondecode(aws_cloudwatch_dashboard.main[0].dashboard_body).widgets : widget if widget.type == "log"]) == 0 && jsondecode(aws_cloudwatch_dashboard.main[0].dashboard_body).start == "-PT3H"
    error_message = "Existing callers must not acquire log queries by default."
  }
}
