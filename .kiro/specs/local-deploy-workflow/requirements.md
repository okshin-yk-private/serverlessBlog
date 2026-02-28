# Requirements Document

## Introduction

This specification defines requirements for implementing a local deployment workflow that replicates the functionality of the GitHub Actions CI/CD pipeline. The goal is to enable developers to execute the same deployment steps locally for testing, debugging, and development purposes without pushing changes to the remote repository.

The existing GitHub Actions workflow (`deploy.yml`) handles:
- Go Lambda binary builds (parallel matrix builds with caching)
- Terraform infrastructure deployment (dev/prd environments)
- Frontend builds (public and admin sites)
- S3 static site deployment
- CloudFront cache invalidation

The local workflow should mirror these capabilities while adapting to local execution constraints (no GitHub-specific features like OIDC, artifacts, environments).

## Requirements

### Requirement 1: Local Deploy Script Entry Point
**Objective:** As a developer, I want a single entry point script for local deployments, so that I can easily execute the deployment workflow without remembering multiple commands.

#### Acceptance Criteria
1. The Local Deploy Script shall provide a `scripts/local-deploy.sh` executable script at the repository root.
2. When the script is executed without arguments, the Local Deploy Script shall display usage help with available options.
3. When the script is executed with `--env dev`, the Local Deploy Script shall target the development environment.
4. When the script is executed with `--env prd`, the Local Deploy Script shall target the production environment.
5. The Local Deploy Script shall default to the development environment when `--env` is not specified.
6. When the script is executed with `--component infrastructure`, the Local Deploy Script shall deploy only infrastructure (Terraform + Lambda).
7. When the script is executed with `--component frontend`, the Local Deploy Script shall deploy only frontend sites.
8. When the script is executed with `--component all`, the Local Deploy Script shall deploy all components.
9. The Local Deploy Script shall default to deploying all components when `--component` is not specified.
10. When the script is executed with `--dry-run`, the Local Deploy Script shall show what would be deployed without making changes.

### Requirement 2: AWS Credential Validation
**Objective:** As a developer, I want the local deploy script to validate AWS credentials before deployment, so that I can avoid failed deployments due to authentication issues.

#### Acceptance Criteria
1. When the script starts, the Local Deploy Script shall verify that AWS CLI is installed.
2. When the script starts, the Local Deploy Script shall verify that valid AWS credentials are configured.
3. If AWS CLI is not installed, the Local Deploy Script shall display an error message with installation instructions.
4. If AWS credentials are invalid or expired, the Local Deploy Script shall display an error message and exit with code 1.
5. When the script validates credentials, the Local Deploy Script shall display the current AWS account ID and region.
6. The Local Deploy Script shall support credentials from `~/.aws/credentials`, environment variables, and AWS SSO.

### Requirement 3: Prerequisite Validation
**Objective:** As a developer, I want the local deploy script to validate all prerequisites before starting deployment, so that I can identify missing tools early.

#### Acceptance Criteria
1. When the script starts, the Local Deploy Script shall verify that Go 1.25+ is installed.
2. When the script starts, the Local Deploy Script shall verify that Terraform 1.14+ is installed.
3. When the script starts, the Local Deploy Script shall verify that Bun is installed for frontend builds.
4. When the script starts, the Local Deploy Script shall verify that Node.js 22+ is installed.
5. If any prerequisite is missing, the Local Deploy Script shall display a specific error message with installation instructions.
6. If all prerequisites are met, the Local Deploy Script shall display a success confirmation message.
7. When the script is executed with `--skip-prereq-check`, the Local Deploy Script shall skip prerequisite validation.

### Requirement 4: Go Lambda Binary Build
**Objective:** As a developer, I want the local deploy script to build all Go Lambda binaries, so that the Terraform deployment has the required artifacts.

#### Acceptance Criteria
1. When infrastructure deployment is requested, the Local Deploy Script shall build all 11 Lambda functions (posts: create, get, get_public, list, update, delete; auth: login, logout, refresh; images: get_upload_url, delete).
2. The Local Deploy Script shall build Lambda binaries for Linux ARM64 architecture with CGO disabled.
3. The Local Deploy Script shall use the `-trimpath` flag for reproducible builds.
4. The Local Deploy Script shall use the `-ldflags="-s -w"` flags for binary size optimization.
5. The Local Deploy Script shall use the `-tags="lambda.norpc"` flag for Lambda optimization.
6. When a Lambda build fails, the Local Deploy Script shall display the error and exit with code 1.
7. When all Lambda builds succeed, the Local Deploy Script shall display the count and total build time.
8. The Local Deploy Script shall output binaries to `go-functions/bin/{function-name}/bootstrap`.
9. When the script is executed with `--parallel`, the Local Deploy Script shall build Lambda functions in parallel.
10. The Local Deploy Script shall default to parallel builds when `--parallel` is not specified.

### Requirement 5: Terraform Deployment
**Objective:** As a developer, I want the local deploy script to execute Terraform deployment, so that I can update AWS infrastructure from my local machine.

#### Acceptance Criteria
1. When infrastructure deployment is requested, the Local Deploy Script shall run `terraform init` in the target environment directory.
2. When infrastructure deployment is requested, the Local Deploy Script shall run `terraform plan` and display the planned changes.
3. If the plan shows no changes, the Local Deploy Script shall display "No changes required" and skip apply.
4. When plan shows changes and `--dry-run` is not set, the Local Deploy Script shall prompt for confirmation before apply.
5. When the user confirms, the Local Deploy Script shall run `terraform apply` with the plan file.
6. When the script is executed with `--auto-approve`, the Local Deploy Script shall skip the confirmation prompt.
7. When targeting prd environment without `--auto-approve`, the Local Deploy Script shall require double confirmation with "I understand this is production".
8. The Local Deploy Script shall retrieve Basic Auth credentials from SSM for dev environment.
9. When Terraform apply fails, the Local Deploy Script shall display the error and exit with code 1.
10. When Terraform apply succeeds, the Local Deploy Script shall display CloudFront domain and API endpoint from outputs.

### Requirement 6: Frontend Build
**Objective:** As a developer, I want the local deploy script to build frontend applications, so that I can deploy updated static sites.

#### Acceptance Criteria
1. When frontend deployment is requested, the Local Deploy Script shall build the public site from `frontend/public/`.
2. When frontend deployment is requested, the Local Deploy Script shall build the admin site from `frontend/admin/`.
3. The Local Deploy Script shall run `bun install --frozen-lockfile` before building each site.
4. The Local Deploy Script shall set `NODE_ENV=production` during frontend builds.
5. When building admin site, the Local Deploy Script shall retrieve Cognito configuration from SSM.
6. When building admin site, the Local Deploy Script shall set `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID` environment variables.
7. When a frontend build fails, the Local Deploy Script shall display the error and exit with code 1.
8. When frontend builds succeed, the Local Deploy Script shall display build output size and time.

### Requirement 7: S3 Deployment
**Objective:** As a developer, I want the local deploy script to deploy built frontend assets to S3, so that the static sites are updated.

#### Acceptance Criteria
1. When frontend deployment is requested, the Local Deploy Script shall retrieve bucket names from SSM parameters.
2. The Local Deploy Script shall sync public site build to the public site S3 bucket with `--delete` flag.
3. The Local Deploy Script shall sync admin site build to the admin site S3 bucket with `--delete` flag.
4. When S3 sync fails, the Local Deploy Script shall display the error and exit with code 1.
5. When S3 sync succeeds, the Local Deploy Script shall display the number of files uploaded and deleted.

### Requirement 8: CloudFront Cache Invalidation
**Objective:** As a developer, I want the local deploy script to invalidate CloudFront cache after frontend deployment, so that users see the latest content.

#### Acceptance Criteria
1. When frontend deployment succeeds, the Local Deploy Script shall create a CloudFront invalidation for path `/*`.
2. The Local Deploy Script shall retrieve the CloudFront distribution ID from the deployed infrastructure.
3. If CloudFront distribution is not found, the Local Deploy Script shall display a warning and continue.
4. When the script is executed with `--no-invalidation`, the Local Deploy Script shall skip CloudFront invalidation.
5. When invalidation is created, the Local Deploy Script shall display the invalidation ID.

### Requirement 9: Deployment Summary and Status
**Objective:** As a developer, I want the local deploy script to provide clear deployment status, so that I can verify what was deployed.

#### Acceptance Criteria
1. When deployment completes, the Local Deploy Script shall display a summary of all deployed components.
2. The Local Deploy Script shall display the total deployment duration.
3. The Local Deploy Script shall display CloudFront URL, API endpoint URL, and environment name.
4. If any deployment step fails, the Local Deploy Script shall display which step failed.
5. The Local Deploy Script shall exit with code 0 on success and code 1 on failure.
6. When the script is executed with `--verbose`, the Local Deploy Script shall display detailed output from each step.

### Requirement 10: Selective Component Deployment
**Objective:** As a developer, I want to deploy specific Lambda functions or frontend sites individually, so that I can save time during development.

#### Acceptance Criteria
1. When the script is executed with `--lambda posts-create`, the Local Deploy Script shall build and deploy only the posts-create Lambda function.
2. When the script is executed with `--frontend public`, the Local Deploy Script shall build and deploy only the public site.
3. When the script is executed with `--frontend admin`, the Local Deploy Script shall build and deploy only the admin site.
4. When deploying a single Lambda function, the Local Deploy Script shall run targeted Terraform apply for that resource.
5. If the specified Lambda function name is invalid, the Local Deploy Script shall display an error with valid function names.

### Requirement 11: Environment Consistency with GitHub Actions
**Objective:** As a developer, I want the local deploy script to use the same tool versions as GitHub Actions, so that deployments are consistent.

#### Acceptance Criteria
1. The Local Deploy Script shall display a warning if local Go version differs from GitHub Actions (1.25.5).
2. The Local Deploy Script shall display a warning if local Terraform version differs from GitHub Actions (1.14.0).
3. The Local Deploy Script shall display a warning if local Node.js version differs from GitHub Actions (22.x).
4. When the script is executed with `--strict-versions`, the Local Deploy Script shall exit with error if versions don't match.

### Requirement 12: SSM Parameter Integration
**Objective:** As a developer, I want the local deploy script to retrieve configuration from SSM, so that I use the same settings as the CI/CD pipeline.

#### Acceptance Criteria
1. When deploying dev environment, the Local Deploy Script shall retrieve Basic Auth credentials from `/serverless-blog/dev/basic-auth/username` and `/serverless-blog/dev/basic-auth/password`.
2. When building admin frontend, the Local Deploy Script shall retrieve Cognito config from `/serverless-blog/{env}/cognito/user-pool-id` and `/serverless-blog/{env}/cognito/user-pool-client-id`.
3. When deploying frontend, the Local Deploy Script shall retrieve bucket names from `/serverless-blog/{env}/storage/public-site-bucket-name` and `/serverless-blog/{env}/storage/admin-site-bucket-name`.
4. If an SSM parameter is not found, the Local Deploy Script shall display an error with the parameter path.
5. The Local Deploy Script shall mask sensitive SSM values in output logs.

