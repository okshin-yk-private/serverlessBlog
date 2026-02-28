# Research & Design Decisions: fix-article-publish-flow

---
**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.
---

## Summary
- **Feature**: `fix-article-publish-flow`
- **Discovery Scope**: Extension (fixing existing system)
- **Key Findings**:
  1. The `listPosts` Lambda ignores `publishStatus` query parameter - always returns published posts only
  2. The response body lacks a `count` or `total` field required by admin dashboard
  3. Same Lambda serves both public (`/posts`) and admin (`/admin/posts`) endpoints

## Research Log

### 1. Current listPosts Implementation Analysis
- **Context**: Admin dashboard cannot filter by publish status or display accurate counts
- **Sources Consulted**: `go-functions/cmd/posts/list/main.go`
- **Findings**:
  - Lines 89-95: Only parses `limit`, `category`, `nextToken` parameters
  - Missing: `publishStatus` parameter parsing
  - Lines 174-204: `buildQueryInput()` hardcodes `domain.PublishStatusPublished`
  - Lines 62-66: `ListPostsResponseBody` lacks count field
- **Implications**: Must extend parameter parsing and query building logic

### 2. DynamoDB Count Strategy
- **Context**: Admin dashboard needs total article counts for statistics
- **Sources Consulted**: AWS DynamoDB Query API documentation, existing codebase patterns
- **Findings**:
  - Option A: Use `Select: COUNT` in separate query - returns count without items
  - Option B: Use `result.ScannedCount` from existing query - may be inaccurate with FilterExpression
  - Option C: Query all items with pagination (inefficient for large datasets)
- **Implications**:
  - Option A requires additional DynamoDB call but is most accurate
  - For admin dashboard, accuracy is important over performance
  - Recommend separate count query using `Select: COUNT`

### 3. Backward Compatibility Requirements
- **Context**: Public endpoint `/posts` must continue to work without changes
- **Sources Consulted**: `infrastructure/lib/api-integrations-stack.ts`
- **Findings**:
  - Both `/posts` (public, no auth) and `/admin/posts` (admin, Cognito auth) use same Lambda
  - Public endpoint must default to `published` status only
  - Admin endpoint should accept `publishStatus` parameter
- **Implications**:
  - Default behavior (no publishStatus param) returns published only (backward compatible)
  - When `publishStatus=draft` is provided, return draft articles

### 4. Authentication Context Detection
- **Context**: Need to differentiate public vs admin requests
- **Sources Consulted**: `go-functions/cmd/posts/create/main.go` lines 148-174
- **Findings**:
  - `request.RequestContext.Authorizer` contains Cognito claims for authenticated requests
  - `request.RequestContext.Authorizer == nil` for public requests
  - Pattern already established in `extractAuthorID()` function in createPost
- **Implications**:
  - Can use same pattern to detect if request is authenticated
  - Only allow `publishStatus` parameter for authenticated (admin) requests
  - Return count only for authenticated requests (admin dashboard needs it)

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Extend listPosts | Add publishStatus param and count to existing Lambda | Minimal changes, backward compatible | Single function handles dual responsibility | **Selected** - matches existing patterns |
| Separate Admin Lambda | New Lambda for /admin/posts | Clean separation | Code duplication, more infrastructure changes | Rejected - overkill for bug fix |
| Hybrid with Auth Detection | Auto-detect public vs admin by auth context | Automatic behavior | Complex logic, harder to test | Partially used - auth detection for count |

## Design Decisions

### Decision: Extend Existing listPosts Lambda
- **Context**: Need to support publishStatus filtering and count without breaking public endpoint
- **Alternatives Considered**:
  1. Create new `list_admin` Lambda - more files, CDK changes required
  2. Extend listPosts with parameter support - minimal changes
- **Selected Approach**: Extend listPosts Lambda
- **Rationale**:
  - Follows established patterns in codebase
  - Single file modification
  - Backward compatible by default
- **Trade-offs**:
  - Pro: Minimal code changes, faster to implement
  - Con: Single function handles both public and admin logic
- **Follow-up**: Ensure comprehensive test coverage for both scenarios

### Decision: Use Separate Count Query
- **Context**: Dashboard needs accurate total counts for published and draft articles
- **Alternatives Considered**:
  1. `result.ScannedCount` - inaccurate when FilterExpression is used
  2. `Select: COUNT` query - accurate, requires additional API call
  3. Count in frontend - requires fetching all pages (inefficient)
- **Selected Approach**: Separate DynamoDB Query with `Select: COUNT`
- **Rationale**:
  - Most accurate count regardless of pagination
  - Additional API call is acceptable for admin dashboard (not high-frequency)
  - PublishStatusIndex GSI makes count query efficient
- **Trade-offs**:
  - Pro: Accurate counts
  - Con: Extra DynamoDB read capacity units consumed
- **Follow-up**: Monitor DynamoDB read capacity usage

### Decision: Optional Count Field Based on Authentication
- **Context**: Count is only needed for admin dashboard, not public site
- **Alternatives Considered**:
  1. Always return count - extra DynamoDB call for public endpoint
  2. Add `includeCount` parameter - more API complexity
  3. Return count only for authenticated requests - automatic behavior
- **Selected Approach**: Return count only for authenticated (admin) requests
- **Rationale**:
  - Public endpoint doesn't need count (no pagination UI showing total)
  - Saves DynamoDB capacity for public requests
  - No API parameter needed
- **Trade-offs**:
  - Pro: Optimized performance, automatic behavior
  - Con: Different response shape for public vs admin

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking public endpoint | High | Low | Default behavior unchanged (publishStatus not provided = published only) |
| Inaccurate counts | Medium | Low | Use separate COUNT query, not ScannedCount |
| Performance regression | Low | Low | Count query only for authenticated requests |
| Test coverage gaps | Medium | Medium | Add comprehensive tests for both public and admin scenarios |

## References
- [AWS DynamoDB Query API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html) - Select parameter documentation
- `go-functions/cmd/posts/create/main.go` - Authentication pattern reference
- `infrastructure/lib/api-integrations-stack.ts` - API Gateway routing configuration
