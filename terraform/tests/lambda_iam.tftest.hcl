# Lambda IAM Roles and Policies Tests
# TDD: Write tests first to validate IAM configuration
# Requirements: 4.2, 6.5, 12.6
#
# Note: These tests validate IAM role names and basic configuration.
# Detailed role-policy relationships are tested in the lambda module tests.
#
# Issue #493: the former domain-wide lambda_posts / lambda_categories roles
# were split into least-privilege read/write (+ build-status) roles. These
# tests were updated accordingly - see terraform/modules/lambda/iam.tf and
# terraform/modules/lambda/tests/lambda.tftest.hcl for the full API audit
# and function-to-role assignment coverage.

# Mock providers for testing with override for IAM policy document
mock_provider "aws" {
  override_data {
    target = data.aws_iam_policy_document.lambda_assume_role
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

# Mock archive provider for dummy zip files
mock_provider "archive" {}

# Common test variables
variables {
  environment         = "dev"
  table_name          = "test-blog-posts-table"
  table_arn           = "arn:aws:dynamodb:ap-northeast-1:123456789012:table/test-blog-posts-table"
  bucket_name         = "test-blog-images-bucket"
  bucket_arn          = "arn:aws:s3:::test-blog-images-bucket"
  user_pool_id        = "ap-northeast-1_testpool"
  user_pool_arn       = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_testpool"
  user_pool_client_id = "test-client-id"
  cloudfront_domain   = "test.cloudfront.net"
  enable_xray         = false
  go_binary_path      = "../../go-functions/bin"
  tags                = { Test = "true" }

  # CodeBuild + Categories table references, needed to exercise the
  # count-conditioned CodeBuild policies and the categories write policy.
  codebuild_project_name = "test-codebuild-project"
  codebuild_project_arn  = "arn:aws:codebuild:ap-northeast-1:123456789012:project/test-codebuild-project"
  categories_table_name  = "test-blog-categories-table"
  categories_table_arn   = "arn:aws:dynamodb:ap-northeast-1:123456789012:table/test-blog-categories-table"
}

# Test 1: Verify Posts domain IAM role names (split into read/write/build-status)
run "verify_posts_iam_role" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role.lambda_posts_read.name == "blog-lambda-posts-read-role"
    error_message = "Posts domain read role name must be 'blog-lambda-posts-read-role'"
  }

  assert {
    condition     = aws_iam_role.lambda_posts_write.name == "blog-lambda-posts-write-role"
    error_message = "Posts domain write role name must be 'blog-lambda-posts-write-role'"
  }

  assert {
    condition     = aws_iam_role.lambda_posts_build_status.name == "blog-lambda-posts-build-status-role"
    error_message = "Posts domain build-status role name must be 'blog-lambda-posts-build-status-role'"
  }
}

# Test 2: Verify Auth domain IAM role name
run "verify_auth_iam_role" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role.lambda_auth.name == "blog-lambda-auth-role"
    error_message = "Auth domain role name must be 'blog-lambda-auth-role'"
  }
}

# Test 3: Verify Images domain IAM role name
run "verify_images_iam_role" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role.lambda_images.name == "blog-lambda-images-role"
    error_message = "Images domain role name must be 'blog-lambda-images-role'"
  }
}

# Test 4: Verify DynamoDB policy names for Posts read/write roles
run "verify_dynamodb_policy_name" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role_policy.lambda_posts_read_dynamodb.name == "blog-lambda-posts-read-dynamodb-policy"
    error_message = "DynamoDB read policy name must be 'blog-lambda-posts-read-dynamodb-policy'"
  }

  assert {
    condition     = aws_iam_role_policy.lambda_posts_write_dynamodb.name == "blog-lambda-posts-write-dynamodb-policy"
    error_message = "DynamoDB write policy name must be 'blog-lambda-posts-write-dynamodb-policy'"
  }
}

# Test 5: Verify S3 policy name for Images role
run "verify_s3_policy_name" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role_policy.lambda_images_s3.name == "blog-lambda-images-s3-policy"
    error_message = "S3 policy name must be 'blog-lambda-images-s3-policy'"
  }
}

# Test 6: Verify Cognito policy name for Auth role
run "verify_cognito_policy_name" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role_policy.lambda_auth_cognito.name == "blog-lambda-auth-cognito-policy"
    error_message = "Cognito policy name must be 'blog-lambda-auth-cognito-policy'"
  }
}

# Test 7: Verify S3 cascade policy name for Posts write role
run "verify_s3_cascade_policy_name" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role_policy.lambda_posts_write_s3_cascade.name == "blog-lambda-posts-write-s3-cascade-policy"
    error_message = "S3 cascade policy name must be 'blog-lambda-posts-write-s3-cascade-policy'"
  }
}

# Test 8: Verify role outputs are exported
run "verify_role_outputs" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = output.posts_read_role_name == "blog-lambda-posts-read-role"
    error_message = "posts_read_role_name output must be correct"
  }

  assert {
    condition     = output.posts_write_role_name == "blog-lambda-posts-write-role"
    error_message = "posts_write_role_name output must be correct"
  }

  assert {
    condition     = output.posts_build_status_role_name == "blog-lambda-posts-build-status-role"
    error_message = "posts_build_status_role_name output must be correct"
  }

  assert {
    condition     = output.auth_role_name == "blog-lambda-auth-role"
    error_message = "auth_role_name output must be correct"
  }

  assert {
    condition     = output.images_role_name == "blog-lambda-images-role"
    error_message = "images_role_name output must be correct"
  }

  assert {
    condition     = output.categories_read_role_name == "blog-lambda-categories-read-role"
    error_message = "categories_read_role_name output must be correct"
  }

  assert {
    condition     = output.categories_write_role_name == "blog-lambda-categories-write-role"
    error_message = "categories_write_role_name output must be correct"
  }
}

# Test 9: Verify all domain-specific roles exist and are distinct
run "verify_domain_roles_distinct" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition = length(distinct([
      aws_iam_role.lambda_posts_read.name,
      aws_iam_role.lambda_posts_write.name,
      aws_iam_role.lambda_posts_build_status.name,
      aws_iam_role.lambda_auth.name,
      aws_iam_role.lambda_images.name,
      aws_iam_role.lambda_categories_read.name,
      aws_iam_role.lambda_categories_write.name,
    ])) == 7
    error_message = "All seven domain/purpose-specific IAM roles must have distinct names"
  }
}

# Test 10: Least privilege - read-only roles must not grant write actions
run "verify_read_roles_are_read_only" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition = alltrue([
      for action in jsondecode(aws_iam_role_policy.lambda_posts_read_dynamodb.policy).Statement[0].Action :
      !contains(["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Scan"], action)
    ])
    error_message = "lambda_posts_read policy must not grant any DynamoDB write action or Scan"
  }

  assert {
    condition     = jsondecode(aws_iam_role_policy.lambda_categories_read_dynamodb.policy).Statement[0].Action == ["dynamodb:Scan"]
    error_message = "lambda_categories_read policy must grant only dynamodb:Scan (no write actions)"
  }
}

# Test 11: Least privilege - build-status role can poll CodeBuild but never start a build
run "verify_build_status_role_cannot_start_build" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition = !contains(
      jsondecode(aws_iam_role_policy.lambda_posts_build_status_codebuild[0].policy).Statement[0].Action,
      "codebuild:StartBuild"
    )
    error_message = "lambda_posts_build_status must never be granted codebuild:StartBuild"
  }

  assert {
    condition = contains(
      jsondecode(aws_iam_role_policy.lambda_posts_build_status_codebuild[0].policy).Statement[0].Action,
      "codebuild:BatchGetBuilds"
    )
    error_message = "lambda_posts_build_status must be able to poll build results via codebuild:BatchGetBuilds"
  }
}

# Test 12: Least privilege - write role retains codebuild:StartBuild (create/update/delete post)
run "verify_write_role_has_start_build" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition = contains(
      jsondecode(aws_iam_role_policy.lambda_posts_write_codebuild[0].policy).Statement[0].Action,
      "codebuild:StartBuild"
    )
    error_message = "lambda_posts_write must be granted codebuild:StartBuild to trigger site rebuilds"
  }
}
