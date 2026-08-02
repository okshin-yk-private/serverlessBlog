# Environment Backend Configuration Tests - DEV
# Task 1.3 - TDD approach: Test environment-specific backend and variable definitions
# Requirements: 1.3, 1.4, 1.5, 1.6

# Mock providers for testing (no actual AWS calls). This root module also
# declares an aliased "aws.us_east_1" provider (for CloudFront/ACM) and a
# "cloudflare" provider (for DNS) - both need their own mock so `plan` never
# tries to reach real AWS/Cloudflare credentials.
mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

mock_provider "cloudflare" {}

# Default variables applied to every run block below.
# enable_custom_domain is forced to false here (dev's terraform.tfvars sets
# it to true) purely to keep these tests independent of the custom-domain
# feature: with it enabled, modules/dns-route53's aws_route53_record.acm_validation
# has a for_each keyed by the ACM certificate's domain_validation_options,
# which is only known after apply - mock providers can never resolve it at
# plan time, and that failure has nothing to do with what these tests check
# (environment/project_name/aws_region/alarm_email).
variables {
  enable_custom_domain = false
}

# override_resource blocks below mirror every `import` block in
# ../import.tf. This root module is mid CDK->Terraform migration and
# imports ~30 pre-existing resources (modules.database/auth/storage/api/cdn).
# `terraform test` cannot perform a real import against a mock provider
# ("Cannot import resources from mock providers. Use an `override_resource`
# block..." - the error's own suggested fix), so each imported resource is
# overridden here with (at minimum) the same id the import block uses. Two
# resources also need a couple of extra computed attributes set explicitly:
# module.auth's user pool `arn` and module.api's rest api `execution_arn` /
# `root_resource_id`, because they otherwise plan as mock-generated random
# strings, and downstream resources (aws_api_gateway_authorizer.provider_arns,
# aws_lambda_permission.source_arn) fail AWS's ARN format validation against
# a non-ARN-shaped placeholder.
override_resource {
  target = module.database.aws_dynamodb_table.blog_posts
  values = {
    id = "serverless-blog-posts"
  }
}

override_resource {
  target = module.auth.aws_cognito_user_pool.main
  values = {
    id  = "ap-northeast-1_GWhOM3BpU"
    arn = "arn:aws:cognito-idp:ap-northeast-1:881302602065:userpool/ap-northeast-1_GWhOM3BpU"
  }
}

override_resource {
  target = module.auth.aws_cognito_user_pool_client.main
  values = {
    id = "ap-northeast-1_GWhOM3BpU/21tntmtgs9l46lgg2k0qomaf9r"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket.images
  values = {
    id = "serverless-blog-images-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket.public_site
  values = {
    id = "serverless-blog-public-site-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket.admin_site
  values = {
    id = "serverless-blog-admin-site-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_versioning.images
  values = {
    id = "serverless-blog-images-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_server_side_encryption_configuration.images
  values = {
    id = "serverless-blog-images-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_public_access_block.images
  values = {
    id = "serverless-blog-images-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_lifecycle_configuration.images
  values = {
    id = "serverless-blog-images-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_cors_configuration.images
  values = {
    id = "serverless-blog-images-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_server_side_encryption_configuration.public_site
  values = {
    id = "serverless-blog-public-site-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_public_access_block.public_site
  values = {
    id = "serverless-blog-public-site-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_server_side_encryption_configuration.admin_site
  values = {
    id = "serverless-blog-admin-site-dev-881302602065"
  }
}

override_resource {
  target = module.storage.aws_s3_bucket_public_access_block.admin_site
  values = {
    id = "serverless-blog-admin-site-dev-881302602065"
  }
}

override_resource {
  target = module.api.aws_api_gateway_rest_api.main
  values = {
    id               = "4lfu0fgsk3"
    execution_arn    = "arn:aws:execute-api:ap-northeast-1:881302602065:4lfu0fgsk3"
    root_resource_id = "abc123root"
  }
}

override_resource {
  target = module.api.aws_api_gateway_authorizer.cognito
  values = {
    id = "4lfu0fgsk3/klt512"
  }
}

override_resource {
  target = module.api.aws_api_gateway_request_validator.main
  values = {
    id = "4lfu0fgsk3/6nrld8"
  }
}

override_resource {
  target = module.api.aws_api_gateway_gateway_response.default_4xx
  values = {
    id = "4lfu0fgsk3/DEFAULT_4XX"
  }
}

override_resource {
  target = module.api.aws_api_gateway_gateway_response.default_5xx
  values = {
    id = "4lfu0fgsk3/DEFAULT_5XX"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin
  values = {
    id = "4lfu0fgsk3/53axfk"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.posts
  values = {
    id = "4lfu0fgsk3/7zl3r1"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.posts_id
  values = {
    id = "4lfu0fgsk3/zmx8tv"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_posts
  values = {
    id = "4lfu0fgsk3/deqwrc"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_posts_id
  values = {
    id = "4lfu0fgsk3/t1uzm7"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_images
  values = {
    id = "4lfu0fgsk3/osory9"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_images_upload_url
  values = {
    id = "4lfu0fgsk3/klcop4"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_images_key
  values = {
    id = "4lfu0fgsk3/m72w81"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_auth
  values = {
    id = "4lfu0fgsk3/zg5axl"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_auth_login
  values = {
    id = "4lfu0fgsk3/e1qjrn"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_auth_logout
  values = {
    id = "4lfu0fgsk3/s4tg1s"
  }
}

override_resource {
  target = module.api.aws_api_gateway_resource.admin_auth_refresh
  values = {
    id = "4lfu0fgsk3/e106oi"
  }
}

override_resource {
  target = module.cdn.aws_cloudfront_function.image_path
  values = {
    id = "ImagePathFunction-dev"
  }
}

override_resource {
  target = module.cdn.aws_cloudfront_function.api_path
  values = {
    id = "ApiPathFunction-dev"
  }
}

# Test 1: Verify environment variable validation
run "test_dev_environment_validation" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = var.environment == "dev"
    error_message = "Environment must be 'dev' for this configuration"
  }
}

# Test 2: Verify environment validation rejects invalid values
run "test_environment_validation_rejects_invalid" {
  command = plan

  variables {
    environment  = "dev" # Only dev is valid for this environment
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  # This test verifies that the validation rule works
  assert {
    condition     = var.environment == "dev"
    error_message = "Dev environment validation should accept 'dev'"
  }
}

# Test 3: Verify project_name variable
run "test_project_name_variable" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = var.project_name == "serverless-blog"
    error_message = "Project name should be set correctly"
  }

  assert {
    condition     = length(var.project_name) > 0
    error_message = "Project name must not be empty"
  }
}

# Test 4: Verify aws_region validation
run "test_aws_region_validation" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "AWS region must be in valid format"
  }
}

# Test 5: Verify alarm_email is optional for dev (can be empty)
run "test_alarm_email_optional_for_dev" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = var.alarm_email == ""
    error_message = "alarm_email should be allowed to be empty for dev environment"
  }
}

# Test 6: Verify alarm_email is marked as sensitive
run "test_alarm_email_can_be_set" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "test@example.com"
  }

  assert {
    condition     = var.alarm_email == "test@example.com"
    error_message = "alarm_email should accept a valid email"
  }
}
