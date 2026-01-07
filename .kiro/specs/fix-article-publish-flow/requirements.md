# Requirements Document

## Introduction
This specification addresses critical bugs in the article publishing workflow where:
1. Articles created as "published" incorrectly appear in the draft list
2. The admin dashboard published article count does not update correctly
3. Published articles do not appear on the public-facing site

These issues indicate problems in the data flow from article creation through storage to display, affecting both the admin interface and public site functionality.

## Requirements

### Requirement 1: Correct Article Status Storage
**Objective:** As an admin, I want articles saved with the correct publish status, so that published articles are stored only as published and not duplicated as drafts.

#### Acceptance Criteria
1. When an article is created with publishStatus "published", the Article Service shall store the article with publishStatus set to "published" in DynamoDB.
2. When an article is created with publishStatus "published", the Article Service shall set the publishedAt timestamp to the current ISO8601 datetime.
3. When an article is created with publishStatus "draft", the Article Service shall store the article with publishStatus set to "draft" in DynamoDB.
4. When an article is created with publishStatus "draft", the Article Service shall not set a publishedAt timestamp.
5. The Article Service shall store each article as a single record in DynamoDB without creating duplicate entries.
6. If the publishStatus field is missing or invalid during article creation, the Article Service shall default to "draft" status.

### Requirement 2: Admin Dashboard Statistics Accuracy
**Objective:** As an admin, I want the dashboard to show accurate article counts, so that I can monitor my published and draft content correctly.

#### Acceptance Criteria
1. When the admin dashboard loads, the Dashboard shall query the PublishStatusIndex GSI to count articles with publishStatus "published".
2. When the admin dashboard loads, the Dashboard shall query the PublishStatusIndex GSI to count articles with publishStatus "draft".
3. When a new article is created with publishStatus "published", the Dashboard shall reflect the incremented published count upon refresh.
4. When a new article is created with publishStatus "draft", the Dashboard shall reflect the incremented draft count upon refresh.
5. When an article status changes from draft to published, the Dashboard shall show updated counts for both categories upon refresh.
6. The Dashboard shall display the correct counts regardless of the total number of articles in the database.

### Requirement 3: Public Site Article Display
**Objective:** As a reader, I want to see all published articles on the public site, so that I can browse and read available content.

#### Acceptance Criteria
1. When the public article list page loads, the Public Site shall query only articles with publishStatus "published".
2. When the public article list page loads, the Public Site shall display articles sorted by createdAt in descending order (newest first).
3. When a new article is published, the Public Site shall include that article in the list upon page load.
4. The Public Site shall not display articles with publishStatus "draft".
5. When a single article is requested by ID, the Public Site shall return the article only if its publishStatus is "published".
6. If a requested article has publishStatus "draft", the Public Site shall return a 404 Not Found response.

### Requirement 4: Article Creation API Correctness
**Objective:** As a developer, I want the createPost API to correctly handle publish status, so that articles are stored with accurate metadata.

#### Acceptance Criteria
1. When the createPost API receives a request with publishStatus "published", the API shall validate and store the article as published.
2. When the createPost API receives a request with publishStatus "draft", the API shall store the article as a draft.
3. The createPost API shall return the created article with the correct publishStatus in the response body.
4. The createPost API shall return the correct publishedAt value (set for published articles, null/omitted for drafts).
5. If the createPost API encounters a database error, the API shall return a 500 error without creating partial or duplicate records.
6. The createPost API shall validate that publishStatus is either "published" or "draft" and reject invalid values with a 400 Bad Request.

### Requirement 5: Data Integrity in PublishStatusIndex GSI
**Objective:** As a system, I want consistent data in the GSI, so that queries return accurate results for published and draft article lists.

#### Acceptance Criteria
1. When an article is created, the PublishStatusIndex GSI shall be updated to include the new article with its correct publishStatus.
2. When an article's publishStatus is updated, the PublishStatusIndex GSI shall reflect the change immediately (eventual consistency within DynamoDB's standard propagation time).
3. The PublishStatusIndex GSI shall partition articles correctly by publishStatus ("published" or "draft").
4. When querying the PublishStatusIndex GSI for published articles, the query shall return only articles with publishStatus "published".
5. When querying the PublishStatusIndex GSI for draft articles, the query shall return only articles with publishStatus "draft".

