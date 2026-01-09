# Lambda IAM Roles and Policies Tests
# TDD: Write tests first to validate IAM configuration
# Requirements: 4.2, 6.5, 12.6
#
# Note: These tests validate IAM role names and basic configuration.
# Detailed role-policy relationships are tested in the lambda module tests.

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
}

# Test 1: Verify Posts domain IAM role name
run "verify_posts_iam_role" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role.lambda_posts.name == "blog-lambda-posts-role"
    error_message = "Posts domain role name must be 'blog-lambda-posts-role'"
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

# Test 4: Verify DynamoDB policy name for Posts role
run "verify_dynamodb_policy_name" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role_policy.lambda_posts_dynamodb.name == "blog-lambda-posts-dynamodb-policy"
    error_message = "DynamoDB policy name must be 'blog-lambda-posts-dynamodb-policy'"
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

# Test 7: Verify S3 cascade policy name for Posts role
run "verify_s3_cascade_policy_name" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = aws_iam_role_policy.lambda_posts_s3_cascade.name == "blog-lambda-posts-s3-cascade-policy"
    error_message = "S3 cascade policy name must be 'blog-lambda-posts-s3-cascade-policy'"
  }
}

# Test 8: Verify role outputs are exported
run "verify_role_outputs" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  assert {
    condition     = output.posts_role_name == "blog-lambda-posts-role"
    error_message = "posts_role_name output must be correct"
  }

  assert {
    condition     = output.auth_role_name == "blog-lambda-auth-role"
    error_message = "auth_role_name output must be correct"
  }

  assert {
    condition     = output.images_role_name == "blog-lambda-images-role"
    error_message = "images_role_name output must be correct"
  }
}

# Test 9: Verify all three domain-specific roles exist
run "verify_three_domain_roles" {
  command = plan

  module {
    source = "./modules/lambda"
  }

  # All three role names should be different
  assert {
    condition     = aws_iam_role.lambda_posts.name != aws_iam_role.lambda_auth.name
    error_message = "Posts and Auth roles must have different names"
  }

  assert {
    condition     = aws_iam_role.lambda_posts.name != aws_iam_role.lambda_images.name
    error_message = "Posts and Images roles must have different names"
  }

  assert {
    condition     = aws_iam_role.lambda_auth.name != aws_iam_role.lambda_images.name
    error_message = "Auth and Images roles must have different names"
  }
}
