# Requirements Document

## Introduction

This specification defines the requirements for a dynamic category management system for the serverless blog platform. Currently, categories are hardcoded in the PostEditor frontend component, limiting flexibility. This feature will enable administrators to add, edit, and delete categories through the admin panel, with the category list dynamically fetched from an API. The implementation includes a new DynamoDB table for category master data and CRUD APIs following the existing Go Lambda architecture.

## Requirements

### Requirement 1: Category Master Data Storage

**Objective:** As a system administrator, I want category data stored in a dedicated DynamoDB table, so that categories can be managed independently of the codebase.

#### Acceptance Criteria

1. The Database Module shall create a DynamoDB table named `Categories` with partition key `id` (String).
2. The Categories table shall use PAY_PER_REQUEST billing mode consistent with the BlogPosts table.
3. The Categories table shall store the following attributes: `id` (UUID), `name` (display name), `slug` (URL-safe identifier), `description` (optional), `sortOrder` (integer for display ordering), `createdAt`, and `updatedAt`.
4. The Categories table shall have Point-in-Time Recovery enabled for data protection.
5. The Categories table shall have server-side encryption enabled using AWS managed keys.
6. The Database Module shall create a Global Secondary Index `SlugIndex` with partition key `slug` for unique slug lookup.

### Requirement 2: Category List API

**Objective:** As a frontend application, I want to retrieve a list of all categories via API, so that category dropdowns can be dynamically populated.

#### Acceptance Criteria

1. When a GET request is made to `/categories`, the Category API shall return a list of all categories sorted by `sortOrder` ascending.
2. The Category API shall return each category with `id`, `name`, `slug`, and `sortOrder` fields.
3. The `/categories` endpoint shall be publicly accessible without authentication for use by both public and admin frontends.
4. When no categories exist, the Category API shall return an empty array with HTTP 200 status.
5. The Category API shall implement appropriate CORS headers for frontend access.

### Requirement 3: Category Creation API

**Objective:** As an administrator, I want to create new categories via API, so that I can add categories without modifying code.

#### Acceptance Criteria

1. When a POST request is made to `/admin/categories` with valid category data, the Category API shall create a new category and return HTTP 201 with the created category.
2. The Category API shall require authentication via Cognito authorizer for the create endpoint.
3. When the `name` field is missing or empty, the Category API shall return HTTP 400 with a validation error message.
4. When a category with the same `slug` already exists, the Category API shall return HTTP 409 Conflict.
5. If `slug` is not provided, the Category API shall auto-generate a slug from the `name` field.
6. The Category API shall set `createdAt` and `updatedAt` to the current ISO 8601 timestamp upon creation.
7. If `sortOrder` is not provided, the Category API shall assign the next available sort order value.

### Requirement 4: Category Update API

**Objective:** As an administrator, I want to update existing categories via API, so that I can modify category names and display order.

#### Acceptance Criteria

1. When a PUT request is made to `/admin/categories/{id}` with valid data, the Category API shall update the category and return HTTP 200 with the updated category.
2. The Category API shall require authentication via Cognito authorizer for the update endpoint.
3. When the category ID does not exist, the Category API shall return HTTP 404 Not Found.
4. When updating to a `slug` that already exists on a different category, the Category API shall return HTTP 409 Conflict.
5. The Category API shall update the `updatedAt` timestamp upon successful update.
6. The Category API shall allow partial updates (only fields provided in the request body shall be updated).
7. When `slug` is changed, the Category API shall automatically update the `category` field of all BlogPosts referencing the old slug to the new slug.

### Requirement 4B: Category Sort Order Bulk Update API

**Objective:** As an administrator, I want to update the display order of multiple categories at once via API, so that drag-and-drop reordering can be persisted efficiently.

#### Acceptance Criteria

1. When a PATCH request is made to `/admin/categories/sort` with an array of category IDs and sortOrder values, the Category API shall update all specified categories and return HTTP 200.
2. The Category API shall require authentication via Cognito authorizer for the bulk update endpoint.
3. When any category ID in the request does not exist, the Category API shall return HTTP 400 Bad Request with a list of invalid IDs.
4. The Category API shall update the `updatedAt` timestamp for all updated categories.
5. The Category API shall perform the bulk update atomically using DynamoDB BatchWriteItem or TransactWriteItems.

### Requirement 5: Category Deletion API

**Objective:** As an administrator, I want to delete categories via API, so that I can remove obsolete categories.

#### Acceptance Criteria

1. When a DELETE request is made to `/admin/categories/{id}`, the Category API shall delete the category and return HTTP 204 No Content.
2. The Category API shall require authentication via Cognito authorizer for the delete endpoint.
3. When the category ID does not exist, the Category API shall return HTTP 404 Not Found.
4. If posts are associated with the category being deleted, the Category API shall return HTTP 409 Conflict with a message indicating the category is in use.
5. The Category API shall check the BlogPosts table CategoryIndex to determine if any posts reference the category.

### Requirement 6: Admin Category Management UI

**Objective:** As an administrator, I want a category management page in the admin panel, so that I can manage categories through a user interface.

#### Acceptance Criteria

1. The Admin Panel shall provide a "Categories" menu item in the navigation.
2. When the administrator navigates to the Categories page, the Admin Panel shall display a list of all categories with name, slug, and sort order.
3. The Admin Panel shall provide an "Add Category" button that opens a form for creating new categories.
4. When the administrator clicks "Edit" on a category, the Admin Panel shall display a form pre-populated with the category data.
5. When the administrator clicks "Delete" on a category, the Admin Panel shall display a confirmation dialog before proceeding.
6. If deletion fails due to associated posts, the Admin Panel shall display an error message explaining the category is in use.
7. The Admin Panel shall allow drag-and-drop reordering of categories to update sortOrder.
8. The Admin Panel shall display loading indicators during API operations.
9. The Admin Panel shall display success/error toast messages after operations complete.

### Requirement 7: Dynamic Category Selection in Post Editor

**Objective:** As an administrator, I want the post editor category dropdown populated from the API, so that newly added categories are immediately available.

#### Acceptance Criteria

1. When the Post Editor loads, the Admin Panel shall fetch categories from the `/categories` API.
2. The Post Editor shall display fetched categories in the category dropdown sorted by sortOrder.
3. While categories are loading, the Post Editor shall display a loading indicator in the dropdown.
4. If the category fetch fails, the Post Editor shall display an error message and allow retry.
5. When editing an existing post, the Post Editor shall pre-select the post's current category in the dropdown.
6. If a post's category no longer exists in the fetched list, the Post Editor shall display a warning and require category re-selection.

### Requirement 8: Category Migration and Seeding

**Objective:** As a system administrator, I want existing hardcoded categories migrated to the database, so that the transition is seamless.

#### Acceptance Criteria

1. The deployment process shall include a one-time migration script to seed initial categories from the current hardcoded list.
2. The migration script shall create the following categories with exact values:
   - `{ name: "テクノロジー", slug: "tech", sortOrder: 1 }`
   - `{ name: "ライフスタイル", slug: "life", sortOrder: 2 }`
   - `{ name: "ビジネス", slug: "business", sortOrder: 3 }`
   - `{ name: "その他", slug: "other", sortOrder: 4 }`
3. The migration script shall be idempotent (running multiple times shall not create duplicate categories). Idempotency shall be ensured by checking slug existence before insertion.
4. The migration script shall assign sortOrder values as specified in criterion 2.

### Requirement 9: API Error Handling and Validation

**Objective:** As a developer, I want consistent error handling across category APIs, so that clients can handle errors predictably.

#### Acceptance Criteria

1. The Category API shall return JSON error responses with `message` field for all error cases.
2. When request body JSON is invalid, the Category API shall return HTTP 400 with a parsing error message.
3. When `name` exceeds 100 characters, the Category API shall return HTTP 400 with a validation error.
4. When `slug` contains invalid characters (non-alphanumeric, non-hyphen), the Category API shall return HTTP 400 with a validation error.
5. The Category API shall log all errors with appropriate log levels using the existing Go middleware logger.
6. The Category API shall include X-Ray tracing for performance monitoring.

### Requirement 10: Testing Requirements

**Objective:** As a developer, I want comprehensive test coverage for category management, so that the feature is reliable and maintainable.

#### Acceptance Criteria

1. The Category Lambda functions shall have 100% unit test coverage following TDD methodology.
2. The Category API shall have integration tests covering all CRUD operations against DynamoDB Local.
3. The Admin Category Management UI shall have unit tests for all components with 100% coverage.
4. The E2E test suite shall include at least one happy-path test for category CRUD flow.
5. All tests shall pass in the CI/CD pipeline before deployment.
