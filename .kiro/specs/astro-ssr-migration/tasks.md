# Implementation Plan

## Requirements Coverage

| Requirement | Tasks |
|-------------|-------|
| 1.1-1.6 | 1.1, 1.2 |
| 2.1-2.10 | 2.1, 2.2, 2.3 |
| 3.1-3.7 | 3.1 |
| 4.1-4.4 | 3.2 |
| 5.1-5.6 | 3.3, 3.4 |
| 6.1-6.8 | 5.1, 5.2 |
| 7.1-7.10 | 4.1, 4.2 |
| 8.1-8.5 | 4.1, 4.2, 4.3 |
| 9.1-9.11 | 5.1, 5.2, 5.3 |
| 10.1-10.10 | 6.1, 6.2 |
| 11.1-11.6 | 1.2, 7.1 |
| 12.1-12.6 | 4.2, 7.2 |
| 13.1-13.6 | 8.1, 8.2, 8.3 |
| 14.1-14.5 | 1.2, 3.1 |
| 15.1-15.5 | 2.4 |
| 16.1-16.7 | 6.3 |

---

## Tasks

### Phase 1: Astroプロジェクト基盤

- [x] 1. Astroプロジェクトセットアップ
- [x] 1.1 (P) Astroプロジェクト初期化と依存関係設定
  - Astro 5.x プロジェクトを `frontend/public-astro/` に作成し TypeScript を有効化
  - `@astrojs/react` 統合でReactコンポーネント再利用を可能にする
  - `@tailwindcss/vite` プラグインでTailwind CSS 4.x を設定
  - Bunをパッケージマネージャーとして使用し `bun install` で依存関係をインストール
  - `astro.config.mjs` で `output: 'static'` モードを設定
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 1.2 (P) プロジェクト設定とディレクトリ構造
  - `tsconfig.json` で厳密な型チェックを設定
  - `src/pages/`、`src/layouts/`、`src/components/`、`src/lib/` ディレクトリ構造を作成
  - 日本語対応のために `<html lang="ja">` をレイアウトに設定
  - 共通レイアウト (`Layout.astro`) を作成しヘッダー・フッターの基盤を構築
  - ビルド時に `dist/` ディレクトリに静的HTMLが生成されることを確認
  - _Requirements: 1.6, 14.1, 14.2_

### Phase 2: 静的ページ生成

- [ ] 2. ページコンポーネント実装
- [x] 2.1 API呼び出しモジュール実装
  - ビルド時にREST APIから公開記事を取得する機能を実装
  - `API_URL` 環境変数からAPIエンドポイントを取得
  - カーソルベースのページネーションで全記事を再帰的に取得
  - API失敗時に指数バックオフで最大3回リトライ
  - 1000件までの記事を処理できるよう最適化
  - API不可時は明確なエラーメッセージでビルドを失敗させる
  - _Requirements: 2.1, 2.5, 2.6, 2.8, 2.9, 2.10_

- [x] 2.2 記事一覧ページ実装
  - ホームページ (`index.astro`) で公開記事一覧を表示
  - 記事カードコンポーネントでタイトル、カテゴリ、作成日時、抜粋を表示
  - 記事詳細へのリンクを設定
  - ビルド時に `/index.html` として静的生成
  - _Requirements: 2.2_
  - **Completed**: PostCard.astro, postUtils.ts (100% coverage), build-output tests (15 cases)

- [x] 2.3 記事詳細ページ実装
  - 動的ルート (`posts/[id].astro`) で各記事の詳細ページを生成
  - `getStaticPaths` で全公開記事のパスを生成
  - 記事タイトル、本文HTML、カテゴリ、タグ、画像を表示
  - サニタイズ済みHTMLコンテンツを `set:html` で安全にレンダリング
  - CSSとアセットをインライン化またはバンドル
  - ビルド時に `/posts/[id]/index.html` として静的生成
  - _Requirements: 2.3, 2.7_
  - **Completed**: posts/[id].astro, postDetailUtils.ts (100% coverage), post-detail.test.ts (15 cases)

- [x] 2.4 Aboutページと404ページ実装
  - Aboutページ (`about.astro`) を静的に生成
  - カスタム404ページ (`404.astro`) を作成
  - 404ページにホームへのナビゲーションを含める
  - 404ページに `<meta name="robots" content="noindex">` を設定
  - 404ページでもサイトヘッダーとナビゲーションを維持
  - _Requirements: 2.4, 15.1, 15.2, 15.4, 15.5_
  - **Completed**: about.astro, 404.astro, staticPageUtils.ts (100% coverage), build-output tests (15 cases for About/404)

### Phase 3: SEO・構造化データ

- [ ] 3. SEO最適化実装
- [x] 3.1 SEOメタタグコンポーネント実装
  - 全ページに `<title>` と `<meta name="description">` を設定
  - Open Graph Protocol タグ（og:title, og:description, og:image, og:url, og:type）を生成
  - Twitter Card タグ（twitter:card, twitter:title, twitter:description, twitter:image）を生成
  - 記事詳細では `og:type` を `article` に設定
  - 記事の最初の画像を `og:image` として使用
  - 記事本文から最初の160文字でdescriptionを自動生成
  - canonical URL タグを全ページに設定
  - 日本語文字を正しくエスケープ
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 14.3_
  - **Completed**: SEO.astro, seoUtils.ts (100% coverage), 30 test cases, Layout/pages integrated

- [x] 3.2 (P) JSON-LD構造化データ実装
  - 記事詳細ページに `@type: "BlogPosting"` スキーマを埋め込み
  - headline、datePublished、dateModified、author プロパティを設定
  - 画像がある場合は image プロパティを追加
  - ホームページに `@type: "WebSite"` スキーマを埋め込み
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - **Completed**: JsonLd.astro, jsonLdUtils.ts (100% coverage), 21 test cases, Layout/pages integrated

- [x] 3.3 (P) サイトマップ生成設定
  - `@astrojs/sitemap` インテグレーションを設定
  - ビルド時に `dist/sitemap-index.xml` を自動生成
  - ホーム、About、全公開記事をサイトマップに含める
  - 日本語URLを正しくエンコード
  - _Requirements: 5.1, 5.2, 14.5_
  - **Completed**: sitemapUtils.ts (100% coverage), sitemap.test.ts (12 cases), build-output integration tests

- [x] 3.4 (P) RSSフィード実装
  - RSSフィードエンドポイント (`rss.xml.ts`) を実装
  - 最新20件の公開記事をフィードに含める
  - title、description、linkを各エントリに設定
  - UTF-8エンコーディングで日本語を正しく出力
  - ビルド時に `dist/rss.xml` として生成
  - _Requirements: 5.3, 5.4, 5.5, 14.4_
  - **Completed**: rssUtils.ts (100% coverage), rss.xml.ts endpoint, rss.test.ts (21 cases)

### Phase 4: インフラストラクチャ

- [ ] 4. CloudFront・Terraform設定
- [ ] 4.1 CloudFront Function更新
  - 既存のCloudFront Functionを拡張しAstro SSGルーティングに対応
  - 拡張子なしURLを `{path}/index.html` にリライト
  - 除外パターン設定: `/_astro/*`, `/api/*`, `/admin/*`, `/images/*`, `/sitemap*.xml`, `/rss.xml`, `/robots.txt`
  - ECMAScript 5.1制限内でコードを実装
  - 除外パターンのロジックをテスト
  - _Requirements: 7.8, 7.9, 5.6_

- [ ] 4.2 Terraform CDNモジュール更新
  - `terraform/modules/cdn/` に `/_astro/*` 静的アセット用キャッシュビヘイビアを追加
  - `/_astro/*` のTTLを1年（コンテンツベースハッシュ対応）に設定
  - HTML/XML用デフォルトTTL 1時間、最大TTL 24時間を設定
  - S3 404レスポンス時にカスタム `404.html` を返す設定
  - 既存のAdmin (`/admin/*`) とAPI (`/api/*`) ルーティングを維持
  - S3バケットのバージョニングが有効であることを確認
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.10, 8.1, 8.2, 8.3, 8.4, 12.1, 12.2, 12.3, 12.4_

- [ ] 4.3 (P) CodeBuildプロジェクト追加
  - Terraformで Astro ビルド・デプロイ用 CodeBuild プロジェクトを定義
  - buildspec.ymlでBun環境セットアップ、ビルド、S3同期を実行
  - 環境変数 `API_URL`、`DEPLOYMENT_BUCKET`、`CLOUDFRONT_DIST_ID` を設定
  - IAMロールにS3書き込み、CloudFrontキャッシュ無効化の最小権限を付与
  - KMS暗号化をビルドアーティファクトとログに適用
  - Lambda追加なしでS3静的配信のみ
  - _Requirements: 8.5, 9.5, 9.6_

### Phase 5: デプロイパイプライン

- [ ] 5. ビルド・デプロイ自動化
- [ ] 5.1 原子的デプロイスクリプト実装
  - ビルド済みファイルをステージングプレフィックス (`staging/{build-id}/`) にアップロード
  - アップロード完了後、バージョン付きプレフィックス (`v{timestamp}/`) にコピー
  - CloudFront origin path更新またはS3オブジェクトコピーで原子的切替
  - デプロイ失敗時は前バージョンを維持
  - 古いステージングプレフィックスを削除（直近3バージョン保持）
  - 静的ファイル合計50MB以下を確認
  - `aws s3 sync --delete` の直接使用を禁止
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [ ] 5.2 ローカルデプロイスクリプト更新
  - `scripts/local-deploy.sh` にAstroビルドステップ (`bun run build`) を追加
  - 原子的S3デプロイステップを統合
  - CloudFrontキャッシュ無効化を変更パスのみに限定
  - ビルド・デプロイ合計5分以内を確認
  - _Requirements: 9.1, 9.2, 9.9, 9.10, 9.11_

- [ ] 5.3 GitHub Actionsワークフロー更新
  - `.github/workflows/deploy.yml` にAstroビルド・S3デプロイステップを追加
  - OIDC認証で一時的AWS認証情報を取得
  - 依存関係を特定コミットSHAにピン留め
  - センシティブ値をログ出力でマスク
  - API_URLを環境変数として渡す
  - _Requirements: 9.3, 9.4, 9.7, 9.8_

### Phase 6: バックエンド統合

- [ ] 6. Go Lambda拡張
- [ ] 6.1 ビルドトリガー実装
  - `go-functions/cmd/posts/update/` にCodeBuildトリガー機能を追加
  - publishStatusが "published" に変更された場合にトリガー
  - AWS SDK で CodeBuild StartBuild API を非同期呼び出し
  - 進行中ビルドがある場合は新規リクエストをスキップまたは集約
  - Lambda実行ロールに `codebuild:StartBuild` 権限を追加
  - 最小ビルド間隔（1分）で連続リクエストを集約
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 6.2 (P) ビルドトリガーエラーハンドリング
  - CodeBuild API障害時も投稿更新レスポンスを成功として返す
  - ビルド失敗・エラー時は警告ログのみ出力
  - CloudWatch Logsにビルドステータスを記録
  - 5分以内のコンテンツ反映を目標設定
  - _Requirements: 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

- [ ] 6.3 HTMLサニタイザー実装
  - `go-functions/internal/` に bluemonday ベースのサニタイズ機能を追加
  - 許可タグ: `<p>`, `<br>`, `<strong>`, `<em>`, `<a>`, `<ul>`, `<ol>`, `<li>`, `<h1>`-`<h6>`, `<blockquote>`, `<code>`, `<pre>`, `<img>`
  - `<a>` の `href` は `http://`, `https://`, 相対URLのみ許可
  - `<img>` は `src`, `alt`, `width`, `height` のみ許可、URLパターン検証
  - `<script>`, `<iframe>`, `<object>`, `<embed>`, イベントハンドラ属性を除去
  - posts/create、posts/update Lambda でコンテンツ保存時に適用
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

### Phase 7: パフォーマンス・互換性検証

- [ ] 7. 検証タスク
- [ ] 7.1 パフォーマンス検証
  - Lighthouse Performance スコア 95以上を達成
  - TTFB 100ms未満（CloudFrontエッジ）を確認
  - FCP 1秒未満を確認
  - JavaScript バンドルサイズ 50KB未満（gzip）を確認
  - 静的アセットのBrotli/Gzip圧縮を確認
  - インタラクティブ要素のないページでJS 0生成を確認
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 7.2 (P) 後方互換性検証
  - Admin画面 (`/admin/*`) が変更なく動作することを確認
  - REST APIエンドポイントが変更なく動作することを確認
  - Cognito認証が変更なく動作することを確認
  - 画像配信システムが変更なく動作することを確認
  - 既存URL構造 (`/`, `/posts/[id]`, `/about`) が保持されていることを確認
  - S3バージョニングによる5分以内ロールバック手順を検証
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

### Phase 8: テスト

- [ ] 8. テスト実装
- [ ] 8.1 ユニットテスト実装
  - API呼び出しモジュールのページネーション処理テスト
  - API呼び出しモジュールのエラーリトライテスト
  - SEOメタタグ生成の全パターンテスト
  - JSON-LD構造化データ生成テスト
  - HTMLサニタイザーの許可タグ通過・禁止タグ除去テスト
  - クリティカルロジックで100%カバレッジを達成
  - _Requirements: 13.1_

- [ ] 8.2 (P) 統合テスト実装
  - Astroビルド時の全ページ生成確認
  - 生成されたHTMLのSEOメタタグ・OGP・JSON-LD検証
  - サイトマップ・RSSフィードのURL検証
  - CodeBuildトリガー連携テスト
  - _Requirements: 13.2, 13.5_

- [ ] 8.3 (P) 開発環境・ビルド検証テスト
  - `bun run dev` でポート4321に開発サーバー起動を確認
  - `bun run preview` でビルド済みファイル配信を確認
  - CI失敗時のデプロイブロックを確認
  - _Requirements: 13.3, 13.4, 13.6_
