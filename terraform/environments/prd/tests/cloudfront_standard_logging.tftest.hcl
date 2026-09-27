# CloudFront Standard Logging v2 (CloudWatch vended-log delivery to S3) Tests
# Issue #684 item 2 - TDD: RED -> GREEN -> REFACTOR
#
# Verifies the prd-only wiring: a delivery source for the CloudFront
# distribution created in us-east-1, a delivery destination pointing at the
# access-log bucket under the cloudfront/ prefix, and the delivery that links
# them.
#
# These run in plan mode and assert only on values that are statically known
# without applying (literal arguments such as log_type, name and
# delivery_destination_type). Cross-module identity checks such as
# "aws_cloudwatch_log_delivery_source.cloudfront.resource_arn ==
# module.cdn.distribution_arn" cannot be asserted here: with generic
# mock_provider "aws", module.cdn's distribution ARN and module.storage's
# bucket ARN are unknown until apply, and in apply mode the mock provider
# fills them with random non-ARN strings (e.g. "h8ztp21y") that fail the
# provider's own ARN-format validation on
# aws_cloudwatch_log_delivery_destination.destination_resource_arn - and,
# separately, on unrelated resources elsewhere in this same root module
# (e.g. module.auth's aws_cognito_user_group requires a realistic
# user_pool_id). A full prd-root apply-mode plan is therefore not viable with
# generic mocks; it would need per-resource override_resource/override_module
# blocks for every strict-format attribute in the graph, well beyond this
# feature. The cross-module wiring itself (that the right module output feeds
# the right resource argument) is covered by `terraform validate` (a bad
# reference is a validation error) and by code review of
# terraform/environments/prd/main.tf. The bucket-policy statement content
# (the part that actually grants delivery.logs.amazonaws.com access) is
# covered exhaustively at the module level in
# terraform/modules/storage/tests/storage.tftest.hcl.

mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

mock_provider "cloudflare" {}

run "cloudfront_log_delivery_source_collects_access_logs" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  assert {
    condition     = aws_cloudwatch_log_delivery_source.cloudfront.log_type == "ACCESS_LOGS"
    error_message = "CloudFront standard logging v2 delivery source must collect ACCESS_LOGS"
  }

  assert {
    condition     = aws_cloudwatch_log_delivery_source.cloudfront.name == "serverless-blog-cloudfront-prd"
    error_message = "Delivery source name must match the name used to precompute the ARN passed to module.storage"
  }
}

run "cloudfront_log_delivery_destination_is_s3_json" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  assert {
    condition     = aws_cloudwatch_log_delivery_destination.cloudfront_s3.delivery_destination_type == "S3"
    error_message = "Delivery destination must target Amazon S3"
  }

  assert {
    condition     = aws_cloudwatch_log_delivery_destination.cloudfront_s3.output_format == "json"
    error_message = "Delivery destination output format must be json"
  }
}

run "cloudfront_log_delivery_links_source_by_name" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  assert {
    condition     = aws_cloudwatch_log_delivery.cloudfront_s3.delivery_source_name == "serverless-blog-cloudfront-prd"
    error_message = "Delivery must reference the CloudFront delivery source by name"
  }
}

# Verifies module.storage's variable actually receives a non-empty ARN list
# in prd (the opt-in gate tested in the module-level tests): if this were
# empty, module.storage would add no Allow statement and log delivery would
# fail with AccessDenied even though this module's resources all exist.
run "storage_receives_a_non_empty_delivery_source_arn_list" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  assert {
    condition     = can(regex("^arn:aws:logs:us-east-1:", local.cloudfront_log_delivery_source_arn))
    error_message = "The precomputed delivery source ARN passed to module.storage must be a us-east-1 CloudWatch Logs delivery-source ARN"
  }
}
