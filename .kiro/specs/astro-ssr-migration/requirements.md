# Requirements Document

## Introduction

本仕様は、公開ブログサイトをReact SPAからAstro SSG (Static Site Generation) に移行し、SEOとパフォーマンスを向上させるための要件を定義する。

**移行対象**: `frontend/public/` (公開ブログサイト)
**対象外**: `frontend/admin/` (管理画面、React SPAのまま維持)

**デプロイ方式**: S3 + CloudFront (Lambdaなし、完全静的生成)

**主要目的**:
1. 検索エンジン・SNSでの適切なインデックス化（SEO改善）
2. 初期表示速度の向上（静的HTMLによる高速配信）
3. 既存バックエンドAPI・Admin画面への影響最小化
4. シンプルなアーキテクチャによる運用負荷削減

## Requirements

### Requirement 1: Astroプロジェクト基盤

**Objective:** As a 開発者, I want Astroプロジェクトを初期化し必要な依存関係を設定する, so that SSG対応のフロントエンドを構築できる

#### Acceptance Criteria
1. The Astro project shall be created at `frontend/public-astro/` with TypeScript support enabled.
2. The Astro project shall include `@astrojs/react` integration for React component reuse.
3. The Astro project shall include Tailwind CSS 4.x via `@tailwindcss/vite` plugin for styling consistency.
4. The Astro project shall use Bun as the package manager for all dependency operations.
5. The Astro project shall be configured with `output: 'static'` mode for full static generation.
6. When the project is built, the Astro project shall generate static HTML files in the `dist/` directory.

---

### Requirement 2: 静的サイト生成 (SSG)

**Objective:** As a ブログ読者, I want 事前生成された静的ページ, so that 高速なページ読み込みを体験できる

#### Acceptance Criteria
1. When building the project, the Astro build shall fetch all published posts from the API endpoint `GET /api/posts?publishStatus=published`.
2. When building the project, the Astro build shall generate static HTML for the home page (`/index.html`).
3. When building the project, the Astro build shall generate static HTML for each post detail page (`/posts/[id]/index.html`).
4. When building the project, the Astro build shall generate static HTML for the About page (`/about/index.html`).
5. The build process shall use the `API_URL` environment variable to fetch data from the production API.
6. If the API is unavailable during build, the build process shall fail with a clear error message.
7. The generated HTML files shall be self-contained with all necessary CSS inlined or bundled.
8. When the API returns paginated results, the build process shall fetch all pages using cursor-based pagination until all posts are retrieved.
9. When an API request fails during build, the build process shall retry with exponential backoff (max 3 retries).
10. The build process shall handle up to 1000 posts without timeout or memory issues.

---

### Requirement 3: SEOメタタグ実装

**Objective:** As a 検索エンジン/SNS, I want 適切なメタタグを含むHTMLページ, so that コンテンツを正しくインデックス・プレビューできる

#### Acceptance Criteria
1. The generated HTML shall include `<title>` and `<meta name="description">` tags in all pages.
2. The generated HTML shall include Open Graph Protocol tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`) in all pages.
3. The generated HTML shall include Twitter Card tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`) in all pages.
4. When generating a post detail page, the HTML shall set `og:type` to `article`.
5. When generating a post detail page, the HTML shall use the post's first image as `og:image` if available.
6. When generating a post detail page, the HTML shall generate description from the first 160 characters of sanitized plain text content.
7. The generated HTML shall include canonical URL tag (`<link rel="canonical">`) in all pages.

---

### Requirement 4: 構造化データ (JSON-LD)

**Objective:** As a 検索エンジン, I want 構造化データを含むページ, so that リッチスニペットを表示できる

#### Acceptance Criteria
1. When generating a post detail page, the HTML shall include JSON-LD structured data with `@type: "BlogPosting"` schema.
2. The JSON-LD structured data shall include `headline`, `datePublished`, `dateModified`, and `author` properties.
3. If the post has images, the JSON-LD structured data shall include `image` property.
4. When generating the home page, the HTML shall include JSON-LD structured data with `@type: "WebSite"` schema.

---

### Requirement 5: サイトマップとRSSフィード

**Objective:** As a 検索エンジン/RSSリーダー, I want サイトマップとRSSフィードにアクセス, so that コンテンツを発見・購読できる

#### Acceptance Criteria
1. The Astro build shall generate a sitemap at `dist/sitemap-index.xml` using `@astrojs/sitemap`.
2. The sitemap shall include all public pages (home, about, and all published posts).
3. The Astro build shall generate an RSS feed at `dist/rss.xml`.
4. The RSS feed shall include the 20 most recent published posts with title, description, and link.
5. When the site is rebuilt, the sitemap and RSS feed shall reflect the latest content.
6. The CloudFront Function shall NOT rewrite paths for `/sitemap-index.xml`, `/sitemap*.xml`, `/rss.xml`, and `/robots.txt`.

---

### Requirement 6: S3静的ホスティング（原子的デプロイ）

**Objective:** As a 運用者, I want 静的ファイルを原子的にデプロイ, so that デプロイ途中の不完全なサイト公開を防げる

#### Acceptance Criteria
1. The built static files shall be deployable to the existing public site S3 bucket.
2. The S3 bucket shall have versioning enabled to support rollback.
3. When deploying, new files shall first be uploaded to a staging prefix (e.g., `staging/{build-id}/`).
4. After staging upload completes successfully, the deployment shall atomically switch to the new version via CloudFront origin path update or S3 object copy.
5. The deployment shall NOT use `aws s3 sync --delete` directly to production prefix during active deployment.
6. If deployment fails after staging upload, the previous production version shall remain unchanged.
7. After successful atomic switch, the old staging prefixes shall be cleaned up (retain last 3 versions for rollback).
8. After deployment, the total static file size shall not exceed 50 MB for reasonable build times.

---

### Requirement 7: CloudFrontルーティング

**Objective:** As a ユーザー, I want 適切なルーティングでコンテンツにアクセス, so that シームレスな体験ができる

#### Acceptance Criteria
1. The CloudFront distribution shall route default requests (`/`) to the public site S3 bucket.
2. The CloudFront distribution shall route static asset requests (`/_astro/*`) to the public site S3 bucket.
3. The CloudFront distribution shall continue routing `/admin/*` to the Admin S3 bucket.
4. The CloudFront distribution shall continue routing `/api/*` to the API Gateway.
5. The CloudFront distribution shall continue routing `/images/*` to the Images S3 bucket.
6. When caching static HTML pages, the CloudFront shall use a default TTL of 1 hour and max TTL of 24 hours.
7. When caching static assets (`/_astro/*`), the CloudFront shall use content-based cache keys (hash in filename) with 1-year TTL.
8. The CloudFront Function shall rewrite paths without file extensions to `{path}/index.html` (e.g., `/posts/123` → `/posts/123/index.html`).
9. The CloudFront Function shall NOT rewrite paths matching: `/_astro/*`, `/api/*`, `/admin/*`, `/images/*`, `/sitemap*.xml`, `/rss.xml`, `/robots.txt`.
10. The CloudFront distribution shall serve custom `404.html` for S3 404 responses.

---

### Requirement 8: Terraformインフラストラクチャ

**Objective:** As a 開発者, I want Terraformでインフラを管理, so that Infrastructure as Codeを維持できる

#### Acceptance Criteria
1. The `terraform/modules/cdn/` module shall be updated to add cache behavior for `/_astro/*` static assets.
2. The `terraform/modules/cdn/` CloudFront Function shall be updated to handle Astro's routing pattern with exclusion list.
3. The existing S3 bucket for public site shall be reused for Astro static files with versioning enabled.
4. When Terraform changes are applied, the existing Admin site and API routing shall remain unchanged.
5. No new Lambda function shall be required for Astro deployment.

---

### Requirement 9: ビルド・デプロイパイプライン（セキュリティ強化）

**Objective:** As a 開発者, I want セキュアで自動化されたビルド・デプロイ, so that 安全かつ効率的にリリースできる

#### Acceptance Criteria
1. The `scripts/local-deploy.sh` script shall include Astro build step using `bun run build`.
2. The `scripts/local-deploy.sh` script shall include atomic S3 deployment step for Astro static files.
3. The `.github/workflows/deploy.yml` workflow shall include Astro build and S3 deployment steps.
4. When deploying, the workflow shall use OIDC (OpenID Connect) for temporary AWS credential assumption instead of long-lived access keys.
5. The IAM role assumed via OIDC shall have minimal permissions limited to: S3 bucket operations (specific bucket), CloudFront invalidation (specific distribution).
6. The build artifacts and logs shall be encrypted using AWS KMS.
7. The workflow shall mask sensitive values in logs and outputs.
8. The workflow shall pin all action dependencies to specific commit SHAs and verify signatures where available.
9. After deployment, CloudFront cache shall be invalidated only for changed paths (not `/*` wildcard) when possible.
10. The build process shall receive API_URL as an environment variable for data fetching.
11. The total build and deploy time shall not exceed 5 minutes.

---

### Requirement 10: コンテンツ更新トリガー（既存Lambda拡張方式）

**Objective:** As a ブログ管理者, I want 記事公開時に自動でサイトを再ビルド, so that 新しいコンテンツが反映される

#### Acceptance Criteria
1. When a post is published via Admin, the existing Go Lambda (posts/update) shall trigger a CodeBuild project for site rebuild.
2. The trigger shall be invoked via AWS SDK call to CodeBuild StartBuild API from within the Go Lambda.
3. The trigger shall include idempotency handling: if a build is already in progress, the new request shall be queued or deduplicated.
4. The trigger shall use IAM role-based authorization (Lambda execution role with codebuild:StartBuild permission).
5. The CodeBuild project shall fetch latest posts from API, run Astro build, and perform atomic S3 deployment.
6. The time from publish action to content availability shall not exceed 5 minutes.
7. If rebuild fails, the previous version of the site shall remain available (atomic deployment ensures this).
8. The build status shall be logged to CloudWatch for monitoring and debugging.
9. When multiple posts are published in rapid succession, the system shall coalesce builds (max 1 build per minute).
10. The Lambda shall handle CodeBuild API errors gracefully without affecting the post publish response.

---

### Requirement 11: パフォーマンス要件

**Objective:** As a ブログ読者, I want 高速なページ読み込み, so that 快適に記事を閲覧できる

#### Acceptance Criteria
1. The static pages shall achieve a Lighthouse Performance score of 95 or higher.
2. The Time to First Byte (TTFB) shall be less than 100ms from CloudFront edge.
3. The First Contentful Paint (FCP) shall be less than 1 second.
4. The generated JavaScript bundle size shall be less than 50 KB (gzipped).
5. The Astro build shall minimize JavaScript payload by generating zero JS for pages without interactivity.
6. The static assets shall support Brotli and Gzip compression via CloudFront.

---

### Requirement 12: 後方互換性

**Objective:** As a 既存システム, I want 移行による影響を最小化, so that 安定運用を継続できる

#### Acceptance Criteria
1. The Admin site (`/admin/*`) shall continue functioning without any changes.
2. The existing REST API endpoints shall continue functioning without any changes.
3. The Cognito authentication for Admin shall continue functioning without any changes.
4. The image storage and delivery system shall continue functioning without any changes.
5. The existing URL structure (`/`, `/posts/[id]`, `/about`) shall be preserved.
6. If the new site has issues, rollback to previous version shall be possible within 5 minutes via S3 versioning.

---

### Requirement 13: テスト要件

**Objective:** As a 開発者, I want SSGの動作を検証, so that 品質を担保できる

#### Acceptance Criteria
1. The Astro components shall have unit tests with 100% coverage for critical logic.
2. The SEO implementation shall have tests verifying meta tags, OGP, and JSON-LD in generated HTML.
3. When testing locally, the `bun run dev` command shall start the development server on port 4321.
4. When testing the production build, the `bun run preview` command shall serve the built files.
5. The build process shall be tested to verify all pages are generated correctly.
6. If tests fail in CI, the deployment shall be blocked.

---

### Requirement 14: 日本語コンテンツ対応

**Objective:** As a 日本語ブログ読者, I want 日本語コンテンツの適切な表示, so that 快適に記事を閲覧できる

#### Acceptance Criteria
1. The generated HTML shall correctly render Japanese text.
2. The HTML document shall include `<html lang="ja">` attribute.
3. The meta description and OGP tags shall correctly handle Japanese characters.
4. The RSS feed shall correctly encode Japanese characters in XML with UTF-8.
5. The sitemap shall correctly encode Japanese URLs.

---

### Requirement 15: エラーページ

**Objective:** As a ユーザー, I want エラー時の適切なフィードバック, so that 次のアクションがわかる

#### Acceptance Criteria
1. The Astro build shall generate a custom 404 page at `dist/404.html`.
2. The 404 page shall include navigation to home and search functionality.
3. The CloudFront distribution shall be configured to serve `404.html` for missing paths.
4. The 404 page shall include `<meta name="robots" content="noindex">` tag.
5. While displaying the 404 page, the site header and navigation shall be maintained.

---

### Requirement 16: HTMLコンテンツサニタイズ

**Objective:** As a セキュリティ担当者, I want 投稿コンテンツのHTMLがサニタイズされる, so that XSS攻撃を防止できる

#### Acceptance Criteria
1. When storing post content via API, the HTML shall be sanitized with an allowlist of safe tags and attributes.
2. The allowlist shall include: `<p>`, `<br>`, `<strong>`, `<em>`, `<a>`, `<ul>`, `<ol>`, `<li>`, `<h1>`-`<h6>`, `<blockquote>`, `<code>`, `<pre>`, `<img>`.
3. The `<a>` tag shall only allow `href` attribute with `http://`, `https://`, or relative URLs.
4. The `<img>` tag shall only allow `src`, `alt`, `width`, `height` attributes with validated URL patterns.
5. All `<script>`, `<iframe>`, `<object>`, `<embed>`, `onclick`, `onerror`, and event handler attributes shall be stripped.
6. When rendering content in Astro templates using `set:html`, the content shall already be sanitized at storage time.
7. The sanitization logic shall be implemented in the Go Lambda post handlers (create/update).
