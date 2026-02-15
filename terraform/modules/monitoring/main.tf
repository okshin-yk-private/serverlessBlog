# Monitoring Module - CloudWatch Alarms and Dashboard
# Requirements: 8.1, 8.2, 8.3, 8.4, 8.5

locals {
  alarm_name_prefix = var.project_name
  common_tags = merge(var.tags, {
    Module      = "monitoring"
    Environment = var.environment
    Project     = var.project_name
  })
}

# =============================================================================
# SNS Topic for Alarm Notifications
# =============================================================================

#trivy:ignore:AVD-AWS-0095 Alarm notifications contain non-sensitive operational data; CMK adds cost
resource "aws_sns_topic" "alarms" {
  count = var.enable_alarms ? 1 : 0

  name         = "BlogPlatform-Alarms"
  display_name = "Blog Platform Alarms"

  tags = local.common_tags
}

# SSL enforcement policy for SNS topic
resource "aws_sns_topic_policy" "alarms_ssl" {
  count = var.enable_alarms ? 1 : 0

  arn = aws_sns_topic.alarms[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "SSLPolicy"
    Statement = [
      {
        Sid       = "AllowPublishThroughSSLOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alarms[0].arn
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# Email subscription for alarm notifications
resource "aws_sns_topic_subscription" "email" {
  count = var.enable_alarms ? 1 : 0

  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# =============================================================================
# Lambda CloudWatch Alarms
# =============================================================================

# Lambda Error Rate Alarms
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.enable_alarms ? toset(var.lambda_function_names) : toset([])

  alarm_name          = "${each.value}-ErrorRate"
  alarm_description   = "Lambda function error rate is too high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# Lambda Duration Alarms
resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  for_each = var.enable_alarms ? toset(var.lambda_function_names) : toset([])

  alarm_name          = "${each.value}-Duration"
  alarm_description   = "Lambda function duration is too high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300 # 5 minutes
  statistic           = "Average"
  threshold           = 10000 # 10 seconds

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# Lambda Throttle Alarms
resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each = var.enable_alarms ? toset(var.lambda_function_names) : toset([])

  alarm_name          = "${each.value}-Throttles"
  alarm_description   = "Lambda function is being throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# =============================================================================
# DynamoDB CloudWatch Alarms
# =============================================================================

# DynamoDB Read Throttle Alarms
resource "aws_cloudwatch_metric_alarm" "dynamodb_read_throttles" {
  for_each = var.enable_alarms ? toset(var.dynamodb_table_names) : toset([])

  alarm_name          = "${each.value}-ReadThrottles"
  alarm_description   = "DynamoDB table read throttles detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ReadThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    TableName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# DynamoDB Write Throttle Alarms
resource "aws_cloudwatch_metric_alarm" "dynamodb_write_throttles" {
  for_each = var.enable_alarms ? toset(var.dynamodb_table_names) : toset([])

  alarm_name          = "${each.value}-WriteThrottles"
  alarm_description   = "DynamoDB table write throttles detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "WriteThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 1

  dimensions = {
    TableName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# =============================================================================
# API Gateway CloudWatch Alarms
# =============================================================================

# API Gateway 4XX Error Alarm
resource "aws_cloudwatch_metric_alarm" "api_4xx_errors" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.api_gateway_name}-4XXError"
  alarm_description   = "API Gateway 4XX error rate is too high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "4XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 10 # 10 4XX errors in 5 minutes

  dimensions = {
    ApiName = var.api_gateway_name
    Stage   = var.api_gateway_stage
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# API Gateway 5XX Error Alarm
resource "aws_cloudwatch_metric_alarm" "api_5xx_errors" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.api_gateway_name}-5XXError"
  alarm_description   = "API Gateway 5XX error rate is too high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 5 # 5 5XX errors in 5 minutes

  dimensions = {
    ApiName = var.api_gateway_name
    Stage   = var.api_gateway_stage
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# API Gateway Latency Alarm
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.api_gateway_name}-Latency"
  alarm_description   = "API Gateway latency is too high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Latency"
  namespace           = "AWS/ApiGateway"
  period              = 300 # 5 minutes
  statistic           = "Average"
  threshold           = 2000 # 2 seconds

  dimensions = {
    ApiName = var.api_gateway_name
    Stage   = var.api_gateway_stage
  }

  alarm_actions = [aws_sns_topic.alarms[0].arn]

  tags = local.common_tags
}

# =============================================================================
# CloudWatch Dashboard
# =============================================================================

resource "aws_cloudwatch_dashboard" "main" {
  count = var.enable_alarms ? 1 : 0

  dashboard_name = "BlogPlatform-Monitoring"

  dashboard_body = jsonencode({
    widgets = concat(
      # Lambda Widgets
      flatten([
        for fn in var.lambda_function_names : [
          {
            type   = "metric"
            x      = 0
            y      = index(var.lambda_function_names, fn) * 6
            width  = 12
            height = 6
            properties = {
              title = "Lambda: ${fn} - Errors & Invocations"
              metrics = [
                ["AWS/Lambda", "Errors", "FunctionName", fn, { stat = "Sum", period = 300 }],
                ["AWS/Lambda", "Invocations", "FunctionName", fn, { stat = "Sum", period = 300 }]
              ]
              region = "ap-northeast-1"
            }
          },
          {
            type   = "metric"
            x      = 12
            y      = index(var.lambda_function_names, fn) * 6
            width  = 12
            height = 6
            properties = {
              title = "Lambda: ${fn} - Duration & Throttles"
              metrics = [
                ["AWS/Lambda", "Duration", "FunctionName", fn, { stat = "Average", period = 300, yAxis = "left" }],
                ["AWS/Lambda", "Throttles", "FunctionName", fn, { stat = "Sum", period = 300, yAxis = "right" }]
              ]
              region = "ap-northeast-1"
            }
          }
        ]
      ]),
      # DynamoDB Widgets
      flatten([
        for table in var.dynamodb_table_names : [
          {
            type   = "metric"
            x      = 0
            y      = length(var.lambda_function_names) * 6 + index(var.dynamodb_table_names, table) * 6
            width  = 12
            height = 6
            properties = {
              title = "DynamoDB: ${table} - Throttles"
              metrics = [
                ["AWS/DynamoDB", "ReadThrottleEvents", "TableName", table, { stat = "Sum", period = 300 }],
                ["AWS/DynamoDB", "WriteThrottleEvents", "TableName", table, { stat = "Sum", period = 300 }]
              ]
              region = "ap-northeast-1"
            }
          }
        ]
      ]),
      # API Gateway Widgets
      [
        {
          type   = "metric"
          x      = 0
          y      = length(var.lambda_function_names) * 6 + length(var.dynamodb_table_names) * 6
          width  = 12
          height = 6
          properties = {
            title = "API Gateway: ${var.api_gateway_name} - Errors"
            metrics = [
              ["AWS/ApiGateway", "4XXError", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage, { stat = "Sum", period = 300 }],
              ["AWS/ApiGateway", "5XXError", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage, { stat = "Sum", period = 300 }]
            ]
            region = "ap-northeast-1"
          }
        },
        {
          type   = "metric"
          x      = 12
          y      = length(var.lambda_function_names) * 6 + length(var.dynamodb_table_names) * 6
          width  = 12
          height = 6
          properties = {
            title = "API Gateway: ${var.api_gateway_name} - Latency"
            metrics = [
              ["AWS/ApiGateway", "Latency", "ApiName", var.api_gateway_name, "Stage", var.api_gateway_stage, { stat = "Average", period = 300 }]
            ]
            region = "ap-northeast-1"
          }
        }
      ]
    )
  })
}
