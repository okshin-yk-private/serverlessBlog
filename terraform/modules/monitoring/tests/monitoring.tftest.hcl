# Monitoring Module Tests
# TDD: Tests to validate monitoring module functionality
# Requirements: 8.1, 8.2, 8.3, 8.4, 8.5

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

# Test 2: Verify Lambda error alarms are created for each function
run "verify_lambda_error_alarms" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_errors) == 2
    error_message = "Lambda error alarms must be created for each function"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_errors["createPost"].threshold == 1
    error_message = "Lambda error threshold must be 1"
  }
}

# Test 3: Verify Lambda duration alarms are created with correct threshold
run "verify_lambda_duration_alarms" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_duration) == 2
    error_message = "Lambda duration alarms must be created for each function"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_duration["createPost"].threshold == 10000
    error_message = "Lambda duration threshold must be 10000ms"
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
    condition     = length(aws_cloudwatch_metric_alarm.lambda_errors) == 0
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
