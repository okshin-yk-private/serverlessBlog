# CodeBuild Module - Astro SSG Build and Deploy
# Requirements: 8.5, 9.5, 9.6 (Astro SSG Migration spec)
#
# This module creates:
# - CodeBuild project for Astro SSG build and S3 deployment
# - IAM role with minimal permissions (S3 write, CloudFront invalidation)
# - CloudWatch Log Group for build logs

# Get current AWS account ID
data "aws_caller_identity" "current" {}

locals {
  account_id    = data.aws_caller_identity.current.account_id
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
  buildspec = <<-BUILDSPEC
version: 0.2

env:
  variables:
    PUBLIC_API_URL: "${var.api_url}"
    DEPLOYMENT_BUCKET: "${var.public_site_bucket_name}"
    CLOUDFRONT_DISTRIBUTION_ID: "${var.cloudfront_distribution_id}"

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - echo "Installing Bun..."
      - curl -fsSL https://bun.sh/install | bash
      - export PATH="$HOME/.bun/bin:$PATH"
      - bun --version
  pre_build:
    commands:
      - echo "Installing dependencies..."
      - cd frontend/public-astro && bun install --frozen-lockfile
  build:
    commands:
      - echo "Building Astro site..."
      - cd frontend/public-astro && bun run build
      - echo "Build completed. Output size:"
      - du -sh frontend/public-astro/dist
  post_build:
    commands:
      - echo "Deploying to S3..."
      - DEPLOY_VERSION="v$(date +%s)"
      - echo "Deploy version - $DEPLOY_VERSION"
      - cd frontend/public-astro && aws s3 sync ./dist "s3://$DEPLOYMENT_BUCKET/" --delete --cache-control "public,max-age=31536000,immutable" --exclude "*.html" --exclude "sitemap*.xml" --exclude "rss.xml" --exclude "robots.txt" --exclude "404.html"
      - cd frontend/public-astro && aws s3 sync ./dist "s3://$DEPLOYMENT_BUCKET/" --cache-control "public,max-age=0,must-revalidate" --exclude "*" --include "*.html" --include "sitemap*.xml" --include "rss.xml" --include "robots.txt"
      - echo "S3 sync completed"
      - if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then echo "Invalidating CloudFront cache..." && aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/*" && echo "CloudFront invalidation initiated"; fi
      - echo "Deployment completed successfully"

cache:
  paths:
    - 'frontend/public-astro/node_modules/**/*'
    - 'frontend/public-astro/.astro/**/*'
    - '$HOME/.bun/install/cache/**/*'

reports:
  BuildReport:
    files:
      - '**/*'
    base-directory: 'frontend/public-astro/dist'
    discard-paths: yes
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
          "s3:DeleteObject",
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

# CloudFront invalidation permissions (specific distribution only)
# Requirement 9.5: Minimal permissions limited to specific CloudFront distribution
resource "aws_iam_role_policy" "codebuild_cloudfront" {
  name = "cloudfront-invalidation-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation"
        ]
        Resource = "arn:aws:cloudfront::${local.account_id}:distribution/${var.cloudfront_distribution_id}"
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
      name  = "PUBLIC_API_URL"
      value = var.api_url
    }

    environment_variable {
      name  = "DEPLOYMENT_BUCKET"
      value = var.public_site_bucket_name
    }

    environment_variable {
      name  = "CLOUDFRONT_DISTRIBUTION_ID"
      value = var.cloudfront_distribution_id
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
    type      = var.github_repo != "" ? "GITHUB" : "NO_SOURCE"
    location  = var.github_repo != "" ? var.github_repo : null
    buildspec = local.buildspec

    dynamic "git_submodules_config" {
      for_each = var.github_repo != "" ? [1] : []
      content {
        fetch_submodules = false
      }
    }
  }

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
    aws_iam_role_policy.codebuild_cloudfront
  ]
}

# =============================================================================
# SSM Parameter for CodeBuild Project Name
# Used by Lambda trigger to start builds
# =============================================================================

resource "aws_ssm_parameter" "codebuild_project_name" {
  name        = "/${var.project_name}/${var.environment}/codebuild/astro-build-project"
  description = "CodeBuild project name for Astro SSG builds"
  type        = "String"
  value       = aws_codebuild_project.astro_build.name

  tags = local.common_tags
}
