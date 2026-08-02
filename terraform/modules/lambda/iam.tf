# Lambda IAM Roles and Policies
# Requirements: 4.2, 6.5, 12.6
#
# Issue #493: split the former domain-wide roles into least-privilege
# read/write roles so a public, read-only Lambda never holds write or
# delete permissions. Every action below was verified directly against
# the Go handler source under go-functions/cmd/** (not assumed) — see the
# API audit table in the PR description for the per-handler evidence.
#
# - Posts domain:
#   - lambda_posts_read         - GetItem/Query only (public + admin reads)
#   - lambda_posts_write        - GetItem/PutItem/DeleteItem/Query + S3 delete
#                                 cascade + CodeBuild trigger (create/update/delete)
#   - lambda_posts_build_status - GetItem only (reads durable build state;
#                                 never starts a build or writes state)
# - Auth domain: Cognito access only (unchanged - already least privilege)
# - Images domain: S3 access only (unchanged - out of scope for #493)
# - Categories domain:
#   - lambda_categories_read  - Scan only (list_categories, public)
#   - lambda_categories_write - full Categories table access (including
#                               TransactWriteItems-backed slug reservation)
#                               plus BlogPosts Query/UpdateItem for the
#                               category-rename cascade

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
# Posts Domain - Read-Only Role
# Used by: get_post, get_public_post, list_posts, get_post_by_slug
# All four handlers only ever call dynamodb GetItem/Query (verified: none
# of them import the S3 or CodeBuild SDK clients).
# ======================

resource "aws_iam_role" "lambda_posts_read" {
  name               = "blog-lambda-posts-read-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_posts_read_basic_execution" {
  role       = aws_iam_role.lambda_posts_read.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_posts_read_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_posts_read.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "lambda_posts_read_dynamodb" {
  name = "blog-lambda-posts-read-dynamodb-policy"
  role = aws_iam_role.lambda_posts_read.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableReadOnly"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = [
          var.table_arn,
          "${var.table_arn}/index/*"
        ]
      }
    ]
  })
}

# ======================
# Posts Domain - Write Role
# Used by: create_post, update_post, delete_post
#
# API usage confirmed per handler:
#   create_post -> dynamodb PutItem, Query (slug uniqueness check)
#   update_post -> dynamodb GetItem, PutItem, Query (slug change check)
#   delete_post -> dynamodb GetItem, DeleteItem; s3 DeleteObjects (image
#                  cascade, only when the post has ImageURLs)
# Public-site-impacting mutations use TransactWriteItems with an Update on the
# singleton build-state item. IAM authorizes the transaction through the
# underlying Put/Delete/Update actions.
# ======================

resource "aws_iam_role" "lambda_posts_write" {
  name               = "blog-lambda-posts-write-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_posts_write_basic_execution" {
  role       = aws_iam_role.lambda_posts_write.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_posts_write_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_posts_write.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# DynamoDB access policy for Posts write role
resource "aws_iam_role_policy" "lambda_posts_write_dynamodb" {
  name = "blog-lambda-posts-write-dynamodb-policy"
  role = aws_iam_role.lambda_posts_write.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableReadWrite"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          var.table_arn,
          "${var.table_arn}/index/*"
        ]
      }
    ]
  })
}

# S3 delete access for delete cascade (deletePost needs to delete images)
resource "aws_iam_role_policy" "lambda_posts_write_s3_cascade" {
  name = "blog-lambda-posts-write-s3-cascade-policy"
  role = aws_iam_role.lambda_posts_write.id

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

# CodeBuild access for triggering site rebuilds
# Requirement 10.4: Lambda execution role with codebuild:StartBuild permission
resource "aws_iam_role_policy" "lambda_posts_write_codebuild" {
  count = var.codebuild_project_arn != "" ? 1 : 0
  name  = "blog-lambda-posts-write-codebuild-policy"
  role  = aws_iam_role.lambda_posts_write.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CodeBuildTrigger"
        Effect = "Allow"
        Action = [
          "codebuild:StartBuild"
        ]
        Resource = var.codebuild_project_arn
      }
    ]
  })
}

# ======================
# Posts Domain - Build Status Role
# Used by: build_status_post only.
#
# This handler reads only the singleton build-state item from DynamoDB.
# ======================

resource "aws_iam_role" "lambda_posts_build_status" {
  name               = "blog-lambda-posts-build-status-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_posts_build_status_basic_execution" {
  role       = aws_iam_role.lambda_posts_build_status.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_posts_build_status_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_posts_build_status.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "lambda_posts_build_status_dynamodb" {
  name = "blog-lambda-posts-build-status-dynamodb-policy"
  role = aws_iam_role.lambda_posts_build_status.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DynamoDBBuildStateRead"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = var.table_arn
      }
    ]
  })
}

# ======================
# Posts Domain - Build Reconciler Role
# EventBridge/Scheduler invokes this Lambda. It may update only the singleton
# coordinator item and start/poll only the configured CodeBuild project.
# ======================

resource "aws_iam_role" "lambda_posts_build_reconciler" {
  name               = "blog-lambda-posts-build-reconciler-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_posts_build_reconciler_basic_execution" {
  role       = aws_iam_role.lambda_posts_build_reconciler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_posts_build_reconciler_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_posts_build_reconciler.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "lambda_posts_build_reconciler_dynamodb" {
  name = "blog-lambda-posts-build-reconciler-dynamodb-policy"
  role = aws_iam_role.lambda_posts_build_reconciler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DynamoDBBuildStateReconcile"
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
      Resource = var.table_arn
    }]
  })
}

resource "aws_iam_role_policy" "lambda_posts_build_reconciler_codebuild" {
  count = var.codebuild_project_arn != "" ? 1 : 0
  name  = "blog-lambda-posts-build-reconciler-codebuild-policy"
  role  = aws_iam_role.lambda_posts_build_reconciler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CodeBuildStart"
        Effect   = "Allow"
        Action   = ["codebuild:StartBuild"]
        Resource = var.codebuild_project_arn
      },
      {
        # BatchGetBuilds is authorized against the *project* ARN, not a build
        # ARN: IAM has no `build/` resource type for this action, so scoping to
        # `build/<project>:*` denied every reconcile call and left the durable
        # state stuck on a finished build.
        Sid      = "CodeBuildReadBuild"
        Effect   = "Allow"
        Action   = ["codebuild:BatchGetBuilds"]
        Resource = var.codebuild_project_arn
      }
    ]
  })
}

# ======================
# Auth Domain IAM Role
# Out of scope for #493 - already scoped to InitiateAuth /
# RespondToAuthChallenge / GlobalSignOut only (no DynamoDB/S3 access).
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
# Out of scope for #493 - both functions genuinely need S3 read/write/delete
# on the shared bucket (get_upload_url presigns a PUT, which requires
# s3:PutObject on the signing credentials even though the Lambda itself
# never calls S3; delete_image calls s3:DeleteObject directly).
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
# Categories Domain - Read-Only Role
# Used by: list_categories only (public, no auth).
# Confirmed this handler only ever calls dynamodb Scan on the base table
# (no Query/GetItem, no index usage) to load and sort all categories.
# ======================

resource "aws_iam_role" "lambda_categories_read" {
  name               = "blog-lambda-categories-read-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_categories_read_basic_execution" {
  role       = aws_iam_role.lambda_categories_read.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_categories_read_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_categories_read.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "lambda_categories_read_dynamodb" {
  name = "blog-lambda-categories-read-dynamodb-policy"
  role = aws_iam_role.lambda_categories_read.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DynamoDBCategoriesScan"
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = var.categories_table_arn
      }
    ]
  })
}

# ======================
# Categories Domain - Write Role
# Used by: create_category, update_category, delete_category,
#          update_categories_sort_order
#
# API usage confirmed per handler (all use TransactWriteItems for atomic
# slug-reservation / bulk updates; per AWS docs, TransactWriteItems is
# authorized via the underlying PutItem/UpdateItem/DeleteItem permissions
# for each table touched, not a separate "TransactWriteItems" action):
#   create_category -> Scan (conditional, computes max sortOrder when the
#                       caller omits one), TransactWriteItems: Put category
#                       + Put SLUG# reservation (both on Categories table)
#   update_category -> GetItem, Query (SlugIndex), PutItem (non-slug-change
#                       path); on slug change: TransactWriteItems spanning
#                       BOTH tables in the same call - Put/Delete/Put on
#                       Categories (category + slug reservation swap) AND
#                       Update on BlogPosts (rewrites `category` on every
#                       post in the renamed category, paginated at 100
#                       items/call after a Query on BlogPosts CategoryIndex)
#   delete_category -> GetItem (Categories); Query on BlogPosts
#                       CategoryIndex (read-only in-use check - never
#                       writes to BlogPosts); TransactWriteItems: Delete
#                       category + Delete slug reservation (Categories only)
#   update_categories_sort_order (bulk_sort) -> BatchGetItem (verifies all
#                       category IDs exist), TransactWriteItems: N Updates
#                       for sortOrder/updatedAt (Categories only)
#
# NOTE: dynamodb:BatchGetItem was NOT present in the pre-#493 combined
# lambda_categories policy even though update_categories_sort_order calls
# it on every invocation (go-functions/cmd/categories/bulk_sort/main.go)
# - this was a latent gap in the original role. It is included here.
# ======================

resource "aws_iam_role" "lambda_categories_write" {
  name               = "blog-lambda-categories-write-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "lambda_categories_write_basic_execution" {
  role       = aws_iam_role.lambda_categories_write.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_categories_write_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_categories_write.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# DynamoDB access policy for Categories write role
resource "aws_iam_role_policy" "lambda_categories_write_dynamodb" {
  name = "blog-lambda-categories-write-dynamodb-policy"
  role = aws_iam_role.lambda_categories_write.id

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
          "dynamodb:Query",
          "dynamodb:BatchGetItem"
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
