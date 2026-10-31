# Completion is logged only after the manifest has been written successfully.
# A fixed per-environment metric avoids per-snapshot high-cardinality charges.
resource "aws_cloudwatch_log_metric_filter" "completed" {
  count          = var.enable_alarm ? 1 : 0
  name           = "${local.function_name}-completed"
  log_group_name = aws_cloudwatch_log_group.export.name
  pattern        = "{ $.msg = \"content backup completed\" }"
  metric_transformation {
    name      = "Completed"
    namespace = "${var.project_name}/ContentBackup/${var.environment}"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "freshness" {
  count               = var.enable_alarm ? 1 : 0
  alarm_name          = "${local.function_name}-stale"
  alarm_description   = "No completion log in 26 hourly evaluation buckets (evaluated hourly). Not proof of S3 readability or restorability. See docs/reliability-operations.md."
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  evaluation_periods  = 26
  datapoints_to_alarm = 26
  treat_missing_data  = "breaching"
  actions_enabled     = var.freshness_alarm_actions_enabled
  alarm_actions       = [var.alarm_topic_arn]
  metric_query {
    id          = "completed"
    return_data = false
    metric {
      namespace   = aws_cloudwatch_log_metric_filter.completed[0].metric_transformation[0].namespace
      metric_name = "Completed"
      period      = 3600
      stat        = "Sum"
      unit        = "Count"
    }
  }
  metric_query {
    id          = "missing"
    expression  = "FILL(completed, 0)"
    label       = "Hourly completed backups (missing is zero)"
    return_data = true
  }
  tags = var.tags
}
