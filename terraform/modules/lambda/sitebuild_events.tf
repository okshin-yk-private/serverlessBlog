# Durable site-build completion notification and periodic reconciliation.

resource "aws_sqs_queue" "sitebuild_reconcile_dlq" {
  count                     = var.codebuild_project_arn != "" ? 1 : 0
  name                      = "${var.codebuild_project_name}-reconcile-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = local.common_tags
}

resource "aws_cloudwatch_event_rule" "codebuild_state_change" {
  count       = var.codebuild_project_arn != "" ? 1 : 0
  name        = "${var.codebuild_project_name}-state"
  description = "Reconcile durable site-build state after CodeBuild state changes"
  event_pattern = jsonencode({
    source        = ["aws.codebuild"]
    "detail-type" = ["CodeBuild Build State Change"]
    detail = {
      "project-name" = [var.codebuild_project_name]
    }
  })
  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "sitebuild_reconciler" {
  count     = var.codebuild_project_arn != "" ? 1 : 0
  rule      = aws_cloudwatch_event_rule.codebuild_state_change[0].name
  target_id = "sitebuild-reconciler"
  arn       = aws_lambda_function.reconcile_build_post.arn

  dead_letter_config {
    arn = aws_sqs_queue.sitebuild_reconcile_dlq[0].arn
  }

  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 6
  }
}

data "aws_iam_policy_document" "sitebuild_reconcile_dlq" {
  count = var.codebuild_project_arn != "" ? 1 : 0
  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.sitebuild_reconcile_dlq[0].arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.codebuild_state_change[0].arn]
    }
  }
}

resource "aws_sqs_queue_policy" "sitebuild_reconcile_dlq" {
  count     = var.codebuild_project_arn != "" ? 1 : 0
  queue_url = aws_sqs_queue.sitebuild_reconcile_dlq[0].id
  policy    = data.aws_iam_policy_document.sitebuild_reconcile_dlq[0].json
}

resource "aws_lambda_permission" "sitebuild_reconcile_eventbridge" {
  count         = var.codebuild_project_arn != "" ? 1 : 0
  statement_id  = "AllowCodeBuildEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reconcile_build_post.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.codebuild_state_change[0].arn
}

resource "aws_iam_role" "sitebuild_reconcile_scheduler" {
  count = var.codebuild_project_arn != "" ? 1 : 0
  name  = "${var.codebuild_project_name}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "sitebuild_reconcile_scheduler" {
  count = var.codebuild_project_arn != "" ? 1 : 0
  name  = "invoke-sitebuild-reconciler"
  role  = aws_iam_role.sitebuild_reconcile_scheduler[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.reconcile_build_post.arn
    }]
  })
}

resource "aws_scheduler_schedule" "sitebuild_reconcile" {
  #checkov:skip=CKV_AWS_297:No TargetInput payload is configured; a CMK only double-encrypts target payloads, while AWS-owned keys already protect all schedule metadata.
  count               = var.codebuild_project_arn != "" ? 1 : 0
  name                = "${var.codebuild_project_name}-reconcile"
  schedule_expression = "rate(5 minutes)"
  state               = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.reconcile_build_post.arn
    role_arn = aws_iam_role.sitebuild_reconcile_scheduler[0].arn
    retry_policy {
      maximum_event_age_in_seconds = 300
      maximum_retry_attempts       = 2
    }
  }
}
