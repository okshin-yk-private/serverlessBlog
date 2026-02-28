# CodeBuild Architecture for Astro SSG

This document explains how AWS CodeBuild is used in this project to build and deploy the Astro SSG public site.

## Overview

CodeBuild is responsible for:
1. Building the Astro static site when blog posts are published/updated/deleted
2. Deploying the built assets to S3
3. Invalidating CloudFront cache to serve updated content

## Admin Article Update/Delete → Public Site Reflection Flow

The following diagram shows the complete flow from Admin operations to public site updates:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Admin画面                                                                │
│ ┌──────────────┐     ┌──────────────┐                                   │
│ │ 記事更新      │     │ 記事削除      │                                   │
│ │ PUT /posts/:id│     │ DELETE /posts/:id│                              │
│ └──────┬───────┘     └──────┬───────┘                                   │
└────────┼───────────────────┼────────────────────────────────────────────┘
         │                   │
         ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Lambda関数                                                               │
│                                                                          │
│  Update Handler                     Delete Handler                       │
│  ┌─────────────────────┐           ┌─────────────────────┐              │
│  │ 1. DynamoDB更新     │           │ 1. S3画像削除        │              │
│  │ 2. publishStatus    │           │ 2. DynamoDB削除      │              │
│  │    == "published"?  │           │    (ハードデリート)    │              │
│  │    → CodeBuild起動  │           │ 3. publishStatus     │              │
│  └─────────────────────┘           │    == "published"?   │              │
│           │                        │    → CodeBuild起動   │              │
│           │                        └─────────────────────┘              │
│           │                                  │                           │
└───────────┼──────────────────────────────────┼───────────────────────────┘
            │                                  │
            └──────────────┬───────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CodeBuild (Astro SSG Build)                                             │
│                                                                          │
│  1. GitHub clone (develop branch)                                        │
│  2. bun install                                                          │
│  3. bun run build                                                        │
│     ┌─────────────────────────────────────────────┐                     │
│     │ Astro Build Process                          │                     │
│     │ - GET /posts?publishStatus=published         │                     │
│     │ - 公開済み記事のみ取得                         │                     │
│     │ - 各記事のHTML生成 (/posts/[id]/index.html)  │                     │
│     └─────────────────────────────────────────────┘                     │
│  4. S3 sync (静的ファイルアップロード)                                    │
│  5. CloudFront invalidation                                              │
└─────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 公開サイト (S3 + CloudFront)                                             │
│ - 更新された記事が反映                                                    │
│ - 削除された記事のページは生成されない                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Lambda Trigger Details

### Update Lambda (`go-functions/cmd/posts/update/main.go`)

| Item | Value |
|------|-------|
| CodeBuild Trigger Condition | When `publishStatus` is set to `"published"` |
| Trigger Timing | After successful update (async) |
| Error Handling | Log output only (request does not fail) |

```go
// lines 225-231
func shouldTriggerBuild(_, req *domain.UpdatePostRequest) bool {
    return req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished
}
```

### Delete Lambda (`go-functions/cmd/posts/delete/main.go`)

| Item | Value |
|------|-------|
| Delete Type | **Hard delete** (completely removed from DynamoDB) |
| CodeBuild Trigger Condition | When deleted post had `publishStatus == "published"` |
| S3 Images | Related images are also deleted |

```go
// lines 136-140
if existingPost.PublishStatus == domain.PublishStatusPublished {
    triggerSiteBuild(ctx)
}
```

### Build Trigger (`go-functions/internal/buildtrigger/buildtrigger.go`)

| Feature | Description |
|---------|-------------|
| Coalescing | Minimum 1-minute interval (suppresses rapid consecutive updates) |
| Deduplication | Skips new trigger if build is already in progress |
| Async Execution | Does not block Lambda response |

## Deleted Article Reflection Mechanism

1. **DynamoDB**: Article record is hard deleted
2. **CodeBuild**: Automatically triggered when published article is deleted
3. **Astro Build**: Deleted articles are not fetched due to `publishStatus=published` filter
4. **S3**: Old HTML files are deleted via `--delete` option in `s3 sync`
5. **CloudFront**: Cache is immediately cleared via invalidation

## Astro Build Process

### Data Fetching

```typescript
// src/lib/api.ts
export async function fetchAllPosts(): Promise<Post[]> {
  const url = `${apiUrl}/posts?publishStatus=published`;
  // Only fetches published posts
}
```

### Page Generation

```typescript
// src/pages/posts/[id].astro
export async function getStaticPaths() {
  const posts = await fetchAllPosts();  // Published posts only
  return posts.map((post) => ({
    params: { id: post.id },
    props: { post },
  }));
}
```

### Generated Files

- `/index.html` - Top page (article list)
- `/posts/[id]/index.html` - Individual article pages
- `/rss.xml` - RSS feed

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

## Notes and Limitations

| Item | Description |
|------|-------------|
| Reflection Delay | CodeBuild execution time (~1-2 min) + CloudFront invalidation |
| Build Interval | Minimum 1 minute (consecutive operations are batched) |
| Draft Deletion | CodeBuild is NOT triggered (no impact on public site) |
| On Failure | Log output only, manual re-execution required |

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

## Related Files

| File | Role |
|------|------|
| `go-functions/cmd/posts/update/main.go` | Update Lambda |
| `go-functions/cmd/posts/delete/main.go` | Delete Lambda |
| `go-functions/internal/buildtrigger/buildtrigger.go` | CodeBuild trigger logic |
| `frontend/public-astro/src/lib/api.ts` | Astro API client |
| `frontend/public-astro/src/pages/posts/[id].astro` | Article detail page |
| `terraform/modules/codebuild/main.tf` | CodeBuild configuration |

## Related Documentation

- [Deployment Guide](./deployment.md) - Overall deployment process
- [Astro SSG Migration Spec](../.kiro/specs/astro-ssg-migration/) - Requirements and design
- [Terraform Security Tooling](./terraform/docs/SECURITY_TOOLING.md) - Security scanning
