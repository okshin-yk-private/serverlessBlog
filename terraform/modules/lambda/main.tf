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
    # Categories domain
    list_categories = {
      name        = "blog-list-categories-go"
      description = "List all categories sorted by sortOrder (Go)"
      binary_name = "categories-list"
    }
    create_category = {
      name        = "blog-create-category-go"
      description = "Create new category (Go)"
      binary_name = "categories-create"
    }
    update_category = {
      name        = "blog-update-category-go"
      description = "Update existing category (Go)"
      binary_name = "categories-update"
    }
    update_categories_sort_order = {
      name        = "blog-update-categories-sort-order-go"
      description = "Bulk update category sort orders (Go)"
      binary_name = "categories-bulk_sort"
    }
    delete_category = {
      name        = "blog-delete-category-go"
      description = "Delete existing category (Go)"
      binary_name = "categories-delete"
    }
    # Mindmaps domain
    create_mindmap = {
      name        = "blog-create-mindmap-go"
      description = "Create new mindmap (Go)"
      binary_name = "mindmaps-create"
    }
    get_mindmap = {
      name        = "blog-get-mindmap-go"
      description = "Get mindmap by ID (admin) (Go)"
      binary_name = "mindmaps-get"
    }
    list_mindmaps = {
      name        = "blog-list-mindmaps-go"
      description = "List mindmaps (admin) (Go)"
      binary_name = "mindmaps-list"
    }
    update_mindmap = {
      name        = "blog-update-mindmap-go"
      description = "Update existing mindmap (Go)"
      binary_name = "mindmaps-update"
    }
    delete_mindmap = {
      name        = "blog-delete-mindmap-go"
      description = "Delete mindmap (Go)"
      binary_name = "mindmaps-delete"
    }
    get_public_mindmap = {
      name        = "blog-get-public-mindmap-go"
      description = "Get published mindmap by ID (public) (Go)"
      binary_name = "mindmaps-get_public"
    }
    list_public_mindmaps = {
      name        = "blog-list-public-mindmaps-go"
      description = "List published mindmaps (public) (Go)"
      binary_name = "mindmaps-list_public"
    }
  }

  # Categories domain environment variables
  categories_environment = {
    CATEGORIES_TABLE_NAME = var.categories_table_name
  }

  # Mindmaps domain environment variables
  mindmaps_environment = {
    MINDMAPS_TABLE_NAME = var.mindmaps_table_name
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
# Note: Using a stable output directory to prevent unnecessary Lambda updates.
# The source_code_hash uses output_base64sha256 from the archive_file,
# which ensures Lambda is updated when the actual binary changes.

data "archive_file" "create_post" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.create_post.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.create_post.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "get_post" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.get_post.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.get_post.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "get_public_post" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.get_public_post.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.get_public_post.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "list_posts" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.list_posts.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.list_posts.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "update_post" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.update_post.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.update_post.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "delete_post" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.delete_post.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.delete_post.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "login" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.login.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.login.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "logout" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.logout.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.logout.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "refresh" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.refresh.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.refresh.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "get_upload_url" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.get_upload_url.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.get_upload_url.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "delete_image" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.delete_image.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.delete_image.binary_name}.zip"
  output_file_mode = "0644"
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
    variables = merge(local.common_environment, {
      CODEBUILD_PROJECT_NAME = var.codebuild_project_name
    })
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
# Requirement 10.1: Trigger CodeBuild when post is published
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
    # Include common environment plus CodeBuild project name for site rebuild
    variables = merge(local.common_environment, {
      CODEBUILD_PROJECT_NAME = var.codebuild_project_name
    })
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
    variables = merge(local.common_environment, {
      CODEBUILD_PROJECT_NAME = var.codebuild_project_name
    })
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

# ======================
# Categories Domain Lambda Functions
# ======================

resource "aws_cloudwatch_log_group" "list_categories" {
  name              = "/aws/lambda/${local.lambda_functions.list_categories.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

data "archive_file" "list_categories" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.list_categories.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.list_categories.binary_name}.zip"
  output_file_mode = "0644"
}

# GET /categories - List Categories (Public, No Auth)
# Requirement 2: Category List API
resource "aws_lambda_function" "list_categories" {
  function_name = local.lambda_functions.list_categories.name
  description   = local.lambda_functions.list_categories.description
  role          = aws_iam_role.lambda_categories.arn

  filename         = data.archive_file.list_categories.output_path
  source_code_hash = data.archive_file.list_categories.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.categories_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.list_categories]

  tags = local.common_tags
}

# ======================
# Create Category Lambda Function
# Requirement 3: Category Creation API
# ======================

resource "aws_cloudwatch_log_group" "create_category" {
  name              = "/aws/lambda/${local.lambda_functions.create_category.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

data "archive_file" "create_category" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.create_category.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.create_category.binary_name}.zip"
  output_file_mode = "0644"
}

# POST /admin/categories - Create Category (Cognito Auth)
# Requirement 3: Category Creation API
# Note: Increased memory for Japanese text processing (kagome morphological analyzer)
resource "aws_lambda_function" "create_category" {
  function_name = local.lambda_functions.create_category.name
  description   = local.lambda_functions.create_category.description
  role          = aws_iam_role.lambda_categories.arn

  filename         = data.archive_file.create_category.output_path
  source_code_hash = data.archive_file.create_category.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 512
  timeout       = 30

  environment {
    variables = local.categories_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.create_category]

  tags = local.common_tags
}

# ======================
# Update Category Lambda Function
# Requirement 4: Category Update API
# ======================

resource "aws_cloudwatch_log_group" "update_category" {
  name              = "/aws/lambda/${local.lambda_functions.update_category.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

data "archive_file" "update_category" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.update_category.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.update_category.binary_name}.zip"
  output_file_mode = "0644"
}

# PUT /admin/categories/{id} - Update Category (Cognito Auth)
# Requirement 4: Category Update API
resource "aws_lambda_function" "update_category" {
  function_name = local.lambda_functions.update_category.name
  description   = local.lambda_functions.update_category.description
  role          = aws_iam_role.lambda_categories.arn

  filename         = data.archive_file.update_category.output_path
  source_code_hash = data.archive_file.update_category.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = merge(local.categories_environment, {
      POSTS_TABLE_NAME = var.table_name
    })
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.update_category]

  tags = local.common_tags
}

# ======================
# Update Categories Sort Order Lambda Function
# Requirement 4B: Category Sort Order Bulk Update API
# ======================

resource "aws_cloudwatch_log_group" "update_categories_sort_order" {
  name              = "/aws/lambda/${local.lambda_functions.update_categories_sort_order.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

data "archive_file" "update_categories_sort_order" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.update_categories_sort_order.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.update_categories_sort_order.binary_name}.zip"
  output_file_mode = "0644"
}

# PATCH /admin/categories/sort - Bulk Update Category Sort Orders (Cognito Auth)
# Requirement 4B: Category Sort Order Bulk Update API
resource "aws_lambda_function" "update_categories_sort_order" {
  function_name = local.lambda_functions.update_categories_sort_order.name
  description   = local.lambda_functions.update_categories_sort_order.description
  role          = aws_iam_role.lambda_categories.arn

  filename         = data.archive_file.update_categories_sort_order.output_path
  source_code_hash = data.archive_file.update_categories_sort_order.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.categories_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.update_categories_sort_order]

  tags = local.common_tags
}

# ======================
# Delete Category Lambda Function
# Requirement 5: Category Deletion API
# ======================

resource "aws_cloudwatch_log_group" "delete_category" {
  name              = "/aws/lambda/${local.lambda_functions.delete_category.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

data "archive_file" "delete_category" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.delete_category.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.delete_category.binary_name}.zip"
  output_file_mode = "0644"
}

# DELETE /admin/categories/{id} - Delete Category (Cognito Auth)
# Requirement 5: Category Deletion API
resource "aws_lambda_function" "delete_category" {
  function_name = local.lambda_functions.delete_category.name
  description   = local.lambda_functions.delete_category.description
  role          = aws_iam_role.lambda_categories.arn

  filename         = data.archive_file.delete_category.output_path
  source_code_hash = data.archive_file.delete_category.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = merge(local.categories_environment, {
      POSTS_TABLE_NAME = var.table_name
    })
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.delete_category]

  tags = local.common_tags
}

# ======================
# Mindmaps Domain Lambda Functions
# ======================

# --- CloudWatch Log Groups ---

resource "aws_cloudwatch_log_group" "create_mindmap" {
  name              = "/aws/lambda/${local.lambda_functions.create_mindmap.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "get_mindmap" {
  name              = "/aws/lambda/${local.lambda_functions.get_mindmap.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "list_mindmaps" {
  name              = "/aws/lambda/${local.lambda_functions.list_mindmaps.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "update_mindmap" {
  name              = "/aws/lambda/${local.lambda_functions.update_mindmap.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "delete_mindmap" {
  name              = "/aws/lambda/${local.lambda_functions.delete_mindmap.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "get_public_mindmap" {
  name              = "/aws/lambda/${local.lambda_functions.get_public_mindmap.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "list_public_mindmaps" {
  name              = "/aws/lambda/${local.lambda_functions.list_public_mindmaps.name}"
  retention_in_days = local.log_retention_days
  tags              = local.common_tags
}

# --- Archive Data Sources ---

data "archive_file" "create_mindmap" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.create_mindmap.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.create_mindmap.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "get_mindmap" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.get_mindmap.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.get_mindmap.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "list_mindmaps" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.list_mindmaps.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.list_mindmaps.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "update_mindmap" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.update_mindmap.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.update_mindmap.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "delete_mindmap" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.delete_mindmap.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.delete_mindmap.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "get_public_mindmap" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.get_public_mindmap.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.get_public_mindmap.binary_name}.zip"
  output_file_mode = "0644"
}

data "archive_file" "list_public_mindmaps" {
  type             = "zip"
  source_file      = "${var.go_binary_path}/${local.lambda_functions.list_public_mindmaps.binary_name}/bootstrap"
  output_path      = "${path.module}/.terraform/tmp/${local.lambda_functions.list_public_mindmaps.binary_name}.zip"
  output_file_mode = "0644"
}

# --- Lambda Functions ---

# POST /admin/mindmaps - Create Mindmap
resource "aws_lambda_function" "create_mindmap" {
  function_name = local.lambda_functions.create_mindmap.name
  description   = local.lambda_functions.create_mindmap.description
  role          = aws_iam_role.lambda_mindmaps.arn

  filename         = data.archive_file.create_mindmap.output_path
  source_code_hash = data.archive_file.create_mindmap.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = merge(local.mindmaps_environment, {
      CODEBUILD_PROJECT_NAME = var.codebuild_project_name
    })
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.create_mindmap]

  tags = local.common_tags
}

# GET /admin/mindmaps/{id} - Get Mindmap
resource "aws_lambda_function" "get_mindmap" {
  function_name = local.lambda_functions.get_mindmap.name
  description   = local.lambda_functions.get_mindmap.description
  role          = aws_iam_role.lambda_mindmaps.arn

  filename         = data.archive_file.get_mindmap.output_path
  source_code_hash = data.archive_file.get_mindmap.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.mindmaps_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.get_mindmap]

  tags = local.common_tags
}

# GET /admin/mindmaps - List Mindmaps
resource "aws_lambda_function" "list_mindmaps" {
  function_name = local.lambda_functions.list_mindmaps.name
  description   = local.lambda_functions.list_mindmaps.description
  role          = aws_iam_role.lambda_mindmaps.arn

  filename         = data.archive_file.list_mindmaps.output_path
  source_code_hash = data.archive_file.list_mindmaps.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.mindmaps_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.list_mindmaps]

  tags = local.common_tags
}

# PUT /admin/mindmaps/{id} - Update Mindmap
resource "aws_lambda_function" "update_mindmap" {
  function_name = local.lambda_functions.update_mindmap.name
  description   = local.lambda_functions.update_mindmap.description
  role          = aws_iam_role.lambda_mindmaps.arn

  filename         = data.archive_file.update_mindmap.output_path
  source_code_hash = data.archive_file.update_mindmap.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = merge(local.mindmaps_environment, {
      CODEBUILD_PROJECT_NAME = var.codebuild_project_name
    })
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.update_mindmap]

  tags = local.common_tags
}

# DELETE /admin/mindmaps/{id} - Delete Mindmap
resource "aws_lambda_function" "delete_mindmap" {
  function_name = local.lambda_functions.delete_mindmap.name
  description   = local.lambda_functions.delete_mindmap.description
  role          = aws_iam_role.lambda_mindmaps.arn

  filename         = data.archive_file.delete_mindmap.output_path
  source_code_hash = data.archive_file.delete_mindmap.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = merge(local.mindmaps_environment, {
      CODEBUILD_PROJECT_NAME = var.codebuild_project_name
    })
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.delete_mindmap]

  tags = local.common_tags
}

# GET /public/mindmaps/{id} - Get Public Mindmap
resource "aws_lambda_function" "get_public_mindmap" {
  function_name = local.lambda_functions.get_public_mindmap.name
  description   = local.lambda_functions.get_public_mindmap.description
  role          = aws_iam_role.lambda_mindmaps_public.arn

  filename         = data.archive_file.get_public_mindmap.output_path
  source_code_hash = data.archive_file.get_public_mindmap.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.mindmaps_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.get_public_mindmap]

  tags = local.common_tags
}

# GET /public/mindmaps - List Public Mindmaps
resource "aws_lambda_function" "list_public_mindmaps" {
  function_name = local.lambda_functions.list_public_mindmaps.name
  description   = local.lambda_functions.list_public_mindmaps.description
  role          = aws_iam_role.lambda_mindmaps_public.arn

  filename         = data.archive_file.list_public_mindmaps.output_path
  source_code_hash = data.archive_file.list_public_mindmaps.output_base64sha256

  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128
  timeout       = 30

  environment {
    variables = local.mindmaps_environment
  }

  tracing_config {
    mode = local.tracing_mode
  }

  depends_on = [aws_cloudwatch_log_group.list_public_mindmaps]

  tags = local.common_tags
}
