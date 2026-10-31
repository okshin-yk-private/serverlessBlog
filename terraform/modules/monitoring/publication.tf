# Reuse the existing SNS topic. State transitions notify once; missing idle
# CodeBuild/SQS metrics are not an incident. No new IAM or EventBridge targets.
resource "aws_cloudwatch_metric_alarm" "codebuild_failures" {
  count               = var.enable_alarms && var.codebuild_project_name != "" ? 1 : 0
  alarm_name          = "${var.project_name}-publish-failures-${var.environment}"
  alarm_description   = "Publishing CodeBuild client failure or timeout. Inspect build logs and desired/deployed revision; FAULT and intentional STOPPED are not covered by FailedBuilds."
  namespace           = "AWS/CodeBuild"
  metric_name         = "FailedBuilds"
  dimensions          = { ProjectName = var.codebuild_project_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "sitebuild_dlq" {
  count               = var.enable_alarms && var.sitebuild_dlq_name != "" ? 1 : 0
  alarm_name          = "${var.project_name}-reconcile-dlq-${var.environment}"
  alarm_description   = "CodeBuild completion event could not reach reconciliation. Inspect DLQ before redrive; periodic reconciliation may already have recovered state."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = var.sitebuild_dlq_name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]
  tags                = var.tags
}
