# Research & Design Decisions

## Summary
- **Feature**: `astro-ssr-migration`
- **Discovery Scope**: Extension (既存システムへの統合)
- **Key Findings**:
  1. Astro SSG は `output: 'static'` でLambda不要の完全静的生成が可能
  2. CloudFront Function で `/posts/123` → `/posts/123/index.html` のURLリライトが必要
  3. 原子的デプロイはS3バージョン付きプレフィックス + CloudFront origin path切替で実現
  4. 既存Go Lambda (posts/update) へのCodeBuildトリガー追加が最もシンプル

## Research Log

### Astro 5.x SSG Configuration
- **Context**: 公開ブログをReact SPAからAstro SSGに移行
- **Sources**: Astro公式ドキュメント、AWS Deploy Guide
- **Findings**:
  - `output: 'static'` はデフォルト設定でLambda不要
  - 動的ルートは `getStaticPaths()` でビルド時に全パスを生成
  - アセットは `/_astro/` 配下にハッシュ付きファイル名で出力
  - ビルド出力構造:
    ```
    dist/
    ├── _astro/           # ハッシュ付きJS/CSS
    ├── posts/123/index.html
    ├── about/index.html
    ├── index.html
    ├── sitemap-index.xml
    └── rss.xml
    ```
- **Implications**:
  - CloudFrontはSPAルーティングではなくSSGルーティングに変更必要
  - `_astro/*` は長期キャッシュ可能（1年TTL）

### CloudFront Function URL Rewriting
- **Context**: S3 OACではディレクトリindex機能が使えない
- **Sources**: AWS CloudFront Functions サンプル、AWS Blog
- **Findings**:
  - CloudFront Functions (ECMAScript 5.1) でviewer-requestリライト
  - 除外パターン: `/_astro/*`, `/api/*`, `/admin/*`, `/images/*`, `/sitemap*.xml`, `/rss.xml`, `/robots.txt`
  - リライトパターン: `/posts/123` → `/posts/123/index.html`
  - 拡張子判定: `uri.split('/').pop().indexOf('.') > -1`
- **Implications**:
  - 既存の `PublicSpaFunction` を `PublicAstroFunction` に置き換え
  - dev環境のBasic Auth + SSGルーティング統合が必要

### Atomic S3 Deployment
- **Context**: `s3 sync --delete` は非原子的で中間状態を公開するリスク
- **Sources**: AWS Blog, 業界ベストプラクティス
- **Findings**:
  - パターン1: バージョン付きプレフィックス + origin path切替
    - `s3://bucket/v1698234567/` → `s3://bucket/v1698345678/`
    - CloudFront origin pathを変更して即座に切替
  - パターン2: S3オブジェクトコピー
    - staging prefix → production prefixへの一括コピー
  - 推奨: パターン1（キャッシュ無効化不要、高速切替）
- **Implications**:
  - Terraformで `origin_path` を変数化
  - CodeBuild出力にデプロイバージョンを含める
  - ロールバックは前バージョンのorigin path指定で即座に可能

### CodeBuild Integration
- **Context**: 記事公開時の自動ビルドトリガー
- **Sources**: AWS CodeBuild Buildspec Reference
- **Findings**:
  - buildspec.yml構成:
    - install: Bunインストール
    - pre_build: `bun install --frozen-lockfile`
    - build: `bun run build`
    - post_build: S3 sync with cache headers
  - キャッシュヘッダー戦略:
    - `_astro/*`: `max-age=31536000,immutable`
    - `*.html`, `sitemap*.xml`: `max-age=0,must-revalidate`
  - 環境変数: `PUBLIC_API_URL`, `PUBLIC_SITE_URL`
- **Implications**:
  - IAMロールに最小権限（S3, SSM Parameter Store）
  - ビルドキャッシュで高速化可能

### Build Trigger Mechanism
- **Context**: DynamoDB Streams vs Go Lambda拡張の比較
- **Sources**: Codexレビュー結果、AWS EventBridge
- **Findings**:
  - Option 1: DynamoDB Streams + 新規Lambda
    - 利点: 疎結合、publishStatus変更のみ検知可能
    - 欠点: 重複処理、監視複雑化、新規リソース追加
  - Option 2: 既存Go Lambda (posts/update) 拡張
    - 利点: シンプル、既存コードに追加のみ、認可済み
    - 欠点: Lambda関数への依存
  - Codex推奨: Option 2（更新頻度が低いブログにはシンプルが最適）
- **Implications**:
  - posts/update Lambdaに CodeBuild StartBuild 呼び出し追加
  - publishStatus が "published" に変更された場合のみトリガー
  - 冪等性: 進行中ビルドのチェック（ListBuildsForProject）

### HTML Sanitization
- **Context**: `set:html` 使用時のXSSリスク
- **Sources**: Codexレビュー、OWASP
- **Findings**:
  - Astroの `set:html` はサニタイズなしでHTML挿入
  - 保存時サニタイズが推奨（ビルド時ではなく）
  - Go実装では bluemonday などのライブラリを使用
  - 許可タグ: `<p>`, `<br>`, `<strong>`, `<em>`, `<a>`, `<ul>`, `<ol>`, `<li>`, `<h1>`-`<h6>`, `<blockquote>`, `<code>`, `<pre>`, `<img>`
- **Implications**:
  - posts/create, posts/update Lambda でサニタイズ処理追加
  - 既存データのマイグレーションは段階的に実施

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| SSG + S3 + CloudFront | 完全静的生成、Lambdaなし | 低コスト、高速配信、シンプル | ビルド時間、リアルタイム性なし | 採用 |
| SSR + Lambda@Edge | サーバーサイドレンダリング | リアルタイム、動的コンテンツ | コスト増、複雑性、コールドスタート | 不採用 |
| Hybrid (SSG + ISR) | 静的生成 + 増分再生成 | バランス | Lambda必要、複雑性 | 将来検討 |

## Design Decisions

### Decision: Atomic Deployment via S3 Versioned Prefix
- **Context**: デプロイ途中の不完全なサイト公開を防止
- **Alternatives Considered**:
  1. `s3 sync --delete` 直接同期 — シンプルだが非原子的
  2. S3バージョニング + オブジェクトコピー — 原子的だがコピー時間がかかる
- **Selected Approach**: バージョン付きプレフィックス + CloudFront origin path切替
- **Rationale**:
  - 即座に切替可能（キャッシュ無効化不要）
  - ロールバックが容易（前バージョンに戻すだけ）
  - 既存インフラへの影響最小
- **Trade-offs**:
  - S3ストレージ使用量増（複数バージョン保持）
  - Terraform変数でorigin pathを管理する必要
- **Follow-up**: クリーンアップスクリプトで古いバージョンを削除

### Decision: Go Lambda Extension for Build Trigger
- **Context**: 記事公開時の自動ビルドトリガー方式
- **Alternatives Considered**:
  1. DynamoDB Streams + 新規Lambda — 疎結合だが複雑
  2. EventBridge Scheduler — 定期実行だがリアルタイム性なし
  3. 既存Go Lambda拡張 — シンプル、既存パターン活用
- **Selected Approach**: 既存 posts/update Lambda に CodeBuild StartBuild 追加
- **Rationale**:
  - Codex推奨（更新頻度が低いブログにはシンプルが最適）
  - 既存の認可・監視パターンを流用可能
  - 新規リソース追加最小
- **Trade-offs**:
  - Lambda関数への機能追加（責務増加）
  - 非同期処理（ビルド完了を待たない）
- **Follow-up**: 冪等性チェック、エラーハンドリング、CloudWatch Logs監視

### Decision: CloudFront Function for SSG Routing
- **Context**: S3 OACではディレクトリindex機能が使えない
- **Alternatives Considered**:
  1. S3 Website Endpoint — OACと互換性なし
  2. Lambda@Edge — 高コスト、オーバースペック
  3. CloudFront Functions — 低コスト、高速
- **Selected Approach**: CloudFront Functions (viewer-request)
- **Rationale**:
  - 無料枠2M invocations/month
  - シンプルなURL書き換えに最適
  - 既存の関数パターンを拡張可能
- **Trade-offs**:
  - ECMAScript 5.1の制限
  - 複雑なロジックには不向き
- **Follow-up**: dev環境のBasic Auth統合

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| ビルド失敗時のサイト停止 | 原子的デプロイで前バージョン維持、ロールバック自動化 |
| API全件取得のスケール問題 | ページネーション対応、リトライ with exponential backoff |
| XSS脆弱性 | Go Lambda側でHTML保存時サニタイズ |
| CloudFront Function制限 | ECMAScript 5.1準拠、テスト徹底 |
| CodeBuild同時実行 | 冪等性チェック、ビルド集約（最大1回/分） |

## References

- [Astro Static Site Generation](https://docs.astro.build/en/basics/rendering-modes/) - SSG設定リファレンス
- [Deploy Astro to AWS](https://docs.astro.build/en/guides/deploy/aws/) - AWSデプロイガイド
- [CloudFront Functions URL Rewrite](https://github.com/aws-samples/amazon-cloudfront-functions) - URLリライトサンプル
- [AWS Blog: Zero Downtime Deployments](https://aws.amazon.com/blogs/networking-and-content-delivery/achieving-zero-downtime-deployments-with-amazon-cloudfront-using-blue-green-continuous-deployments/) - ブルーグリーンデプロイ
- [CodeBuild Buildspec Reference](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) - buildspec.yml仕様
