# The imported pool still references this CDK-created role, but IAM returned
# NoSuchEntity during the 2026-09-23 passkey rollout. Keep the original name/ARN
# so restoring the prerequisite does not change the pool's MFA configuration.
# SSM avoids depending on a pool update before its missing role is restored.
data "aws_ssm_parameter" "legacy_cognito_pool_id" {
  name = "/serverless-blog/dev/cognito/user-pool-id"
}

resource "aws_iam_role" "legacy_cognito_sms" {
  name = "ServerlessBlogAuthStack-BlogUserPoolsmsRole9F911302-JN1F0gtm6p5d"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cognito-idp.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "sts:ExternalId"    = "ServerlessBlogAuthStackBlogUserPoolCB25D22E"
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
        ArnEquals = {
          "aws:SourceArn" = "arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${nonsensitive(data.aws_ssm_parameter.legacy_cognito_pool_id.value)}"
        }
      }
    }]
  })
  tags = local.common_tags
}

resource "aws_iam_role_policy" "legacy_cognito_sms" {
  name = "cognito-sms-publish"
  role = aws_iam_role.legacy_cognito_sms.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sns:Publish"
      Resource  = "*" # Direct SMS publishing has no SNS topic ARN to scope to.
      Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } }
    }]
  })
}
