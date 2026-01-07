# Implementation Plan

## Overview

This plan implements the listPosts Lambda extension to support publish status filtering and article counts for the admin dashboard, while maintaining backward compatibility with the public endpoint.

**Scope**: Modify existing Go Lambda function (`listPosts`) to handle `publishStatus` query parameter and return counts for authenticated admin requests.

**Out of Scope**: Requirements 1.1-1.6, 3.5-3.6, 4.1-4.6, 5.1-5.5 are confirmed working per design analysis and require no implementation.

---

## Tasks

### Task 1: Extend listPosts Lambda Core Functionality

- [x] 1. Extend listPosts Lambda to support publish status filtering and admin counts

- [x] 1.1 Add authentication detection capability
  - Implement function to detect if request is from authenticated admin or public user
  - Check `request.RequestContext.Authorizer` for Cognito claims presence
  - Return boolean indicating authentication status
  - Follow existing project pattern used in other Go Lambda functions (get, update, delete)
  - _Requirements: 2.1, 2.2_

- [x] 1.2 Add publishStatus query parameter parsing and validation
  - Parse `publishStatus` parameter from query string
  - Validate values: only accept `published` or `draft`
  - Default to `published` when parameter is missing or empty (backward compatibility)
  - Return 400 Bad Request for invalid values on admin endpoint only
  - _Requirements: 2.1, 2.2, 3.1, 3.4_

- [x] 1.3 Modify query building to use publishStatus parameter
  - Extend `buildQueryInput()` to accept publishStatus as parameter
  - Use provided publishStatus value instead of hardcoded `published`
  - Maintain existing behavior for category filtering
  - Preserve pagination and sorting logic
  - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 1.4 Implement count query execution for admin requests
  - Add function to execute DynamoDB count query using `Select: COUNT`
  - Query PublishStatusIndex GSI with current publishStatus value
  - Execute count query only for authenticated (admin) requests
  - Handle count query errors gracefully
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 1.5 Extend response structure with count field
  - Add optional `Count` field to response body struct
  - Include count in response only for authenticated admin requests
  - Omit count field for public requests (use `omitempty`)
  - Ensure backward compatibility with existing public response format
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.3_

---

### Task 2: Unit Tests for New Functionality

- [x] 2. Implement unit tests for listPosts Lambda extensions

- [x] 2.1 (P) Unit tests for authentication detection and parameter parsing
  - Test `isAuthenticated()` with valid Cognito claims present
  - Test `isAuthenticated()` with nil Authorizer (public request)
  - Test `isAuthenticated()` with empty claims map
  - Test `parsePublishStatus()` with valid values: `published`, `draft`
  - Test `parsePublishStatus()` with empty string (should default to `published`)
  - Test `parsePublishStatus()` with invalid values (should return error)
  - _Requirements: 2.1, 2.2, 3.1_

- [x] 2.2 (P) Unit tests for query building and count execution
  - Test `buildQueryInput()` with `publishStatus=published`
  - Test `buildQueryInput()` with `publishStatus=draft`
  - Test `buildQueryInput()` with category and publishStatus combination
  - Test count query execution returns correct count
  - Test count query failure handling
  - Test response includes count for admin requests
  - Test response excludes count for public requests
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.4_

---

### Task 3: Integration Tests

- [x] 3. Implement integration tests for admin and public endpoints

- [x] 3.1 Integration tests for admin endpoint behavior
  - Test `GET /admin/posts?publishStatus=published` returns published articles with count
  - Test `GET /admin/posts?publishStatus=draft` returns draft articles with count
  - Test `GET /admin/posts` without publishStatus defaults to published
  - Test pagination with publishStatus filter works correctly
  - Test category and publishStatus combination filtering
  - Test count reflects correct total for filtered status
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3.2 (P) Integration tests for public endpoint backward compatibility
  - Test `GET /posts` returns only published articles
  - Test `GET /posts` response does not include count field
  - Test `GET /posts` with category filter returns published articles only
  - Test pagination continues to work correctly
  - Test existing response format is unchanged
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

---

## Requirements Coverage

| Requirement | Task Coverage | Status |
|-------------|---------------|--------|
| 1.1-1.6 | N/A (already working) | ✅ Verified |
| 2.1 | 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 3.1 | Covered |
| 2.2 | 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 3.1 | Covered |
| 2.3 | 1.4, 1.5, 2.2, 3.1 | Covered |
| 2.4 | 1.4, 1.5, 2.2, 3.1 | Covered |
| 2.5 | 1.4, 1.5, 2.2, 3.1 | Covered |
| 2.6 | 1.4, 1.5, 2.2, 3.1 | Covered |
| 3.1 | 1.2, 1.3, 1.5, 2.1, 2.2, 3.2 | Covered |
| 3.2 | 1.3, 3.2 | Covered |
| 3.3 | 1.5, 3.2 | Covered |
| 3.4 | 1.2, 2.2, 3.2 | Covered |
| 3.5-3.6 | N/A (already working) | ✅ Verified |
| 4.1-4.6 | N/A (already working) | ✅ Verified |
| 5.1-5.5 | N/A (already working) | ✅ Verified |

---

## Execution Notes

- **Parallel Execution**: Tasks marked with `(P)` can be executed concurrently
  - 2.1 and 2.2 can run in parallel (test different aspects)
  - 3.1 and 3.2 can run in parallel (test different endpoints)
- **Sequential Dependencies**:
  - Task 1 (all sub-tasks) must complete before Task 2 and Task 3
  - Sub-tasks within Task 1 are sequential (1.1 → 1.2 → 1.3 → 1.4 → 1.5)
- **Target File**: `go-functions/cmd/posts/list/main.go`
- **Test Files**: `go-functions/cmd/posts/list/main_test.go`
