# Gap Analysis: Category Management Feature

## Analysis Summary

This gap analysis evaluates the implementation of a dynamic category management system against the existing serverless blog platform. Key findings:

- **Scope**: Full-stack feature spanning Infrastructure (Terraform), Backend (Go Lambda), and Frontend (React)
- **Existing Patterns**: Strong reusable patterns exist across all layers for extending with new domain (Categories)
- **Primary Gap**: Currently hardcoded categories in `PostEditor.tsx` (lines 38-45) - no DynamoDB storage or API
- **Complexity**: Standard CRUD + UI with one moderately complex aspect (deletion with referential integrity check)
- **Recommendation**: Hybrid approach - create new Categories domain components following existing Posts pattern

---

## 1. Current State Investigation

### 1.1 Domain-Related Assets

#### Infrastructure Layer (Terraform)
| Asset | Location | Relevance |
|-------|----------|-----------|
| Database Module | `terraform/modules/database/main.tf` | BlogPosts table pattern - will extend for Categories table |
| API Module | `terraform/modules/api/main.tf` | REST API pattern with Cognito authorizer - will add category endpoints |
| Lambda Module | `terraform/modules/lambda/main.tf` | Go Lambda function definitions - will add category functions |
| Lambda IAM | `terraform/modules/lambda/iam.tf` | Role definitions by domain - will add categories role |

#### Backend Layer (Go Lambda)
| Asset | Location | Relevance |
|-------|----------|-----------|
| Domain Types | `go-functions/internal/domain/types.go` | BlogPost struct pattern - will add Category struct |
| Posts CRUD | `go-functions/cmd/posts/` | 6 functions (create, get, get_public, list, update, delete) - pattern to follow |
| Clients | `go-functions/internal/clients/` | DynamoDB client initialization - reusable |
| Middleware | `go-functions/internal/middleware/` | Logging, tracing, metrics - reusable |
| API Errors | `go-functions/internal/apierrors/` | Error response pattern - reusable |

#### Frontend Layer (React)
| Asset | Location | Relevance |
|-------|----------|-----------|
| Hardcoded Categories | `frontend/admin/src/components/PostEditor.tsx:38-45` | **TO BE REPLACED** with API fetch |
| Posts API Client | `frontend/admin/src/api/posts.ts` | API client pattern - create `categories.ts` |
| App Router | `frontend/admin/src/App.tsx` | Route definitions - add `/categories` route |
| Admin Layout | `frontend/admin/src/components/AdminLayout.tsx` | Shared layout component - reuse |
| Post List Page | `frontend/admin/src/pages/PostListPage.tsx` | List/CRUD UI pattern - follow for Categories |

### 1.2 Extracted Conventions

#### Naming Conventions
- **Terraform resources**: snake_case (`aws_dynamodb_table.blog_posts`)
- **Go Lambda binaries**: `{domain}-{action}` (e.g., `posts-create`, `posts-list`)
- **Go packages**: lowercase single word (`domain`, `apierrors`)
- **React components**: PascalCase files (`PostListPage.tsx`)
- **API endpoints**: kebab-case (`/admin/categories`, `/categories/{id}`)

#### Architecture Patterns
- **Domain separation**: Posts, Auth, Images domains with dedicated IAM roles
- **API structure**: Public endpoints at `/posts`, Admin endpoints at `/admin/posts`
- **Lambda environment**: Common env vars (`TABLE_NAME`, `BUCKET_NAME`, etc.)
- **Frontend routing**: AuthGuard wrapper for protected routes
- **Error handling**: Consistent JSON `{ "message": "..." }` response format

#### Testing Patterns
- **Go**: `*_test.go` files adjacent to source, 100% unit test coverage target
- **Frontend**: `*.test.tsx` files with vitest/React Testing Library
- **TDD methodology**: Write tests first, then implementation

### 1.3 Integration Surfaces

| Surface | Integration Point | Notes |
|---------|------------------|-------|
| DynamoDB | New Categories table + SlugIndex GSI | Follow BlogPosts table pattern |
| API Gateway | New `/categories` and `/admin/categories` resources | Follow existing resource pattern |
| Cognito | Same authorizer for admin endpoints | Existing `cognito` authorizer |
| Lambda IAM | New `lambda_categories` role | DynamoDB access to both Categories and BlogPosts tables |
| Frontend API | New `categories.ts` client | Same axios pattern with auth tokens |
| PostEditor | Replace hardcoded `CATEGORIES` array | Fetch from `/categories` API |

---

## 2. Requirements Feasibility Analysis

### 2.1 Technical Needs by Requirement

| Req | Technical Need | Current State | Gap |
|-----|---------------|---------------|-----|
| R1: Category Storage | DynamoDB table with GSI | BlogPosts table exists | **Missing**: Categories table |
| R2: List API | GET /categories Lambda | listPosts exists | **Missing**: listCategories function |
| R3: Create API | POST /admin/categories Lambda | createPost exists | **Missing**: createCategory function |
| R4: Update API | PUT /admin/categories/{id} Lambda | updatePost exists | **Missing**: updateCategory function |
| R5: Delete API | DELETE /admin/categories/{id} Lambda | deletePost exists | **Missing**: deleteCategory function + referential integrity check |
| R6: Admin UI | Category management page | PostListPage exists | **Missing**: CategoryListPage |
| R7: Dynamic Selection | PostEditor fetches categories | Hardcoded array | **Missing**: API integration |
| R8: Migration Script | Seed initial categories | N/A | **Missing**: Migration script |
| R9: Error Handling | Consistent error responses | apierrors package | **Extend**: Add category-specific errors |
| R10: Testing | 100% coverage | Existing test infrastructure | **Missing**: Category tests |

### 2.2 Identified Gaps

#### Missing Capabilities
1. **Categories DynamoDB Table** - No storage for category master data
2. **Category Lambda Functions** - No CRUD operations for categories
3. **Category API Endpoints** - No API Gateway resources/methods
4. **Category Admin UI** - No management interface
5. **Dynamic Category Fetching** - PostEditor uses hardcoded array
6. **Referential Integrity** - Delete must check BlogPosts CategoryIndex
7. **Migration Script** - No seeding mechanism for initial categories

#### Unknown/Research Needed
1. **Drag-and-drop Reordering (R6.7)** - Research React DnD libraries for sortOrder updates
2. **Batch sortOrder Updates** - Efficient update strategy when reordering multiple categories
3. **Slug Generation** - Algorithm for URL-safe slug generation from name (Research: existing Go libraries)

### 2.3 Constraints from Existing Architecture

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Go-only Lambda | Must implement in Go, not Node.js/Rust | Follow existing Go patterns |
| Terraform IaC | Infrastructure changes require terraform plan/apply | Modular design for isolated changes |
| ARM64 architecture | Lambda functions must be arm64 compatible | Existing build system handles this |
| TDD requirement | Tests must be written before implementation | Budget time for test development |
| 100% coverage target | All code paths must be tested | May require mocking strategy review |

### 2.4 Complexity Signals

| Aspect | Complexity | Rationale |
|--------|------------|-----------|
| Category CRUD APIs | **Simple** | Standard DynamoDB operations, follows Posts pattern |
| Referential Integrity Check | **Moderate** | Requires querying BlogPosts CategoryIndex before delete |
| Admin UI List/Form | **Simple** | Standard React list/form pattern |
| Drag-and-Drop Reordering | **Moderate** | Requires additional library, batch updates |
| PostEditor Integration | **Simple** | Replace static array with useEffect fetch |
| Migration Script | **Simple** | One-time idempotent DynamoDB PutItem operations |

---

## 3. Implementation Approach Options

### Option A: Extend Existing Modules

**Description**: Add category resources to existing Terraform modules and extend existing Go packages.

**Files to Modify**:
- `terraform/modules/database/main.tf` - Add Categories table
- `terraform/modules/lambda/main.tf` - Add category functions to existing file
- `terraform/modules/api/main.tf` - Add category API endpoints
- `go-functions/internal/domain/types.go` - Add Category struct

**Trade-offs**:
| Pros | Cons |
|------|------|
| Fewer new files to manage | Bloats existing files (api/main.tf already 1000+ lines) |
| Simpler dependency management | Harder to review changes in large diffs |
| Consistent variable scoping | Risk of unintended resource interactions |

**Recommendation**: **Not recommended** due to file size concerns and separation of concerns.

### Option B: Create New Domain Components (Recommended)

**Description**: Create new Categories domain following the Posts domain pattern with dedicated modules and files.

**New Files to Create**:
```
# Infrastructure
terraform/modules/database/categories.tf         # Categories DynamoDB table
terraform/modules/lambda/categories.tf           # Category Lambda functions
terraform/modules/lambda/iam_categories.tf       # Category IAM role
terraform/modules/api/categories.tf              # Category API endpoints

# Backend
go-functions/cmd/categories/list/main.go         # List categories
go-functions/cmd/categories/create/main.go       # Create category
go-functions/cmd/categories/update/main.go       # Update category
go-functions/cmd/categories/delete/main.go       # Delete category
go-functions/internal/domain/category.go         # Category types

# Frontend
frontend/admin/src/api/categories.ts             # Category API client
frontend/admin/src/pages/CategoryListPage.tsx    # Category management page
frontend/admin/src/pages/CategoryListPage.test.tsx

# Migration
scripts/seed-categories.go                       # Migration script
```

**Trade-offs**:
| Pros | Cons |
|------|------|
| Clean separation of concerns | More files to navigate |
| Easy to review changes in isolation | Requires consistent patterns across files |
| Follows established Posts pattern | Slight duplication of boilerplate |
| Easier to test in isolation | Need to ensure consistency |

**Recommendation**: **Recommended** - Best matches existing architecture patterns.

### Option C: Hybrid Approach

**Description**: Extend domain types in shared file, create new files for category-specific logic.

**Changes**:
- Extend `types.go` with Category struct (shared)
- Create new `categories.tf` files for Terraform resources
- Create new Lambda function directories
- Create new frontend page and API client

**Trade-offs**:
| Pros | Cons |
|------|------|
| Shared types prevent drift | Requires careful coordination |
| Domain logic properly isolated | Mixed approach may confuse contributors |

**Recommendation**: This is essentially Option B with shared types, which is acceptable.

---

## 4. Implementation Complexity & Risk Assessment

### Effort Estimate: **M (3-7 days)**

**Justification**:
- Follows established patterns extensively
- Standard CRUD operations with DynamoDB
- Moderate complexity in referential integrity check
- Some research needed for drag-and-drop UI
- Test coverage requirement adds overhead

### Risk Assessment: **Low-Medium**

| Risk Factor | Level | Notes |
|-------------|-------|-------|
| Technology familiarity | Low | All technologies already in use |
| Pattern deviation | Low | Following existing Posts pattern |
| Integration complexity | Low | Clear integration points |
| Referential integrity | Medium | Must correctly query CategoryIndex |
| UI complexity (DnD) | Medium | New library integration |
| Performance | Low | Simple queries, PAY_PER_REQUEST billing |
| Security | Low | Same Cognito auth pattern |

---

## 5. Recommendations for Design Phase

### 5.1 Preferred Approach

**Option B: Create New Domain Components** is recommended because:
1. Aligns with existing domain separation (Posts, Auth, Images)
2. Enables isolated testing and review
3. Terraform files remain manageable size
4. Clear responsibility boundaries

### 5.2 Key Design Decisions Needed

1. **Category Domain Scope**: Should categories have description field optional or required?
2. **Slug Uniqueness**: How to handle slug collision during create/update?
3. **Deletion Strategy**: Soft delete vs hard delete with referential check?
4. **Sort Order Management**: Contiguous integers vs arbitrary integers?
5. **Migration Timing**: Run script during deploy or separate manual step?

### 5.3 Research Items for Design Phase

| Item | Priority | Notes |
|------|----------|-------|
| React DnD library selection | High | Evaluate react-beautiful-dnd vs @dnd-kit |
| Slug generation algorithm | Medium | Research existing Go libraries (e.g., gosimple/slug) |
| Batch update pattern | Medium | DynamoDB TransactWriteItems for sortOrder updates |
| Integration test strategy | Medium | LocalStack vs DynamoDB Local for category tests |

### 5.4 Dependency Order

```
1. Infrastructure (Terraform)
   ├── Categories DynamoDB table + GSI
   ├── Category Lambda functions
   └── API Gateway endpoints

2. Backend (Go Lambda)
   ├── Category domain types
   ├── List categories function
   ├── Create category function
   ├── Update category function
   └── Delete category function (with referential check)

3. Frontend (React)
   ├── Category API client
   ├── Category management page
   └── PostEditor API integration

4. Migration
   └── Seed initial categories script
```

---

## Requirement-to-Asset Map Summary

| Requirement | Asset Type | Status | Notes |
|-------------|------------|--------|-------|
| R1: Category Storage | Database | Missing | New DynamoDB table required |
| R2: List API | Lambda + API | Missing | New function and endpoint |
| R3: Create API | Lambda + API | Missing | New function and endpoint |
| R4: Update API | Lambda + API | Missing | New function and endpoint |
| R5: Delete API | Lambda + API | Missing | New function + CategoryIndex query |
| R6: Admin UI | Frontend | Missing | New page component |
| R7: Dynamic Selection | Frontend | Constraint | Replace hardcoded array |
| R8: Migration | Script | Missing | New Go script |
| R9: Error Handling | Backend | Extend | Add category-specific errors |
| R10: Testing | All layers | Missing | New test files required |

---

*Analysis completed: 2026-01-11*
