# Lambda IAM Roles and Policies
# Requirements: 4.2, 6.5, 12.6
#
# This file implements function group-specific IAM roles following
# the principle of least privilege:
# - Posts domain: DynamoDB access + S3 read for delete cascade
# - Auth domain: Cognito access only
# - Images domain: S3 access only

# ======================
# IAM Assume Role Policy (shared)
# ======================

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ======================
# Posts Domain IAM Role
# ======================

resource "aws_iam_role" "lambda_posts" {
  name               = "blog-lambda-posts-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

# Basic execution policy for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_posts_basic_execution" {
  role       = aws_iam_role.lambda_posts.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray policy (prd only)
resource "aws_iam_role_policy_attachment" "lambda_posts_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_posts.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# DynamoDB access policy for Posts domain
resource "aws_iam_role_policy" "lambda_posts_dynamodb" {
  name = "blog-lambda-posts-dynamodb-policy"
  role = aws_iam_role.lambda_posts.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          var.table_arn,
          "${var.table_arn}/index/*"
        ]
      }
    ]
  })
}

# S3 read/delete access for delete cascade (deletePost needs to delete images)
resource "aws_iam_role_policy" "lambda_posts_s3_cascade" {
  name = "blog-lambda-posts-s3-cascade-policy"
  role = aws_iam_role.lambda_posts.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3DeleteCascade"
        Effect = "Allow"
        Action = [
          "s3:DeleteObject",
          "s3:DeleteObjects"
        ]
        Resource = "${var.bucket_arn}/*"
      }
    ]
  })
}

# ======================
# Auth Domain IAM Role
# ======================

resource "aws_iam_role" "lambda_auth" {
  name               = "blog-lambda-auth-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

# Basic execution policy for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_auth_basic_execution" {
  role       = aws_iam_role.lambda_auth.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray policy (prd only)
resource "aws_iam_role_policy_attachment" "lambda_auth_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_auth.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# Cognito access policy for Auth domain
resource "aws_iam_role_policy" "lambda_auth_cognito" {
  name = "blog-lambda-auth-cognito-policy"
  role = aws_iam_role.lambda_auth.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CognitoAuth"
        Effect = "Allow"
        Action = [
          "cognito-idp:InitiateAuth",
          "cognito-idp:RespondToAuthChallenge",
          "cognito-idp:GlobalSignOut"
        ]
        Resource = var.user_pool_arn
      }
    ]
  })
}

# ======================
# Images Domain IAM Role
# ======================

resource "aws_iam_role" "lambda_images" {
  name               = "blog-lambda-images-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

# Basic execution policy for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_images_basic_execution" {
  role       = aws_iam_role.lambda_images.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray policy (prd only)
resource "aws_iam_role_policy_attachment" "lambda_images_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_images.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# S3 access policy for Images domain
resource "aws_iam_role_policy" "lambda_images_s3" {
  name = "blog-lambda-images-s3-policy"
  role = aws_iam_role.lambda_images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3ImageAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.bucket_arn}/*"
      }
    ]
  })
}

# ======================
# Categories Domain IAM Role
# Requirement 2.2: Lambda function IAM role with Categories table Scan permission
# ======================

resource "aws_iam_role" "lambda_categories" {
  name               = "blog-lambda-categories-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

# Basic execution policy for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_categories_basic_execution" {
  role       = aws_iam_role.lambda_categories.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray policy (prd only)
resource "aws_iam_role_policy_attachment" "lambda_categories_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_categories.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# DynamoDB access policy for Categories domain
# Requirement 2.2, 3.2, 4.2, 5.2: Scan, PutItem, GetItem, UpdateItem, DeleteItem, Query permissions for Categories table
# Requirement 4.2, 5.2: Query, UpdateItem permissions for BlogPosts table (for category slug update cascade and delete validation)
resource "aws_iam_role_policy" "lambda_categories_dynamodb" {
  name = "blog-lambda-categories-dynamodb-policy"
  role = aws_iam_role.lambda_categories.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBCategoriesTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:Scan",
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          var.categories_table_arn,
          "${var.categories_table_arn}/index/*"
        ]
      },
      {
        Sid    = "DynamoDBBlogPostsTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          var.table_arn,
          "${var.table_arn}/index/*"
        ]
      }
    ]
  })
}
