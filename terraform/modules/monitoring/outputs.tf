# Monitoring Module Outputs
# Requirements: 8.1

output "alarm_topic_arn" {
  value       = var.enable_alarms ? aws_sns_topic.alarms[0].arn : ""
  description = "Alarm SNS topic ARN"
}

output "alarm_topic_name" {
  value       = var.enable_alarms ? aws_sns_topic.alarms[0].name : ""
  description = "Alarm SNS topic name"
}

output "dashboard_name" {
  value       = var.enable_alarms ? aws_cloudwatch_dashboard.main[0].dashboard_name : ""
  description = "CloudWatch dashboard name"
}

output "dashboard_arn" {
  value       = var.enable_alarms ? aws_cloudwatch_dashboard.main[0].dashboard_arn : ""
  description = "CloudWatch dashboard ARN"
}

output "lambda_errors_alarm_arn" {
  value       = var.enable_alarms ? aws_cloudwatch_metric_alarm.lambda_errors_all[0].arn : ""
  description = "Aggregated Lambda errors alarm ARN"
}

output "lambda_duration_alarm_arn" {
  value       = var.enable_alarms ? aws_cloudwatch_metric_alarm.lambda_duration_all[0].arn : ""
  description = "Aggregated Lambda duration alarm ARN"
}

output "lambda_throttles_alarm_arn" {
  value       = var.enable_alarms ? aws_cloudwatch_metric_alarm.lambda_throttles_all[0].arn : ""
  description = "Aggregated Lambda throttles alarm ARN"
}

output "dynamodb_read_throttle_alarm_arns" {
  value       = { for k, v in aws_cloudwatch_metric_alarm.dynamodb_read_throttles : k => v.arn }
  description = "Map of DynamoDB table names to their read throttle alarm ARNs"
}

output "dynamodb_write_throttle_alarm_arns" {
  value       = { for k, v in aws_cloudwatch_metric_alarm.dynamodb_write_throttles : k => v.arn }
  description = "Map of DynamoDB table names to their write throttle alarm ARNs"
}

output "api_4xx_alarm_arn" {
  value       = var.enable_alarms ? aws_cloudwatch_metric_alarm.api_4xx_errors[0].arn : ""
  description = "API Gateway 4XX error alarm ARN"
}

output "api_5xx_alarm_arn" {
  value       = var.enable_alarms ? aws_cloudwatch_metric_alarm.api_5xx_errors[0].arn : ""
  description = "API Gateway 5XX error alarm ARN"
}

output "api_latency_alarm_arn" {
  value       = var.enable_alarms ? aws_cloudwatch_metric_alarm.api_latency[0].arn : ""
  description = "API Gateway latency alarm ARN"
}
