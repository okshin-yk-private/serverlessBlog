# Discovery Research: Image Upload Enhancement

## Extension Point Analysis

### 1. CloudFront Domain Integration

**Current State:**
- `getUploadUrl` Lambda handler (`functions/images/getUploadUrl/handler.ts:150`) already reads `CLOUDFRONT_DOMAIN` environment variable
- Fallback to S3 URL when env var is not set (lines 184-186)
- CloudFront distribution exists in `CdnStack` with `imageDistribution` getter method

**Extension Point:**
- `LambdaFunctionsStackProps` interface (`infrastructure/lib/lambda-functions-stack.ts:11-18`) needs new `cloudFrontDomainName` property
- `blog-app.ts` needs to pass `cdnStack.imageDistribution.distributionDomainName` to LambdaFunctionsStack
- `commonFunctionProps` environment section needs `CLOUDFRONT_DOMAIN` entry

**Risk Assessment:** Low - Additive change, no circular dependency (CdnStack created before LambdaFunctionsStack)

### 2. Delete Image Lambda Function

**Current Patterns:**
- `deletePost/handler.ts` demonstrates S3 deletion using `DeleteObjectsCommand`
- Auth pattern: `getUserIdFromEvent()` from `shared/auth-utils`
- Error handling: `createErrorResponse()` helper function
- Lambda Powertools integration: Logger, Tracer, Metrics

**New Component Location:**
- `functions/images/deleteImage/handler.ts` - follows existing structure
- Single image deletion vs batch: Use `DeleteObjectCommand` (simpler than `DeleteObjectsCommand`)

**Security Considerations:**
- User ID prefix validation: S3 key must start with `{userId}/`
- Path traversal prevention: Reject keys containing `..`

### 3. API Gateway Integration

**Current Pattern (lambda-functions-stack.ts:271-283):**
```typescript
const adminImagesResource = adminResource.addResource('images');
const uploadUrlResource = adminImagesResource.addResource('upload-url');
uploadUrlResource.addMethod('POST', ...);
```

**New Endpoint:**
- Resource path: `/admin/images/{key+}` (proxy resource for nested keys)
- Method: DELETE
- Authorization: Cognito UserPool (consistent with existing admin endpoints)

**Note:** Using `{key+}` proxy resource allows `userId/uuid.ext` format in path parameter

### 4. Frontend API Integration

**Current Pattern (frontend/admin/src/api/posts.ts):**
- `axios` for HTTP requests
- `getAuthToken()` for Authorization header
- Clean async/await pattern with TypeScript types

**New Function:**
```typescript
export const deleteImage = async (key: string): Promise<void> => {
  const token = getAuthToken();
  await axios.delete(`${API_URL}/admin/images/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};
```

### 5. ImageUploader Component Enhancement

**Current State (ImageUploader.tsx):**
- Has local preview before upload (base64)
- `onUpload` callback passes `imageUrl` back to parent
- No delete functionality

**Extension Points:**
- Add `onDelete` prop for delete callback
- Add delete button (trash icon) overlay on uploaded images
- Confirmation dialog before deletion

### 6. Preview Functionality Analysis

**Current Markdown Preview (PostEditor.tsx):**
- Uses `ReactMarkdown` with `remarkGfm` plugin
- CloudFront URLs will load correctly (same as S3 direct URLs, but with CORS handled by CloudFront)

**No Changes Required:** Once CloudFront URL is returned, existing preview will work automatically

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| S3 delete command | `DeleteObjectCommand` | Single image deletion, simpler than batch |
| API path parameter | `{key+}` | Supports nested keys with `/` |
| Authorization check | User ID prefix validation | S3 key structure: `{userId}/{uuid}.{ext}` |
| CloudFront domain format | `https://{domain}` | Protocol included for direct URL concatenation |

## Dependencies Identified

1. **Stack Dependencies:**
   - LambdaFunctionsStack depends on CdnStack (for domain name)
   - No circular dependency (CdnStack created before LambdaFunctionsStack in blog-app.ts)

2. **Package Dependencies:**
   - No new npm packages required
   - Uses existing AWS SDK v3 clients

3. **Environment Variables:**
   - CLOUDFRONT_DOMAIN (new for uploadUrlFunction)
   - BUCKET_NAME (existing, needed for deleteImageFunction)

## Test Coverage Strategy

1. **Unit Tests (deleteImage handler):**
   - Success case: Valid key with user ID prefix
   - Auth failure: Missing userId from event
   - Authorization failure: Key doesn't match user ID prefix
   - S3 error handling

2. **Integration Tests:**
   - DELETE /admin/images/{key} endpoint
   - 401 for unauthenticated requests
   - 403 for cross-user access attempts
   - 204 for successful deletion

3. **Frontend Tests:**
   - deleteImage API function
   - ImageUploader delete button interaction
   - Confirmation dialog behavior
