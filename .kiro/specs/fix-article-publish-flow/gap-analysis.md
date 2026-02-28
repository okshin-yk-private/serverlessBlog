# Gap Analysis: fix-article-publish-flow

## Executive Summary

The investigation revealed **3 critical bugs** in the article publishing workflow, all located in the backend Go Lambda `listPosts` function. The frontend code is correctly sending data, but the API doesn't support the required functionality.

### Key Findings

- **Bug 1**: `listPosts` Lambda doesn't accept `publishStatus` as a query parameter - always returns only published posts
- **Bug 2**: `listPosts` Lambda doesn't return `count`/`total` field - dashboard cannot display accurate article counts
- **Bug 3**: Same Lambda function serves both public (`/posts`) and admin (`/admin/posts`) endpoints, but admin needs to query by status

## Current State Investigation

### Domain-Related Assets

| Component | Location | Purpose |
|-----------|----------|---------|
| Go createPost Lambda | `go-functions/cmd/posts/create/main.go` | Creates articles - **✅ Works correctly** |
| Go listPosts Lambda | `go-functions/cmd/posts/list/main.go` | Lists articles - **❌ Missing functionality** |
| Go get_public Lambda | `go-functions/cmd/posts/get_public/main.go` | Get single published post - **✅ Works correctly** |
| Domain types | `go-functions/internal/domain/types.go` | BlogPost, CreatePostRequest types - **✅ Correct** |
| Admin frontend API | `frontend/admin/src/api/posts.ts` | API calls to `/admin/posts` - **✅ Sends correct params** |
| Admin DashboardPage | `frontend/admin/src/pages/DashboardPage.tsx` | Displays stats - **✅ Expects count/total** |
| API Gateway config | `infrastructure/lib/api-integrations-stack.ts` | Routes - same Lambda for public and admin |

### Architecture Pattern

```
Frontend Admin                    API Gateway                     Lambda
┌───────────────┐               ┌───────────────┐              ┌───────────────┐
│ DashboardPage │──GET /admin/posts?publishStatus=draft──────►│               │
│   (expects    │               │  /admin/posts │──────────────│  listPosts    │
│   count)      │               │  (authorized) │              │  (ignores     │
└───────────────┘               └───────────────┘              │ publishStatus)│
                                                               │               │
Frontend Public                                                │ Returns only  │
┌───────────────┐               ┌───────────────┐              │ published     │
│ PostListPage  │──GET /posts ─────────────────────────────────│ posts         │
└───────────────┘               │   /posts      │              │               │
                                │ (public)      │              │ No count      │
                                └───────────────┘              └───────────────┘
```

### Root Cause Analysis

**File: `go-functions/cmd/posts/list/main.go`**

```go
// Line 89-95 - Only reads these params:
limit := parseLimit(queryParams["limit"])
category := queryParams["category"]
exclusiveStartKey := parseNextToken(queryParams["nextToken"])

// ❌ Missing: publishStatus := queryParams["publishStatus"]
```

```go
// Line 174-204 - buildQueryInput always filters for published:
if category != "" {
    // Uses CategoryIndex with filter for publishStatus = "published"
    queryInput.FilterExpression = aws.String("publishStatus = :publishStatus")
    queryInput.ExpressionAttributeValues = map[string]types.AttributeValue{
        ":publishStatus": &types.AttributeValueMemberS{Value: domain.PublishStatusPublished},
    }
} else {
    // Uses PublishStatusIndex with publishStatus = "published"
    queryInput.KeyConditionExpression = aws.String("publishStatus = :publishStatus")
    queryInput.ExpressionAttributeValues = map[string]types.AttributeValue{
        ":publishStatus": &types.AttributeValueMemberS{Value: domain.PublishStatusPublished},
    }
}
// ❌ Never queries for "draft" status
```

```go
// Line 117-122 - Response structure lacks count:
response := ListPostsResponseBody{
    Items:     items,
    NextToken: nextToken,
}
// ❌ Missing: Count/Total field
```

## Requirements Feasibility Analysis

### Requirement 1: Correct Article Status Storage
**Status: ✅ Already Implemented Correctly**

The `createPost` Lambda (lines 92-98) correctly handles publishStatus:
```go
publishStatus := domain.PublishStatusDraft
var publishedAt *string
if req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished {
    publishStatus = domain.PublishStatusPublished
    publishedAt = &now
}
```

### Requirement 2: Admin Dashboard Statistics Accuracy
**Status: ❌ Gap Identified**

- **Missing**: `publishStatus` query parameter support in listPosts
- **Missing**: `count` or `total` field in API response
- **Constraint**: DynamoDB Query doesn't return count without separate Count operation

### Requirement 3: Public Site Article Display
**Status: ⚠️ Partially Working**

- Public endpoint `/posts` returns only published articles (correct behavior)
- However, needs verification that new published articles appear correctly

### Requirement 4: Article Creation API Correctness
**Status: ✅ Already Implemented Correctly**

The createPost Lambda correctly validates and stores publishStatus.

### Requirement 5: Data Integrity in PublishStatusIndex GSI
**Status: ✅ Infrastructure Correct**

DynamoDB GSI definition is correct per `infrastructure/lib/database-stack.ts`:
- PublishStatusIndex: Partition Key = `publishStatus`, Sort Key = `createdAt`

## Implementation Approach Options

### Option A: Extend listPosts Lambda (Recommended)

**Changes Required:**
1. Add `publishStatus` query parameter parsing
2. Modify `buildQueryInput()` to use parameter value instead of hardcoded "published"
3. Add `Count` field to response using DynamoDB Select: COUNT or separate query
4. Add authenticated user detection to determine if admin or public request

**Files to Modify:**
- `go-functions/cmd/posts/list/main.go`
- `go-functions/cmd/posts/list/main_test.go`

**Trade-offs:**
- ✅ Minimal code changes (single file)
- ✅ Backward compatible (defaults to "published" for public)
- ✅ Reuses existing infrastructure
- ❌ Single function handles both public and admin logic

### Option B: Create Separate Admin List Lambda

**Changes Required:**
1. Create new `go-functions/cmd/posts/list_admin/main.go`
2. Update CDK to add new Lambda function
3. Update API Gateway to route `/admin/posts` to new function

**Files to Create:**
- `go-functions/cmd/posts/list_admin/main.go`
- `go-functions/cmd/posts/list_admin/main_test.go`

**Files to Modify:**
- `infrastructure/lib/go-lambda-stack.ts`
- `infrastructure/lib/api-integrations-stack.ts`

**Trade-offs:**
- ✅ Clean separation of public vs admin logic
- ✅ Easier to test in isolation
- ❌ More files to maintain
- ❌ Duplicated query logic
- ❌ More CDK changes required

### Option C: Hybrid - Extend with Feature Detection

Extend listPosts to detect if request is authenticated (via Cognito authorizer context) and:
- If authenticated: accept `publishStatus` parameter, return count
- If not authenticated: only return published posts, no count

**Trade-offs:**
- ✅ Single codebase
- ✅ Automatic behavior based on authentication
- ❌ More complex logic in single function
- ❌ Harder to test edge cases

## Implementation Complexity & Risk

| Aspect | Rating | Justification |
|--------|--------|---------------|
| **Effort** | **S (1-3 days)** | Extend existing Go function, add parameter parsing, update tests |
| **Risk** | **Low** | Familiar patterns, clear scope, minimal integration points |

### Risk Factors
- ✅ Go Lambda pattern well-established in codebase
- ✅ DynamoDB GSI already exists
- ✅ Tests provide safety net
- ⚠️ Need to ensure backward compatibility for public endpoint

## Recommendations for Design Phase

### Preferred Approach
**Option A: Extend listPosts Lambda** is recommended because:
1. Lowest implementation effort
2. All changes in single file
3. Maintains backward compatibility
4. Existing test structure can be extended

### Key Design Decisions Needed
1. **Count implementation**:
   - Use `Select: COUNT` in separate query, or
   - Use `ScannedCount` from query result (may be inaccurate with filters)

2. **Parameter validation**:
   - How to handle invalid `publishStatus` values
   - Default behavior for public vs admin

### Research Items
- None required - all patterns exist in codebase

## Requirement-to-Asset Map

| Requirement | Status | Gap | Files Affected |
|-------------|--------|-----|----------------|
| R1: Article Status Storage | ✅ Implemented | None | - |
| R2: Dashboard Statistics | ❌ Gap | Missing publishStatus param, count | `go-functions/cmd/posts/list/main.go` |
| R3: Public Site Display | ⚠️ Partial | Verify new articles appear | Testing only |
| R4: Article Creation API | ✅ Implemented | None | - |
| R5: GSI Data Integrity | ✅ Implemented | None | - |
