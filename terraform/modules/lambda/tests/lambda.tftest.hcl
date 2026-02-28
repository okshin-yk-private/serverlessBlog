# Lambda Module Tests - TDD
# Requirements: 4.1 - Go Lambda functions module implementation
#
# Test coverage:
# - 11 Lambda functions with correct configurations
# - ARM64 architecture and provided.al2023 runtime
# - Memory and timeout settings
# - Environment variables
# - X-Ray tracing (production only)

# Mock AWS provider with data source override for IAM policy document
mock_provider "aws" {
  override_data {
    target = data.aws_iam_policy_document.lambda_assume_role
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

# Mock archive provider (for dummy zip files)
mock_provider "archive" {}

# ======================
# Test Variables
# ======================

variables {
  environment = "dev"

  # DynamoDB table reference
  table_name = "blog-posts-table"
  table_arn  = "arn:aws:dynamodb:ap-northeast-1:123456789012:table/blog-posts-table"

  # S3 bucket reference
  bucket_name = "serverless-blog-images"
  bucket_arn  = "arn:aws:s3:::serverless-blog-images"

  # Cognito references
  user_pool_id        = "ap-northeast-1_example"
  user_pool_arn       = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_example"
  user_pool_client_id = "example-client-id"

  # CloudFront domain
  cloudfront_domain = "d1234567890.cloudfront.net"

  # X-Ray tracing
  enable_xray = false

  tags = {
    Project = "serverless-blog"
  }
}

# ======================
# Posts Domain Functions Tests
# ======================

# Test: Create Post Lambda Function
run "create_post_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.create_post.function_name == "blog-create-post-go"
    error_message = "Create Post function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.create_post.runtime == "provided.al2023"
    error_message = "Create Post function should use provided.al2023 runtime"
  }

  assert {
    condition     = aws_lambda_function.create_post.architectures[0] == "arm64"
    error_message = "Create Post function should use ARM64 architecture"
  }

  assert {
    condition     = aws_lambda_function.create_post.memory_size == 128
    error_message = "Create Post function should have 128MB memory"
  }

  assert {
    condition     = aws_lambda_function.create_post.timeout == 30
    error_message = "Create Post function should have 30 second timeout"
  }

  assert {
    condition     = aws_lambda_function.create_post.handler == "bootstrap"
    error_message = "Create Post function should use bootstrap handler"
  }
}

# Test: Get Post Lambda Function
run "get_post_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.get_post.function_name == "blog-get-post-go"
    error_message = "Get Post function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.get_post.runtime == "provided.al2023"
    error_message = "Get Post function should use provided.al2023 runtime"
  }

  assert {
    condition     = aws_lambda_function.get_post.architectures[0] == "arm64"
    error_message = "Get Post function should use ARM64 architecture"
  }
}

# Test: Get Public Post Lambda Function
run "get_public_post_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.get_public_post.function_name == "blog-get-public-post-go"
    error_message = "Get Public Post function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.get_public_post.runtime == "provided.al2023"
    error_message = "Get Public Post function should use provided.al2023 runtime"
  }
}

# Test: List Posts Lambda Function
run "list_posts_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.list_posts.function_name == "blog-list-posts-go"
    error_message = "List Posts function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.list_posts.runtime == "provided.al2023"
    error_message = "List Posts function should use provided.al2023 runtime"
  }
}

# Test: Update Post Lambda Function
run "update_post_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.update_post.function_name == "blog-update-post-go"
    error_message = "Update Post function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.update_post.runtime == "provided.al2023"
    error_message = "Update Post function should use provided.al2023 runtime"
  }
}

# Test: Delete Post Lambda Function
run "delete_post_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.delete_post.function_name == "blog-delete-post-go"
    error_message = "Delete Post function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.delete_post.runtime == "provided.al2023"
    error_message = "Delete Post function should use provided.al2023 runtime"
  }
}

# ======================
# Auth Domain Functions Tests
# ======================

# Test: Login Lambda Function
run "login_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.login.function_name == "blog-login-go"
    error_message = "Login function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.login.runtime == "provided.al2023"
    error_message = "Login function should use provided.al2023 runtime"
  }

  assert {
    condition     = aws_lambda_function.login.architectures[0] == "arm64"
    error_message = "Login function should use ARM64 architecture"
  }
}

# Test: Logout Lambda Function
run "logout_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.logout.function_name == "blog-logout-go"
    error_message = "Logout function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.logout.runtime == "provided.al2023"
    error_message = "Logout function should use provided.al2023 runtime"
  }
}

# Test: Refresh Lambda Function
run "refresh_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.refresh.function_name == "blog-refresh-go"
    error_message = "Refresh function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.refresh.runtime == "provided.al2023"
    error_message = "Refresh function should use provided.al2023 runtime"
  }
}

# ======================
# Images Domain Functions Tests
# ======================

# Test: Get Upload URL Lambda Function
run "get_upload_url_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.get_upload_url.function_name == "blog-upload-url-go"
    error_message = "Get Upload URL function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.get_upload_url.runtime == "provided.al2023"
    error_message = "Get Upload URL function should use provided.al2023 runtime"
  }

  assert {
    condition     = aws_lambda_function.get_upload_url.architectures[0] == "arm64"
    error_message = "Get Upload URL function should use ARM64 architecture"
  }
}

# Test: Delete Image Lambda Function
run "delete_image_function_configuration" {
  command = plan

  assert {
    condition     = aws_lambda_function.delete_image.function_name == "blog-delete-image-go"
    error_message = "Delete Image function name should match CDK naming"
  }

  assert {
    condition     = aws_lambda_function.delete_image.runtime == "provided.al2023"
    error_message = "Delete Image function should use provided.al2023 runtime"
  }
}

# ======================
# Environment Variables Tests
# ======================

# Test: Posts functions have correct environment variables
run "posts_functions_environment_variables" {
  command = plan

  assert {
    condition     = aws_lambda_function.create_post.environment[0].variables["TABLE_NAME"] == "blog-posts-table"
    error_message = "Create Post function should have TABLE_NAME environment variable"
  }

  assert {
    condition     = aws_lambda_function.create_post.environment[0].variables["BUCKET_NAME"] == "serverless-blog-images"
    error_message = "Create Post function should have BUCKET_NAME environment variable"
  }

  assert {
    condition     = aws_lambda_function.create_post.environment[0].variables["CLOUDFRONT_DOMAIN"] == "https://d1234567890.cloudfront.net"
    error_message = "Create Post function should have CLOUDFRONT_DOMAIN environment variable"
  }

  assert {
    condition     = aws_lambda_function.list_posts.environment[0].variables["TABLE_NAME"] == "blog-posts-table"
    error_message = "List Posts function should have TABLE_NAME environment variable"
  }
}

# Test: Auth functions have correct environment variables
run "auth_functions_environment_variables" {
  command = plan

  assert {
    condition     = aws_lambda_function.login.environment[0].variables["USER_POOL_ID"] == "ap-northeast-1_example"
    error_message = "Login function should have USER_POOL_ID environment variable"
  }

  assert {
    condition     = aws_lambda_function.login.environment[0].variables["USER_POOL_CLIENT_ID"] == "example-client-id"
    error_message = "Login function should have USER_POOL_CLIENT_ID environment variable"
  }

  assert {
    condition     = aws_lambda_function.refresh.environment[0].variables["USER_POOL_ID"] == "ap-northeast-1_example"
    error_message = "Refresh function should have USER_POOL_ID environment variable"
  }
}

# Test: Images functions have correct environment variables
run "images_functions_environment_variables" {
  command = plan

  assert {
    condition     = aws_lambda_function.get_upload_url.environment[0].variables["BUCKET_NAME"] == "serverless-blog-images"
    error_message = "Get Upload URL function should have BUCKET_NAME environment variable"
  }

  assert {
    condition     = aws_lambda_function.delete_image.environment[0].variables["BUCKET_NAME"] == "serverless-blog-images"
    error_message = "Delete Image function should have BUCKET_NAME environment variable"
  }
}

# ======================
# X-Ray Tracing Tests (Development - disabled)
# ======================

run "xray_tracing_disabled_in_dev" {
  command = plan

  variables {
    enable_xray = false
  }

  assert {
    condition     = aws_lambda_function.create_post.tracing_config[0].mode == "PassThrough"
    error_message = "X-Ray tracing should be PassThrough when disabled"
  }

  assert {
    condition     = aws_lambda_function.login.tracing_config[0].mode == "PassThrough"
    error_message = "X-Ray tracing should be PassThrough when disabled for auth functions"
  }
}

# ======================
# X-Ray Tracing Tests (Production - enabled)
# ======================

run "xray_tracing_enabled_in_prd" {
  command = plan

  variables {
    enable_xray = true
  }

  assert {
    condition     = aws_lambda_function.create_post.tracing_config[0].mode == "Active"
    error_message = "X-Ray tracing should be Active when enabled"
  }

  assert {
    condition     = aws_lambda_function.login.tracing_config[0].mode == "Active"
    error_message = "X-Ray tracing should be Active when enabled for auth functions"
  }

  assert {
    condition     = aws_lambda_function.get_upload_url.tracing_config[0].mode == "Active"
    error_message = "X-Ray tracing should be Active when enabled for images functions"
  }
}

# ======================
# IAM Role Tests (Domain-specific roles per design.md)
# ======================

run "lambda_posts_role_created" {
  command = plan

  assert {
    condition     = aws_iam_role.lambda_posts.name == "blog-lambda-posts-role"
    error_message = "Lambda posts role should be created with correct name"
  }
}

run "lambda_auth_role_created" {
  command = plan

  assert {
    condition     = aws_iam_role.lambda_auth.name == "blog-lambda-auth-role"
    error_message = "Lambda auth role should be created with correct name"
  }
}

run "lambda_images_role_created" {
  command = plan

  assert {
    condition     = aws_iam_role.lambda_images.name == "blog-lambda-images-role"
    error_message = "Lambda images role should be created with correct name"
  }
}

run "lambda_posts_role_trust_policy" {
  command = plan

  assert {
    condition     = can(jsondecode(aws_iam_role.lambda_posts.assume_role_policy))
    error_message = "Lambda posts role should have valid trust policy"
  }
}

# ======================
# CloudWatch Log Groups Tests
# ======================

run "cloudwatch_log_groups_created" {
  command = plan

  assert {
    condition     = aws_cloudwatch_log_group.create_post.name == "/aws/lambda/blog-create-post-go"
    error_message = "Create Post CloudWatch log group should be created with correct name"
  }

  assert {
    condition     = aws_cloudwatch_log_group.login.name == "/aws/lambda/blog-login-go"
    error_message = "Login CloudWatch log group should be created with correct name"
  }

  assert {
    condition     = aws_cloudwatch_log_group.get_upload_url.name == "/aws/lambda/blog-upload-url-go"
    error_message = "Get Upload URL CloudWatch log group should be created with correct name"
  }
}

run "cloudwatch_log_groups_retention_prd" {
  command = plan

  variables {
    environment = "prd"
  }

  assert {
    condition     = aws_cloudwatch_log_group.create_post.retention_in_days == 90
    error_message = "CloudWatch log groups should have 90 days retention in production"
  }
}

run "cloudwatch_log_groups_retention_dev" {
  command = plan

  variables {
    environment = "dev"
  }

  assert {
    condition     = aws_cloudwatch_log_group.create_post.retention_in_days == 14
    error_message = "CloudWatch log groups should have 14 days retention in development"
  }
}

# ======================
# All 11 Functions Exist Tests
# ======================

run "all_11_lambda_functions_exist" {
  command = plan

  # Posts domain (6 functions)
  assert {
    condition     = aws_lambda_function.create_post.function_name != ""
    error_message = "create_post Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.get_post.function_name != ""
    error_message = "get_post Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.get_public_post.function_name != ""
    error_message = "get_public_post Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.list_posts.function_name != ""
    error_message = "list_posts Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.update_post.function_name != ""
    error_message = "update_post Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.delete_post.function_name != ""
    error_message = "delete_post Lambda function should exist"
  }

  # Auth domain (3 functions)
  assert {
    condition     = aws_lambda_function.login.function_name != ""
    error_message = "login Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.logout.function_name != ""
    error_message = "logout Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.refresh.function_name != ""
    error_message = "refresh Lambda function should exist"
  }

  # Images domain (2 functions)
  assert {
    condition     = aws_lambda_function.get_upload_url.function_name != ""
    error_message = "get_upload_url Lambda function should exist"
  }

  assert {
    condition     = aws_lambda_function.delete_image.function_name != ""
    error_message = "delete_image Lambda function should exist"
  }
}

# ======================
# Output Tests
# ======================

run "lambda_function_arns_output" {
  command = plan

  assert {
    condition     = output.function_arns != null
    error_message = "function_arns output should exist"
  }
}

run "lambda_function_invoke_arns_output" {
  command = plan

  assert {
    condition     = output.function_invoke_arns != null
    error_message = "function_invoke_arns output should exist"
  }
}

run "lambda_function_names_output" {
  command = plan

  assert {
    condition     = output.function_names != null
    error_message = "function_names output should exist"
  }
}

run "lambda_execution_role_name_output" {
  command = plan

  # execution_role_name is a legacy alias for posts_role_name
  assert {
    condition     = output.execution_role_name == "blog-lambda-posts-role"
    error_message = "execution_role_name output should have correct value (alias to posts_role_name)"
  }
}
