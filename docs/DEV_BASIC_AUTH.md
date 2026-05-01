# DEV Environment Basic Authentication

## Overview

This document describes the Basic Authentication implementation for the DEV environment using CloudFront Functions and AWS Parameter Store.

**Requirement**: R47 - DEV環境Basic認証機能

**Tasks**:
- Task 4.3.1: CloudFront Functions Basic Authentication implementation
- Task 4.3.2: AWS Parameter Store configuration (migrated from cdk.context.json)
- Task 4.3.3: GitHub Actions Playwright auto-authentication

## Architecture

### CloudFront Functions Basic Authentication with Parameter Store

DEV environment uses CloudFront Functions to protect the public site with Basic Authentication. Credentials are centrally managed in AWS Parameter Store.

```
                    ┌──────────────────────┐
                    │  Parameter Store     │
                    │  /serverless-blog/   │
                    │  dev/basic-auth/     │
                    │  ├── username        │
                    │  └── password        │
                    └──────────┬───────────┘
                               │ (Terraform deployment time)
                               ↓
User → CloudFront → CloudFront Function (viewer-request) → S3 Origin
                    ↓ (if auth fails)
                    401 Unauthorized + WWW-Authenticate header
```

**Key Features**:
- **Low Cost**: CloudFront Functions cost ~1/6 of Lambda@Edge (~$0.10/month)
- **Low Latency**: Executes at edge locations in <1ms
- **Simple**: No external dependencies, no network calls
- **DEV Only**: Disabled in dev and production environments
- **Centralized Management**: Credentials stored in Parameter Store (single source of truth)
- **Secure**: KMS-encrypted SecureString parameters

**Parameter Store Benefits**:
- ✅ Single source of truth for credentials
- ✅ CloudTrail audit logs for all access
- ✅ IAM-based access control
- ✅ Version history and rollback support
- ✅ No local file management required
- ✅ Completely free (Standard Parameters)

**Limitations**:
- CloudFront Functions cannot access Parameter Store at runtime
- Credentials are embedded in function code at CDK deployment time
- Credential rotation requires CDK redeployment

## Configuration

### 1. AWS Parameter Store Setup (Task 4.3.2)

#### Create Parameters

Run the following commands to create Basic Auth credentials in Parameter Store:

```bash
# Create username (String)
aws ssm put-parameter \
  --name "/serverless-blog/dev/basic-auth/username" \
  --value "your-username" \
  --type "String" \
  --description "DEV環境Basic認証ユーザー名" \
  --region ap-northeast-1

# Create password (SecureString with KMS encryption)
aws ssm put-parameter \
  --name "/serverless-blog/dev/basic-auth/password" \
  --value "your-secure-password" \
  --type "SecureString" \
  --description "DEV環境Basic認証パスワード（KMS暗号化）" \
  --region ap-northeast-1
```

**Important Notes**:
- Password is stored as `SecureString` (KMS-encrypted)
- Default KMS key (`alias/aws/ssm`) is used (no additional cost)
- Parameters are region-specific (`ap-northeast-1`)

#### Verify Parameters

```bash
# List parameters
aws ssm get-parameters-by-path \
  --path "/serverless-blog/dev/basic-auth" \
  --region ap-northeast-1

# Get decrypted password (requires permissions)
aws ssm get-parameter \
  --name "/serverless-blog/dev/basic-auth/password" \
  --with-decryption \
  --region ap-northeast-1
```

### 2. IAM Permissions

Ensure your GitHub Actions OIDC Role has Parameter Store read permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": [
        "arn:aws:ssm:ap-northeast-1:*:parameter/serverless-blog/*/basic-auth/*"
      ]
    }
  ]
}
```

### 3. CDK Deployment

The CDK stack automatically retrieves credentials from Parameter Store during deployment:

```bash
cd infrastructure
cdk deploy --context stage=dev --all
```

**How it works**:
1. CDK reads credentials from Parameter Store using `StringParameter.valueFromLookup()`
2. Values are cached in `cdk.context.json` (auto-generated, gitignored)
3. Credentials are embedded into CloudFront Function code
4. CloudFront Function validates credentials at runtime

**Cache Management**:
```bash
# Clear cache after updating Parameter Store
cdk context --clear
cdk deploy --context stage=dev --all
```

### 4. Playwright Auto-Authentication (Task 4.3.3)

#### Option A: Use Parameter Store (Recommended)

CDK automatically retrieves credentials, no additional configuration needed.

#### Option B: Use GitHub Secrets (Alternative)

If you prefer to manage E2E test credentials separately:

**Add GitHub Secrets**:
1. Go to repository Settings → Secrets and variables → Actions
2. Add `DEV_BASIC_AUTH_USERNAME`
3. Add `DEV_BASIC_AUTH_PASSWORD`

**Playwright Configuration**:

The Playwright configuration (`playwright.config.ts`) automatically uses these environment variables:

```typescript
extraHTTPHeaders:
  process.env.DEV_BASIC_AUTH_USERNAME && process.env.DEV_BASIC_AUTH_PASSWORD
    ? {
        Authorization: `Basic ${Buffer.from(
          `${process.env.DEV_BASIC_AUTH_USERNAME}:${process.env.DEV_BASIC_AUTH_PASSWORD}`
        ).toString('base64')}`,
      }
    : undefined,
```

#### Local Testing

For local E2E testing against DEV environment:

```bash
export DEV_BASIC_AUTH_USERNAME="your-username"
export DEV_BASIC_AUTH_PASSWORD="your-password"
npm run test:e2e
```

## Implementation Details

### CloudFront Function Code

The function checks the `Authorization` header and validates credentials:

```javascript
function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // Expected credentials (embedded at deployment time from Parameter Store)
  var authString = 'Basic ' + btoa('username:password');

  // Check if Authorization header exists
  if (
    typeof headers.authorization === 'undefined' ||
    headers.authorization.value !== authString
  ) {
    // Return 401 Unauthorized with WWW-Authenticate header
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'www-authenticate': { value: 'Basic realm="DEV Environment"' },
      },
    };
  }

  // Authentication successful - forward request to origin
  return request;
}
```

### Environment-Based Deployment

| Environment | Basic Auth | CloudFront Function | Parameter Store |
|-------------|-----------|---------------------|----------------|
| dev         | Disabled  | Not created         | Not used       |
| dev         | **Enabled** | **Created**       | **Used**       |
| prd         | Disabled  | Not created         | Not used       |

## Security Considerations

### Credential Storage Architecture

```
┌─────────────────────────────────────────────────┐
│  Parameter Store (Single Source of Truth)       │
│  - KMS-encrypted SecureString                   │
│  - CloudTrail audit logs                        │
│  - IAM access control                           │
│  - Version history                              │
└────────────┬────────────────────────────────────┘
             │
             ├─→ CDK Deployment (retrieves at build time)
             │   └─→ CloudFront Function (credentials embedded)
             │
             └─→ Optional: GitHub Secrets (for E2E tests)
                 └─→ Playwright (authentication headers)
```

### Best Practices

1. **Use Strong Passwords**: Minimum 16 characters, mixed case, numbers, symbols
2. **Rotate Regularly**: Update credentials every 90 days
3. **IAM Least Privilege**: Grant Parameter Store access only to necessary roles
4. **Monitor Access**: Review CloudTrail logs for Parameter Store access
5. **Never Commit**: `cdk.context.json` is auto-generated and gitignored

### Credential Rotation

To rotate credentials:

#### 1. Update Parameter Store

```bash
# Update password with new value
aws ssm put-parameter \
  --name "/serverless-blog/dev/basic-auth/password" \
  --value "new-secure-password" \
  --type "SecureString" \
  --overwrite \
  --region ap-northeast-1

# Optionally update username
aws ssm put-parameter \
  --name "/serverless-blog/dev/basic-auth/username" \
  --value "new-username" \
  --type "String" \
  --overwrite \
  --region ap-northeast-1
```

#### 2. Clear CDK Cache and Redeploy

```bash
cd infrastructure
cdk context --clear
cdk deploy --context stage=dev --all
```

#### 3. (Optional) Update GitHub Secrets

If using GitHub Secrets for E2E tests:
- Update `DEV_BASIC_AUTH_USERNAME`
- Update `DEV_BASIC_AUTH_PASSWORD`

### Audit and Compliance

View Parameter Store access history:

```bash
# CloudTrail events for Parameter Store access
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=/serverless-blog/dev/basic-auth/password \
  --region ap-northeast-1
```

## Testing

### Manual Testing

1. Access DEV environment URL
2. Browser will show Basic Auth prompt
3. Enter username and password from Parameter Store
4. Access granted on success

### Automated E2E Testing

GitHub Actions automatically authenticates using `extraHTTPHeaders`:

```yaml
- name: Run E2E Tests (DEV)
  env:
    DEV_BASIC_AUTH_USERNAME: ${{ secrets.DEV_BASIC_AUTH_USERNAME }}
    DEV_BASIC_AUTH_PASSWORD: ${{ secrets.DEV_BASIC_AUTH_PASSWORD }}
    BASE_URL: ${{ steps.get-outputs.outputs.public-site-url }}
  run: npm run test:e2e
```

## Troubleshooting

### Issue: 401 Unauthorized in E2E Tests

**Solution 1**: Verify Parameter Store values match GitHub Secrets (if using):
```bash
# Get Parameter Store values
aws ssm get-parameter --name "/serverless-blog/dev/basic-auth/username" --region ap-northeast-1
aws ssm get-parameter --name "/serverless-blog/dev/basic-auth/password" --with-decryption --region ap-northeast-1
```

**Solution 2**: Clear CDK cache and redeploy:
```bash
cdk context --clear
cdk deploy --context stage=dev --all
```

### Issue: CloudFront Function Not Created

**Solution**: Verify stage context is set to 'dev':
```bash
cdk deploy --context stage=dev --all
```

### Issue: Parameter Not Found During CDK Deploy

**Solution**: Verify parameters exist in correct region:
```bash
aws ssm get-parameters-by-path \
  --path "/serverless-blog/dev/basic-auth" \
  --region ap-northeast-1
```

### Issue: Permission Denied When Accessing Parameter Store

**Solution**: Verify IAM role has `ssm:GetParameter` permissions:
```bash
# Check current credentials
aws sts get-caller-identity

# Test parameter access
aws ssm get-parameter \
  --name "/serverless-blog/dev/basic-auth/username" \
  --region ap-northeast-1
```

## Cost Analysis

| Service | Monthly Cost (DEV) | Notes |
|---------|-------------------|-------|
| CloudFront Functions | ~$0.10 | 2M free requests, then $0.10/million |
| Parameter Store (Standard) | **$0.00** | Standard parameters are free |
| KMS (default key) | **$0.00** | Default AWS-managed keys are free |
| CloudFront Data Transfer | Variable | Based on traffic |
| **Total Estimated** | **< $1** | Minimal cost for DEV environment |

**Comparison**:
- Lambda@Edge: ~$0.60/month (6x more expensive)
- AWS WAF IP Set: ~$6/month ($5 Web ACL + $1 IP Set + request fees)
- Parameter Store (Advanced): $0.05/parameter/month
- Secrets Manager: $0.40/secret/month + API call fees

## Migration Notes

### From cdk.context.json to Parameter Store

This implementation was migrated from local `cdk.context.json` storage to AWS Parameter Store:

**Before (cdk.context.json)**:
```json
{
  "basicAuth": {
    "username": "<dev-username>",
    "password": "<REDACTED-EXAMPLE-PASSWORD>"
  }
}
```

**After (Parameter Store)**:
```bash
/serverless-blog/dev/basic-auth/username → "<dev-username>"
/serverless-blog/dev/basic-auth/password → "<REDACTED-EXAMPLE-PASSWORD>" (encrypted)
```

**Migration Benefits**:
- ✅ No local credential files
- ✅ Centralized credential management
- ✅ CloudTrail audit logs
- ✅ IAM-based access control
- ✅ Team collaboration without sharing files

## References

- **Design Document**: `.kiro/specs/serverless-blog-aws/design.md` (設計決定 9)
- **Requirements**: `.kiro/specs/serverless-blog-aws/requirements.md` (R47)
- **Tasks**: `.kiro/specs/serverless-blog-aws/tasks.md` (4.3.1, 4.3.2, 4.3.3)
- **CloudFront Functions Documentation**: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html
- **Parameter Store Documentation**: https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html
- **Parameter Store Pricing**: https://aws.amazon.com/systems-manager/pricing/ (Standard Parameters are FREE)
