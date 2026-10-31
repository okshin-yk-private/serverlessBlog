# CloudFront global metrics and their SNS actions must be in us-east-1.
#trivy:ignore:AVD-AWS-0095 Non-sensitive operational alerts; same exception as existing operational SNS topic.
resource "aws_sns_topic" "edge_alarms" {
  provider = aws.us_east_1
  #checkov:skip=CKV_AWS_26:Operational alarm metadata only; TLS is enforced below.
  name = "BlogPlatform-Edge-Alarms"
}

resource "aws_sns_topic_policy" "edge_alarms" {
  provider = aws.us_east_1
  arn      = aws_sns_topic.edge_alarms.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudWatch"
      Effect    = "Allow"
      Principal = { Service = "cloudwatch.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.edge_alarms.arn
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
      }, {
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.edge_alarms.arn
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_sns_topic_subscription" "edge_email" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.edge_alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "public_5xx" {
  provider            = aws.us_east_1
  alarm_name          = "serverless-blog-public-5xx"
  alarm_description   = "CloudFront including edge routing: >=1% 5xx with >=10 requests/5min. Inspect access-log detailed result types."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.edge_alarms.arn]
  metric_query {
    id          = "failure"
    expression  = "IF(requests>=10,errors,0)"
    return_data = true
  }
  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/CloudFront"
      metric_name = "Requests"
      period      = 300
      stat        = "Sum"
      dimensions  = { DistributionId = module.cdn.distribution_id, Region = "Global" }
    }
  }
  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/CloudFront"
      metric_name = "5xxErrorRate"
      period      = 300
      stat        = "Average"
      dimensions  = { DistributionId = module.cdn.distribution_id, Region = "Global" }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "public_traffic" {
  provider            = aws.us_east_1
  alarm_name          = "serverless-blog-public-traffic"
  alarm_description   = "Sustained traffic above the Oct 2026 baseline. Notification only; inspect paths before blocking."
  namespace           = "AWS/CloudFront"
  metric_name         = "Requests"
  statistic           = "Sum"
  period              = 300
  comparison_operator = "GreaterThanThreshold"
  threshold           = 1000
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.edge_alarms.arn]
  dimensions          = { DistributionId = module.cdn.distribution_id, Region = "Global" }
}
