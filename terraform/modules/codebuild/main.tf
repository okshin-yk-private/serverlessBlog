# CodeBuild Module - Astro SSG Build and Deploy
# Requirements: 8.5, 9.5, 9.6 (Astro SSG Migration spec)
#
# This module creates:
# - CodeBuild project for Astro SSG build and S3 deployment
# - IAM role with minimal permissions (S3 release write, KVS pointer update)
# - CloudWatch Log Group for build logs

locals {
  is_production = var.environment == "prd"

  # Log retention: 90 days for prd, 14 days for dev
  log_retention_days = local.is_production ? 90 : 14

  # Project naming
  codebuild_project_name = "${var.project_name}-astro-build-${var.environment}"
  iam_role_name          = "${var.project_name}-codebuild-astro-role-${var.environment}"

  # Common tags
  common_tags = merge(
    {
      Environment = var.environment
      Module      = "codebuild"
      ManagedBy   = "terraform"
    },
    var.tags
  )

  # BuildSpec inline YAML for Astro build and deploy
  # Requirements: 9.1, 9.2 - Bun build step, S3 deployment
  # Note: Uses CODEBUILD_SRC_DIR for reliable absolute paths across phases
  buildspec = <<-BUILDSPEC
version: 0.2

env:
  variables:
    API_URL: "${var.api_url}"
    SITE_URL: "${var.site_url}"
    DEPLOYMENT_BUCKET: "${var.public_site_bucket_name}"
    RELEASE_KVS_ARN: "${var.release_kvs_arn}"
  shell: bash

phases:
  install:
    runtime-versions:
      # Astro 6 以降は Node.js >= 22.12 が必須。
      # 現行イメージ amazonlinux2-aarch64-standard:3.0 は 2024-11 に
      # amazonlinux-aarch64-standard:3.0 へ改称された Amazon Linux 2023 イメージの
      # 旧エイリアスで、nodejs 22 に対応済みのためイメージ変更は不要。
      nodejs: 22
    commands:
      - echo "Installing Bun..."
      - curl -fsSL https://bun.sh/install | bash
      - export BUN_INSTALL="$HOME/.bun"
      - export PATH="$BUN_INSTALL/bin:$PATH"
      - bun --version
      - echo "Working directory is $CODEBUILD_SRC_DIR"
  pre_build:
    commands:
      - export PATH="$HOME/.bun/bin:$PATH"
      - echo "Installing dependencies in $CODEBUILD_SRC_DIR/frontend/public-astro"
      - cd "$CODEBUILD_SRC_DIR/frontend/public-astro" && bun install --frozen-lockfile
      - echo "Installing atomic deployment dependencies"
      - cd "$CODEBUILD_SRC_DIR/scripts/deploy" && bun install --frozen-lockfile
  build:
    commands:
      - export PATH="$HOME/.bun/bin:$PATH"
      - echo "Building Astro site..."
      - cd "$CODEBUILD_SRC_DIR/frontend/public-astro" && bun run build
      - echo "Build completed. Output size is below"
      - du -sh "$CODEBUILD_SRC_DIR/frontend/public-astro/dist"
  post_build:
    commands:
      - |
        RELEASE_SUFFIX="$${CODEBUILD_RESOLVED_SOURCE_VERSION:0:12}"
        if [ -z "$RELEASE_SUFFIX" ]; then
          RELEASE_SUFFIX="manual"
        fi
        # Epoch-seconds sequence keeps promotion monotonic across every
        # deployer sharing the KVS (GitHub Actions deploys, local-deploy.sh).
        RELEASE_REVISION="r$(date +%s)-$${RELEASE_SUFFIX}"
        echo "Uploading and promoting $RELEASE_REVISION"
        cd "$CODEBUILD_SRC_DIR/scripts/deploy"
        bun run deploy -- --bucket "$DEPLOYMENT_BUCKET" --kvs-arn "$RELEASE_KVS_ARN" --dist "$CODEBUILD_SRC_DIR/frontend/public-astro/dist" --region "${var.aws_region}" --revision "$RELEASE_REVISION"
      - echo "Atomic deployment completed successfully"

cache:
  paths:
    - $HOME/.bun/install/cache/**/*
BUILDSPEC
}

# =============================================================================
# CloudWatch Log Group
# =============================================================================

# Requirement 10.8: Build status shall be logged to CloudWatch
resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${local.codebuild_project_name}"
  retention_in_days = local.log_retention_days

  tags = local.common_tags
}

# =============================================================================
# IAM Role for CodeBuild
# =============================================================================

# Requirement 9.5: IAM role shall have minimal permissions
resource "aws_iam_role" "codebuild" {
  name = local.iam_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

# CloudWatch Logs permissions
resource "aws_iam_role_policy" "codebuild_logs" {
  name = "cloudwatch-logs-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          aws_cloudwatch_log_group.codebuild.arn,
          "${aws_cloudwatch_log_group.codebuild.arn}:*"
        ]
      }
    ]
  })
}

# S3 deploy permissions (specific bucket only)
# Requirement 9.5: Minimal permissions limited to specific S3 bucket
resource "aws_iam_role_policy" "codebuild_s3" {
  name = "s3-deploy-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.public_site_bucket_arn,
          "${var.public_site_bucket_arn}/*"
        ]
      }
    ]
  })
}

# CloudFront KeyValueStore data-plane permissions (specific store only)
resource "aws_iam_role_policy" "codebuild_release_kvs" {
  name = "release-kvs-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudfront-keyvaluestore:DescribeKeyValueStore",
          "cloudfront-keyvaluestore:GetKey",
          "cloudfront-keyvaluestore:UpdateKeys"
        ]
        Resource = var.release_kvs_arn
      }
    ]
  })
}

# =============================================================================
# CodeBuild Project
# =============================================================================

# Requirement 8.5: Terraform shall define CodeBuild project for Astro build/deploy
resource "aws_codebuild_project" "astro_build" {
  name          = local.codebuild_project_name
  description   = "Build Astro SSG site and deploy to S3 (${var.environment})"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = var.build_timeout

  # Use ARM64 for cost efficiency (same as Lambda functions)
  environment {
    compute_type                = var.compute_type
    image                       = "aws/codebuild/amazonlinux2-aarch64-standard:3.0"
    type                        = "ARM_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    # Environment variables
    environment_variable {
      name  = "API_URL"
      value = var.api_url
    }

    environment_variable {
      name  = "DEPLOYMENT_BUCKET"
      value = var.public_site_bucket_name
    }

    environment_variable {
      name  = "RELEASE_KVS_ARN"
      value = var.release_kvs_arn
    }

    environment_variable {
      name  = "ENVIRONMENT"
      value = var.environment
    }
  }

  # Source configuration
  # For Lambda-triggered builds, use NO_SOURCE with inline buildspec
  # For GitHub-triggered builds, use GITHUB source
  source {
    type            = var.github_repo != "" ? "GITHUB" : "NO_SOURCE"
    location        = var.github_repo != "" ? var.github_repo : null
    git_clone_depth = var.github_repo != "" ? 1 : null
    buildspec       = local.buildspec

    dynamic "git_submodules_config" {
      for_each = var.github_repo != "" ? [1] : []
      content {
        fetch_submodules = false
      }
    }
  }

  # Source version (branch/tag/commit) - only used when github_repo is set
  source_version = var.github_repo != "" ? var.github_branch : null

  # No artifacts - deploy directly to S3
  artifacts {
    type = "NO_ARTIFACTS"
  }

  # Cache configuration
  # LOCAL_SOURCE_CACHE is only available when source type is not NO_SOURCE
  cache {
    type  = "LOCAL"
    modes = var.github_repo != "" ? ["LOCAL_DOCKER_LAYER_CACHE", "LOCAL_SOURCE_CACHE", "LOCAL_CUSTOM_CACHE"] : ["LOCAL_DOCKER_LAYER_CACHE", "LOCAL_CUSTOM_CACHE"]
  }

  # CloudWatch logs configuration
  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
      status     = "ENABLED"
    }
  }

  tags = local.common_tags

  depends_on = [
    aws_iam_role_policy.codebuild_logs,
    aws_iam_role_policy.codebuild_s3,
    aws_iam_role_policy.codebuild_release_kvs
  ]
}

# =============================================================================
# SSM Parameter for CodeBuild Project Name
# Used by Lambda trigger to start builds
# =============================================================================

resource "aws_ssm_parameter" "codebuild_project_name" {
  #checkov:skip=CKV2_AWS_34:Stores a non-sensitive resource name used to trigger builds; revisit if this parameter becomes sensitive.
  name        = "/${var.project_name}/${var.environment}/codebuild/astro-build-project"
  description = "CodeBuild project name for Astro SSG builds"
  type        = "String"
  value       = aws_codebuild_project.astro_build.name

  tags = local.common_tags
}
