# Lambda Module - Go Lambda Functions
# Requirements: 4.1 - Go Lambda functions module implementation
#
# This module defines 11 Go Lambda functions:
# - Posts domain: createPost, getPost, getPublicPost, listPosts, updatePost, deletePost
# - Auth domain: login, logout, refresh
# - Images domain: getUploadUrl, deleteImage

locals {
  is_production = var.environment == "prd"

  # Log retention: 90 days for prd, 14 days for dev
  log_retention_days = local.is_production ? 90 : 14

  # X-Ray tracing mode
  tracing_mode = var.enable_xray ? "Active" : "PassThrough"

  # Common environment variables for all Lambda functions
  common_environment = {
    TABLE_NAME          = var.table_name
    BUCKET_NAME         = var.bucket_name
    USER_POOL_ID        = var.user_pool_id
    USER_POOL_CLIENT_ID = var.user_pool_client_id
    CLOUDFRONT_DOMAIN   = "https://${var.cloudfront_domain}"
  }

  common_tags = merge(var.tags, {
    Environment = var.environment
    Module      = "lambda"
  })

  # Lambda function definitions with CDK-compatible naming
  lambda_functions = {
    create_post = {
      name        = "blog-create-post-go"
      description = "Create new blog post with Markdown to HTML conversion (Go)"
      binary_name = "posts-create"
    }
    get_post = {
      name        = "blog-get-post-go"
      description = "Get blog post by ID (admin, includes markdown) (Go)"
      binary_name = "posts-get"
    }
    get_public_post = {
      name        = "blog-get-public-post-go"
      description = "Get published blog post by ID (public, HTML only) (Go)"
      binary_name = "posts-get_public"
    }
    list_posts = {
      name        = "blog-list-posts-go"
      description = "List published blog posts (Go)"
      binary_name = "posts-list"
    }
    update_post = {
      name        = "blog-update-post-go"
      description = "Update existing blog post (Go)"
      binary_name = "posts-update"
    }
    delete_post = {
      name        = "blog-delete-post-go"
      description = "Delete blog post (Go)"
      binary_name = "posts-delete"
    }
    login = {
      name        = "blog-login-go"
      description = "User authentication (Go)"
      binary_name = "auth-login"
    }
    logout = {
      name        = "blog-logout-go"
      description = "User logout (Go)"
      binary_name = "auth-logout"
    }
    refresh = {
      name        = "blog-refresh-go"
      description = "Token refresh (Go)"
      binary_name = "auth-refresh"
    }
    get_upload_url = {
      name        = "blog-upload-url-go"
      description = "Generate pre-signed URL for image upload (Go)"
      binary_name = "images-get_upload_url"
    }
    delete_image = {
      name        = "blog-delete-image-go"
      description = "Delete image from S3 (Go)"
      binary_name = "images-delete"
    }
  }
}

# ======================
# IAM Roles are defined in iam.tf
# Posts domain: aws_iam_role.lambda_posts
# Auth domain: aws_iam_role.lambda_auth
# Images domain: aws_iam_role.lambda_images
# ======================

# ======================
# CloudWatch Log Groups
# ======================

resource "aws_cloudwatch_log_group" "create_post" {
  name              = "/aws/lambda/${local.lambda_functions.create_post.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "get_post" {
  name              = "/aws/lambda/${local.lambda_functions.get_post.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "get_public_post" {
  name              = "/aws/lambda/${local.lambda_functions.get_public_post.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "list_posts" {
  name              = "/aws/lambda/${local.lambda_functions.list_posts.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "update_post" {
  name              = "/aws/lambda/${local.lambda_functions.update_post.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "delete_post" {
  name              = "/aws/lambda/${local.lambda_functions.delete_post.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "login" {
  name              = "/aws/lambda/${local.lambda_functions.login.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "logout" {
  name              = "/aws/lambda/${local.lambda_functions.logout.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "refresh" {
  name              = "/aws/lambda/${local.lambda_functions.refresh.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "get_upload_url" {
  name              = "/aws/lambda/${local.lambda_functions.get_upload_url.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "delete_image" {
  name              = "/aws/lambda/${local.lambda_functions.delete_image.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

# ======================
# Archive Data Sources (for Lambda deployment packages)
# ======================

data "archive_file" "create_post" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.create_post.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.create_post.binary_name}.zip"
}

data "archive_file" "get_post" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.get_post.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.get_post.binary_name}.zip"
}

data "archive_file" "get_public_post" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.get_public_post.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.get_public_post.binary_name}.zip"
}

data "archive_file" "list_posts" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.list_posts.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.list_posts.binary_name}.zip"
}

data "archive_file" "update_post" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.update_post.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.update_post.binary_name}.zip"
}

data "archive_file" "delete_post" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.delete_post.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.delete_post.binary_name}.zip"
}

data "archive_file" "login" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.login.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.login.binary_name}.zip"
}

data "archive_file" "logout" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.logout.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.logout.binary_name}.zip"
}

data "archive_file" "refresh" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.refresh.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.refresh.binary_name}.zip"
}

data "archive_file" "get_upload_url" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.get_upload_url.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.get_upload_url.binary_name}.zip"
}

data "archive_file" "delete_image" {
  type        = "zip"
  source_file = "${var.go_binary_path}/${local.lambda_functions.delete_image.binary_name}/bootstrap"
  output_path = "${path.module}/.terraform/tmp/${local.lambda_functions.delete_image.binary_name}.zip"
}

# ======================
# Posts Domain Lambda Functions
# ======================

# POST /admin/posts - Create Post
resource "aws_lambda_function" "create_post" {
  function_name = local.lambda_functions.create_post.name
  description   = local.lambda_functions.create_post.description
  role          = aws_iam_role.lambda_posts.arn

  filename         = data.archive_file.create_post.output_path
  source_code_hash = data.archive_file.create_post.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.create_post]

  tags = local.common_tags
}

# GET /admin/posts/{id} - Get Post
resource "aws_lambda_function" "get_post" {
  function_name = local.lambda_functions.get_post.name
  description   = local.lambda_functions.get_post.description
  role          = aws_iam_role.lambda_posts.arn

  filename         = data.archive_file.get_post.output_path
  source_code_hash = data.archive_file.get_post.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.get_post]

  tags = local.common_tags
}

# GET /posts/{id} - Get Public Post
resource "aws_lambda_function" "get_public_post" {
  function_name = local.lambda_functions.get_public_post.name
  description   = local.lambda_functions.get_public_post.description
  role          = aws_iam_role.lambda_posts.arn

  filename         = data.archive_file.get_public_post.output_path
  source_code_hash = data.archive_file.get_public_post.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.get_public_post]

  tags = local.common_tags
}

# GET /posts - List Posts
resource "aws_lambda_function" "list_posts" {
  function_name = local.lambda_functions.list_posts.name
  description   = local.lambda_functions.list_posts.description
  role          = aws_iam_role.lambda_posts.arn

  filename         = data.archive_file.list_posts.output_path
  source_code_hash = data.archive_file.list_posts.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.list_posts]

  tags = local.common_tags
}

# PUT /admin/posts/{id} - Update Post
resource "aws_lambda_function" "update_post" {
  function_name = local.lambda_functions.update_post.name
  description   = local.lambda_functions.update_post.description
  role          = aws_iam_role.lambda_posts.arn

  filename         = data.archive_file.update_post.output_path
  source_code_hash = data.archive_file.update_post.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.update_post]

  tags = local.common_tags
}

# DELETE /admin/posts/{id} - Delete Post
resource "aws_lambda_function" "delete_post" {
  function_name = local.lambda_functions.delete_post.name
  description   = local.lambda_functions.delete_post.description
  role          = aws_iam_role.lambda_posts.arn

  filename         = data.archive_file.delete_post.output_path
  source_code_hash = data.archive_file.delete_post.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.delete_post]

  tags = local.common_tags
}

# ======================
# Auth Domain Lambda Functions
# ======================

# POST /auth/login - Login
resource "aws_lambda_function" "login" {
  function_name = local.lambda_functions.login.name
  description   = local.lambda_functions.login.description
  role          = aws_iam_role.lambda_auth.arn

  filename         = data.archive_file.login.output_path
  source_code_hash = data.archive_file.login.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.login]

  tags = local.common_tags
}

# POST /auth/logout - Logout
resource "aws_lambda_function" "logout" {
  function_name = local.lambda_functions.logout.name
  description   = local.lambda_functions.logout.description
  role          = aws_iam_role.lambda_auth.arn

  filename         = data.archive_file.logout.output_path
  source_code_hash = data.archive_file.logout.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.logout]

  tags = local.common_tags
}

# POST /auth/refresh - Refresh Token
resource "aws_lambda_function" "refresh" {
  function_name = local.lambda_functions.refresh.name
  description   = local.lambda_functions.refresh.description
  role          = aws_iam_role.lambda_auth.arn

  filename         = data.archive_file.refresh.output_path
  source_code_hash = data.archive_file.refresh.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.refresh]

  tags = local.common_tags
}

# ======================
# Images Domain Lambda Functions
# ======================

# POST /admin/images/upload-url - Get Upload URL
resource "aws_lambda_function" "get_upload_url" {
  function_name = local.lambda_functions.get_upload_url.name
  description   = local.lambda_functions.get_upload_url.description
  role          = aws_iam_role.lambda_images.arn

  filename         = data.archive_file.get_upload_url.output_path
  source_code_hash = data.archive_file.get_upload_url.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.get_upload_url]

  tags = local.common_tags
}

# DELETE /admin/images/{key+} - Delete Image
resource "aws_lambda_function" "delete_image" {
  function_name = local.lambda_functions.delete_image.name
  description   = local.lambda_functions.delete_image.description
  role          = aws_iam_role.lambda_images.arn

  filename         = data.archive_file.delete_image.output_path
  source_code_hash = data.archive_file.delete_image.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.common_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.delete_image]

  tags = local.common_tags
}
