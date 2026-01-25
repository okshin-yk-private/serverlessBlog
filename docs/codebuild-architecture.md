# CodeBuild Architecture for Astro SSG

This document explains how AWS CodeBuild is used in this project to build and deploy the Astro SSG public site.

## Overview

CodeBuild is responsible for:
1. Building the Astro static site when blog posts are published/updated/deleted
2. Deploying the built assets to S3
3. Invalidating CloudFront cache to serve updated content

```
┌─────────────────────────────────────────────────────────────────┐
│ Article Publish → Public Site Update Flow                       │
└─────────────────────────────────────────────────────────────────┘

1. Admin UI: Create/Update/Delete post (publishStatus = "published")
      ↓
2. Lambda (create/update/delete)
   ├── Save article to DynamoDB
   └── Trigger CodeBuild via StartBuild API  ← ★ Trigger point
      ↓
3. CodeBuild execution
   ├── Clone source from GitHub  ← ★ Source needed here
   ├── bun install (requires package.json)
   ├── bun run build
   │     ↓
   │   During Astro build, API is called
   │     ↓
   │   GET /posts?publishStatus=published
   │     ↓
   │   Fetch published articles from DynamoDB  ← ★ DB reference
   │     ↓
   │   Generate static HTML
   └── Deploy to S3 + CloudFront invalidation
      ↓
4. Reflected on public site
```

## Build Commands (buildspec.yaml)

The following commands are executed during CodeBuild:

```yaml
phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - curl -fsSL https://bun.sh/install | bash  # Install Bun
      - export BUN_INSTALL="$HOME/.bun"
      - export PATH="$BUN_INSTALL/bin:$PATH"
      - bun --version

  pre_build:
    commands:
      - export PATH="$HOME/.bun/bin:$PATH"
      # Use $CODEBUILD_SRC_DIR for absolute paths (avoids symlink issues)
      - cd "$CODEBUILD_SRC_DIR/frontend/public-astro" && bun install --frozen-lockfile

  build:
    commands:
      - export PATH="$HOME/.bun/bin:$PATH"
      - cd "$CODEBUILD_SRC_DIR/frontend/public-astro" && bun run build
      - du -sh "$CODEBUILD_SRC_DIR/frontend/public-astro/dist"

  post_build:
    commands:
      # Deploy to S3 with cache headers
      # Static assets: 1 year cache (immutable)
      - cd "$CODEBUILD_SRC_DIR/frontend/public-astro" && aws s3 sync ./dist s3://$DEPLOYMENT_BUCKET/ --delete \
          --cache-control "public,max-age=31536000,immutable" \
          --exclude "*.html" --exclude "sitemap*.xml" --exclude "rss.xml" --exclude "robots.txt"
      # HTML/XML files: no cache (must-revalidate)
      - cd "$CODEBUILD_SRC_DIR/frontend/public-astro" && aws s3 sync ./dist s3://$DEPLOYMENT_BUCKET/ \
          --cache-control "public,max-age=0,must-revalidate" \
          --exclude "*" --include "*.html" --include "sitemap*.xml" --include "rss.xml" --include "robots.txt"
      # CloudFront cache invalidation
      - aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"

cache:
  paths:
    - '$HOME/.bun/install/cache/**/*'  # Only cache bun install cache
```

**Important**: Environment variables like `PATH` don't persist between phases in CodeBuild, so each phase must re-export the Bun path.

## GitHub Integration: Required or Not?

### Why Source Code is Required

The Astro build requires the full frontend source code:

```
frontend/public-astro/
├── astro.config.mjs     # Astro configuration
├── package.json         # Dependencies
├── src/
│   ├── components/      # React components
│   ├── layouts/         # Page layouts
│   ├── pages/           # Page templates
│   └── lib/api.ts       # API call logic
└── public/              # Static assets
```

Article data is stored in DynamoDB, but the **UI code** to display it is in GitHub.

### Source Type Comparison

| Source Type | Description | Pros/Cons |
|------------|-------------|-----------|
| `GITHUB` | Clone from GitHub | ✅ Has source / ⚠️ Auth required for private repos |
| `NO_SOURCE` | No source | ❌ `bun install` fails (no package.json) |

### Current Configuration

```hcl
# terraform/environments/dev/main.tf
module "codebuild" {
  source = "../../modules/codebuild"

  github_repo   = "https://github.com/okshin-yk-private/serverlessBlog.git"
  github_branch = "develop"
  # ...
}
```

For **public repositories**: Works as-is without additional configuration.

## Lambda-CodeBuild Integration

### How Lambda Triggers CodeBuild

Lambda functions (create/update/delete post) trigger CodeBuild when a post's publish status changes:

```go
// go-functions/posts/update/main.go
func triggerCodeBuild(ctx context.Context, projectName string) error {
    cfg, err := config.LoadDefaultConfig(ctx)
    if err != nil {
        return err
    }

    client := codebuild.NewFromConfig(cfg)
    _, err = client.StartBuild(ctx, &codebuild.StartBuildInput{
        ProjectName: aws.String(projectName),
    })
    return err
}
```

### IAM Permissions Required

Lambda needs permission to trigger CodeBuild:

```hcl
# terraform/modules/lambda/iam.tf
resource "aws_iam_role_policy" "lambda_codebuild" {
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Action = "codebuild:StartBuild"
      Resource = var.codebuild_project_arn
    }]
  })
}
```

## Private Repository Options

If converting to a private repository, consider these options:

### Option A: AWS CodeStar Connections (Recommended)

Use CodeStar Connections for OAuth-based GitHub authentication:

```hcl
resource "aws_codestarconnections_connection" "github" {
  name          = "serverless-blog-github"
  provider_type = "GitHub"
}

resource "aws_codebuild_project" "astro_build" {
  source {
    type            = "GITHUB"
    location        = "https://github.com/okshin-yk-private/serverlessBlog.git"
    git_clone_depth = 1
    buildspec       = local.buildspec

    # Use CodeStar Connection for auth
    git_submodules_config {
      fetch_submodules = false
    }
  }

  # Add source_credential or use codestar connection
}
```

**Pros**: Standard approach, managed by AWS
**Cons**: Requires manual approval in AWS Console

### Option B: S3 Source

Pre-upload frontend source to S3:

```hcl
resource "aws_codebuild_project" "astro_build" {
  source {
    type     = "S3"
    location = "${aws_s3_bucket.source.id}/frontend.zip"
    buildspec = local.buildspec
  }
}
```

**Pros**: No GitHub auth required
**Cons**: Complex deployment workflow (must upload source before build)

### Option C: Custom Docker Image

Bake frontend source into a custom Docker image:

```dockerfile
FROM public.ecr.aws/codebuild/amazonlinux2-aarch64-standard:3.0
COPY frontend/public-astro /app
WORKDIR /app
```

**Pros**: No GitHub auth, faster builds
**Cons**: Must maintain and update image when source changes

## Terraform Module Structure

```
terraform/modules/codebuild/
├── main.tf           # CodeBuild project, IAM role, CloudWatch logs
├── variables.tf      # Input variables
├── outputs.tf        # Output values
└── tests/
    └── codebuild.tftest.hcl  # Unit tests
```

### Key Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `github_repo` | GitHub repository URL | `""` (empty = NO_SOURCE) |
| `github_branch` | Branch to build | `main` |
| `build_timeout` | Build timeout (minutes) | `15` |
| `compute_type` | CodeBuild compute size | `BUILD_GENERAL1_SMALL` |

## Environment Variables

CodeBuild receives these environment variables:

| Variable | Source | Description |
|----------|--------|-------------|
| `PUBLIC_API_URL` | Terraform | API Gateway URL for Astro build |
| `DEPLOYMENT_BUCKET` | Terraform | S3 bucket for deployment |
| `CLOUDFRONT_DISTRIBUTION_ID` | Terraform | CloudFront ID for invalidation |
| `ENVIRONMENT` | Terraform | Environment name (dev/prd) |

## Monitoring

Build logs are stored in CloudWatch Logs:
- Log group: `/aws/codebuild/serverless-blog-astro-build-{env}`
- Retention: 90 days (prd), 14 days (dev)

### Viewing Build Status

```bash
# View recent builds
aws codebuild list-builds-for-project \
  --project-name serverless-blog-astro-build-dev \
  --sort-order DESCENDING

# View build details
aws codebuild batch-get-builds --ids <build-id>

# View build logs
aws logs tail /aws/codebuild/serverless-blog-astro-build-dev --follow
```

## Related Documentation

- [Deployment Guide](./deployment.md) - Overall deployment process
- [Astro SSG Migration Spec](../.kiro/specs/astro-ssg-migration/) - Requirements and design
- [Terraform Security Tooling](./terraform/docs/SECURITY_TOOLING.md) - Security scanning
