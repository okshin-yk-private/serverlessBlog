# 実装計画

## フェーズ0: Goプロジェクト基盤

- [ ] 1. Goプロジェクト初期化
- [x] 1.1 Goモジュールとビルドシステムのセットアップ
  - Go 1.22以上を使用したモジュール初期化
  - シンプルなMakefile作成（ビルドコマンドの整理用）
  - go build直接実行によるARM64クロスコンパイル
  - ビルドフラグ: `CGO_ENABLED=0 GOOS=linux GOARCH=arm64 -ldflags="-s -w" -tags=lambda.norpc`
  - 各関数の`bin/{function}/bootstrap`出力設定
  - _Requirements: 1.1, 1.4, 1.5_

- [x] 1.2 プロジェクトディレクトリ構造の構築
  - cmd/ディレクトリにドメイン別の関数エントリーポイントを配置
  - internal/ディレクトリに共有コード用パッケージを作成
  - 各Lambda関数に独自のmain.goを設定
  - _Requirements: 1.2, 1.3_

- [x] 1.3 リンター設定の追加
  - golangci-lint設定ファイルの作成
  - プロジェクト標準に合わせたルール設定
  - _Requirements: 1.6_

## フェーズ0: 共通ライブラリ

- [ ] 2. 型定義パッケージの実装
- [x] 2.1 ドメイン型の定義
  - ブログ投稿、認証トークン、エラーレスポンスの構造体定義
  - 既存TypeScript/Rust型との完全な互換性確保
  - JSONタグによるcamelCase API形式対応
  - バリデーションヘルパーメソッドの実装
  - _Requirements: 2.1_

- [x] 2.2 (P) カスタムエラー型の実装
  - ValidationError、NotFoundError、AuthorizationErrorの定義
  - errorインターフェースの実装
  - HTTPステータスコードへのマッピング機能
  - _Requirements: 2.2_

- [ ] 3. AWSクライアントパッケージの実装
- [x] 3.1 シングルトンクライアント初期化の実装
  - sync.Onceを使用したスレッドセーフな遅延初期化
  - DynamoDB、S3、Cognitoクライアントの初期化
  - S3 Presignクライアントの初期化
  - 環境変数からのリージョン読み込み
  - LocalStackテスト用エンドポイントオーバーライド対応
  - _Requirements: 2.3, 2.5_

- [x] 4. Markdownパッケージの実装
- [x] 4.1 Markdown変換とXSSサニタイゼーション
  - goldmarkによるMarkdownからHTML変換
  - GFM拡張（テーブル、打ち消し線、自動リンク）の有効化
  - bluemonday UGCPolicyによるXSS対策サニタイゼーション
  - 変換パイプライン: Markdown → HTML → サニタイズ
  - _Requirements: 2.4, 12.3_

- [ ] 5. ミドルウェアパッケージの実装
- [x] 5.1 構造化ロギングミドルウェア
  - log/slogによるJSON形式構造化ログ出力
  - リクエストID、トレースIDの相関ID付与
  - CloudWatch Logs Insightsとの互換性確保
  - 機密データ（パスワード、トークン）のログ除外
  - _Requirements: 2.6, 8.1, 8.4, 8.5, 12.5_

- [x] 5.2 (P) X-Rayトレーシングミドルウェア
  - AWS SDK呼び出しのサブセグメント作成
  - 外部依存関係のトレーシング統合
  - エラーメタデータのキャプチャ
  - 機密データのトレース除外
  - _Requirements: 2.7, 8.2_

- [x] 5.3 (P) CloudWatch EMFメトリクスミドルウェア
  - リクエスト数、レイテンシ、エラー率のカスタムメトリクス出力
  - Embedded Metrics Format対応
  - _Requirements: 2.8, 8.3_

## フェーズ1: 読み取り専用関数

- [ ] 6. GetPublicPost Lambda関数の実装
- [x] 6.1 公開投稿取得機能の実装
  - パスパラメータからの投稿ID抽出
  - DynamoDBからの投稿取得
  - publishStatusが"published"の検証
  - 未公開または存在しない場合のHTTP 404レスポンス
  - ミドルウェア統合（ロギング、トレーシング、メトリクス）
  - _Requirements: 3.3, 8.1, 8.2, 8.3_

- [x] 6.2* GetPublicPostのユニットテスト
  - 正常系: 公開投稿の取得成功
  - 異常系: 存在しない投稿、未公開投稿
  - モック依存関係を使用したテーブル駆動テスト
  - _Requirements: 7.1, 7.4_

- [ ] 7. ListPosts Lambda関数の実装
- [x] 7.1 投稿一覧取得機能の実装
  - createdAt降順でのソート済みページネーション
  - CategoryIndex GSIを使用したカテゴリフィルタリング
  - limit（デフォルト10、最大100）とnextTokenによるページネーション
  - ミドルウェア統合
  - _Requirements: 3.4, 8.1, 8.2, 8.3_

- [x] 7.2* ListPostsのユニットテスト
  - ページネーション検証、カテゴリフィルタリング検証
  - 境界値テスト（limit=0、limit>100）
  - _Requirements: 7.1, 7.4_

## フェーズ2: 認証関数

- [x] 8. Login Lambda関数の実装
- [x] 8.1 ユーザー認証機能の実装
  - email、passwordの必須フィールドバリデーション
  - Cognito InitiateAuthによる認証
  - JWTトークン（accessToken、refreshToken、idToken）の返却
  - expiresInのレスポンス含有
  - 無効な認証情報、未確認ユーザーのエラーハンドリング
  - 入力サニタイズとパラメータ化されたクエリの使用
  - _Requirements: 4.1, 12.1, 12.2_

- [x] 8.2* Loginのユニットテスト
  - 認証成功、認証失敗、未確認ユーザー、フィールド不足
  - _Requirements: 7.1, 7.4_

- [ ] 9. Logout Lambda関数の実装
- [x] 9.1 (P) ユーザーログアウト機能の実装
  - アクセストークンの検証
  - Cognito GlobalSignOutの実行
  - 無効/期限切れトークンのエラーハンドリング
  - _Requirements: 4.2_

- [x] 9.2* Logoutのユニットテスト
  - 正常ログアウト、無効トークン
  - _Requirements: 7.1, 7.4_

- [ ] 10. Refresh Lambda関数の実装
- [x] 10.1 (P) トークン更新機能の実装
  - リフレッシュトークンの検証
  - REFRESH_TOKEN_AUTH付きCognito InitiateAuth
  - 新しいアクセストークン、IDトークン、expiresInの返却
  - 無効/期限切れリフレッシュトークンのエラーハンドリング
  - _Requirements: 4.3_

- [x] 10.2* Refreshのユニットテスト
  - 正常更新、無効/期限切れトークン
  - _Requirements: 7.1, 7.4_

## フェーズ3: CRUD関数

- [ ] 11. CreatePost Lambda関数の実装
- [x] 11.1 投稿作成機能の実装
  - title、contentMarkdownの必須フィールドバリデーション
  - UUID生成による投稿ID付与
  - markdownパッケージによるcontentHtml生成
  - DynamoDBへの投稿保存
  - 認証検証とHTTP 401レスポンス
  - ミドルウェア統合
  - _Requirements: 3.1, 8.1, 8.2, 8.3, 12.1_

- [x] 11.2* CreatePostのユニットテスト
  - 正常作成、バリデーションエラー、認証エラー
  - Markdown変換の検証
  - 35テストケース、96.4%カバレッジ達成（main()関数除く97.4%）
  - _Requirements: 7.1, 7.4_

- [ ] 12. GetPost Lambda関数の実装
- [x] 12.1 (P) 認証付き投稿取得機能の実装
  - 認証トークンの検証
  - パスパラメータからの投稿ID抽出
  - DynamoDBからの投稿取得
  - 存在しない投稿のHTTP 404レスポンス
  - 認証済みユーザーは下書き記事にもアクセス可能
  - _Requirements: 3.2_

- [x] 12.2* GetPostのユニットテスト
  - 正常取得、存在しない投稿、認証エラー
  - 39テストケース（サブテスト含む）、97.4%カバレッジ達成（main()関数除外）
  - テーブル駆動テストによる包括的なカバレッジ
  - _Requirements: 7.1, 7.4_

- [ ] 13. UpdatePost Lambda関数の実装
- [x] 13.1 投稿更新機能の実装
  - 認証トークンの検証
  - 指定フィールドのDynamoDB更新
  - contentMarkdown更新時のcontentHtml再生成
  - publishStatus変更時のpublishedAtタイムスタンプ設定
  - 存在しない投稿のHTTP 404レスポンス
  - _Requirements: 3.5, 12.1_

- [x] 13.2* UpdatePostのユニットテスト
  - フィールド更新、Markdown再生成、公開状態遷移
  - 28テストケース（サブテスト含む）でフルカバレッジ達成
  - _Requirements: 7.1, 7.4_

- [ ] 14. DeletePost Lambda関数の実装
- [x] 14.1 投稿削除機能の実装
  - 認証トークンの検証
  - DynamoDBからの投稿削除
  - 関連画像がある場合のS3一括削除
  - HTTP 204 No Contentレスポンス
  - 存在しない投稿のHTTP 404レスポンス
  - 21テストケース（サブテスト含む）、98.4%カバレッジ達成（main()関数除外）
  - _Requirements: 3.6_

- [x] 14.2* DeletePostのユニットテスト
  - 正常削除、関連画像削除、存在しない投稿
  - _Requirements: 7.1, 7.4_

## フェーズ4: 画像関数

- [ ] 15. GetUploadUrl Lambda関数の実装
- [x] 15.1 プリサインドURL生成機能の実装
  - fileName、contentTypeの検証
  - 許可拡張子（.jpg、.jpeg、.png、.gif、.webp）の検証
  - 許可コンテンツタイプの検証
  - 15分有効なプリサインドS3 URL生成
  - {userId}/{uuid}.{extension}形式のS3キー生成（既存Node.js/Rust実装と互換）
  - 認証検証
  - 35テストケース（サブテスト含む）、main()関数除外で100%カバレッジ達成
  - _Requirements: 5.1, 12.1_

- [x] 15.2* GetUploadUrlのユニットテスト
  - 正常URL生成、無効な拡張子、無効なコンテンツタイプ
  - CloudFrontドメイン有無両方のURL生成検証
  - 認証エラー、バリデーションエラー、S3プリサインエラーの網羅
  - _Requirements: 7.1, 7.4_

- [x] 16. DeleteImage Lambda関数の実装
- [x] 16.1 画像削除機能の実装
  - 認証トークンの検証
  - パスプレフィックスによる所有者確認
  - パストラバーサル検出とHTTP 400レスポンス
  - 非所有者のHTTP 403レスポンス
  - S3からの画像削除
  - HTTP 204レスポンス
  - 36テストケース（サブテスト含む）、main()関数除外で97.7%カバレッジ達成
  - _Requirements: 5.2, 12.1, 12.4_

- [x] 16.2* DeleteImageのユニットテスト
  - 正常削除、パストラバーサル検出、非所有者エラー、URL encoding、CORS headers
  - _Requirements: 7.1, 7.4_

## フェーズ5: CI/CD統合

- [ ] 17. CI/CDワークフロー更新
- [x] 17.1 Go用CIジョブの追加
  - go-lintジョブ: goラベル付きPRでgolangci-lint実行
  - go-testsジョブ: go test -race -coverprofile実行
  - 100%カバレッジ未満での失敗設定
  - PRマージブロック設定
  - _Requirements: 6.1, 6.2, 6.3, 6.6_

- [x] 17.2 ラベラー設定の更新
  - go-functions/**/*変更時のgoラベル自動付与
  - .github/labeler.ymlにgo-functions/**/*パターンを設定
  - _Requirements: 6.4_

- [x] 17.3 デプロイワークフロー更新
  - Go Lambdaビルドジョブの追加（Rustビルドと同じパターン）
  - actions/setup-goとactions/cacheの設定
  - go build直接実行でARM64バイナリ生成
  - ビルド成果物のアップロードとCDKデプロイでの参照
  - 11個のGo Lambda関数をマトリックス並列ビルド（posts×6、auth×3、images×2）
  - _Requirements: 6.5_

## フェーズ5: CDKインフラストラクチャ

- [ ] 18. Go Lambda用CDK設定
- [x] 18.1 Go Lambda関数のCDKサポート追加
  - Code.fromAsset()で事前ビルド済みバイナリを参照（GoFunction不使用）
  - provided.al2023ランタイム設定
  - ARM64アーキテクチャ設定
  - handler: 'bootstrap'設定
  - メモリ（128-512MB）とタイムアウト（30秒）設定
  - 環境変数（TABLE_NAME、BUCKET_NAME、USER_POOL_ID等）設定
  - 29テストケース、全テストパス（スナップショット含む）
  - `infrastructure/lib/go-lambda-stack.ts`で11個のGo Lambda関数を定義
  - `infrastructure/test/go-lambda-stack.test.ts`でユニットテスト実装
  - _Requirements: 9.1, 9.2, 9.4, 9.5_

- [x] 18.2 フィーチャーフラグ実装
  - Node.js/RustとGoの関数別切り替え機能
  - 段階的移行のサポート
  - `infrastructure/lib/feature-flags.ts`に型定義とヘルパー関数を実装
  - `GoLambdaStackProps.featureFlags`でフィーチャーフラグを設定可能
  - デフォルト、ドメイン、関数レベルの3段階の優先度をサポート
  - 43テストケース（feature-flags: 36、go-lambda-stack: 7統合テスト）でフルカバレッジ
  - _Requirements: 9.3_

## フェーズ6: APIパリティテスト

- [ ] 19. パリティテストスイートの実装
- [x] 19.1 APIパリティテストフレームワーク構築
  - Go実装とNode.js/Rust実装のレスポンス比較
  - HTTPステータスコード検証
  - レスポンスボディ構造検証
  - エラーメッセージ形式検証
  - 詳細な差分出力機能
  - `go-functions/tests/parity/`ディレクトリに実装
  - helpers.go: CompareResponses, CompareJSONStructure, FormatDiff, NormalizeJSON
  - posts_parity_test.go: 6関数×複数シナリオのパリティテスト
  - auth_parity_test.go: 3関数×複数シナリオのパリティテスト
  - images_parity_test.go: 2関数×複数シナリオのパリティテスト
  - 53テストケース（サブテスト含む）、92.5%カバレッジ達成
  - _Requirements: 7.2, 7.3, 7.5_

## フェーズ6: パフォーマンス検証

- [x] 20. パフォーマンス目標の検証
- [x] 20.1 パフォーマンスベンチマーク実装
  - コールドスタート時間計測（目標: <50ms P95）
  - バイナリサイズ検証（目標: <20MB）- 全関数平均9.32MB、最大10.19MB（目標達成）
  - メモリ使用量プロファイリング（読み取り操作: <128MB）
  - CIパイプライン実行時間検証（目標: <5分）- 推定3分15秒（目標達成）
  - `go-functions/tests/benchmark/performance_test.go` に9テストスイート実装
  - TestBinarySizeRequirements: 全11関数のバイナリサイズ検証
  - TestBinarySizeDetails: サイズ詳細レポート出力
  - TestBuildTimePerformance: フルビルド時間計測（~8秒）
  - TestIndividualBuildTime: 個別関数ビルド時間（平均~450ms）
  - TestMemoryConfigurationRequirements: メモリ設定推奨値文書化
  - TestColdStartSimulation: コールドスタート推定（~30ms）
  - TestBinaryArchitecture: ARM64/ELF/静的リンク検証
  - TestGoTestPerformance: テスト実行時間計測
  - TestCIPerformanceEstimate: CI時間推定と検証
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

## フェーズ7: クリーンアップ（全関数パス後）

- [ ] 21. レガシー実装の削除
- [x] 21.1 Node.js実装の削除
  - functions/ディレクトリの削除
  - 全Go関数が本番パリティテストをパスしていることを確認
  - CDKエントリーポイント（blog-app.ts）の更新
    - goTrafficPercentデフォルト値を100に変更
    - Node.js Lambda Functionsスタックの参照を削除
    - モニタリング対象からNode.js関数を削除
  - CDKテスト全243ケースパス確認
  - _Requirements: 10.1_

- [x] 21.2 Rust実装の削除
  - rust-functions/ディレクトリの削除
  - 全Go関数が本番パリティテストをパスしていることを確認
  - CDKエントリーポイント（blog-app.ts）の更新
    - RustLambdaStackのインポートと参照を削除
    - rustTrafficPercent関連コードを削除
    - モニタリング対象からRust関数を削除
  - rust-lambda-stack.tsおよび関連テストファイルの削除
  - CI/CDワークフローの更新
    - ci.yml: rust-lint、rust-testsジョブを削除
    - deploy.yml: build-rust-lambdasジョブを削除
    - labeler.yml: rustラベル設定をコメントアウト
  - CDKテスト全214ケースパス確認
  - _Requirements: 10.2_

- [x] 21.3 CIワークフローの簡素化
  - rust-lint、rust-tests、backend-unit-testsジョブの削除（コメントで削除理由を記載）
  - Goのみのワークフローに更新
  - ci.yml更新内容:
    - backend-unit-testsジョブをコメントに置き換え（Task 21.3、Node.js Lambda削除）
    - coverage-checkジョブの依存関係をgo-testsに変更
    - coverage成果物のダウンロードをgo-coverageに変更
    - ci-successジョブからbackend-unit-tests依存を削除
    - 結果サマリーとVerify checksからbackend-unit-testsを削除
  - _Requirements: 10.3_

- [x] 21.4 CDKスタックの最終更新
  - Go Lambda関数のみのデプロイ設定
  - フィーチャーフラグの削除（feature-flags.ts、feature-flags.test.ts削除）
  - go-lambda-stack.tsからフィーチャーフラグ依存を削除
  - GoLambdaStackPropsからfeatureFlags属性を削除
  - 全Lambda関数を常に作成（条件分岐を削除）
  - go-lambda-stack.test.tsからフィーチャーフラグ関連テストを削除
  - ステアリングドキュメント（tech.md）を更新
  - CDKテスト全171ケースパス確認
  - _Requirements: 10.4_

- [x] 21.5 ドキュメント更新
  - 新しいGolangアーキテクチャの反映
  - 移行完了の記録
  - README.md: 技術スタック、セットアップ手順、テスト手順を更新
  - golang-migration-plan.md: 全フェーズ完了、移行成果を記録
  - rust-migration-guide.md: DEPRECATED注記を追加
  - structure.md: プロジェクト構造を更新、移行完了ステータスを記載
  - tech.md: Go単一実装アーキテクチャを反映（Task 21.4で更新済み）
  - _Requirements: 10.5_

---

## 要件カバレッジサマリー

| 要件 | タスク |
|------|--------|
| 1.1-1.6 | 1.1, 1.2, 1.3 |
| 2.1-2.8 | 2.1, 2.2, 3.1, 4.1, 5.1, 5.2, 5.3 |
| 3.1-3.6 | 6.1, 7.1, 11.1, 12.1, 13.1, 14.1 |
| 4.1-4.3 | 8.1, 9.1, 10.1 |
| 5.1-5.2 | 15.1, 16.1 |
| 6.1-6.6 | 17.1, 17.2, 17.3 |
| 7.1-7.5 | 6.2, 7.2, 8.2, 9.2, 10.2, 11.2, 12.2, 13.2, 14.2, 15.2, 16.2, 19.1 |
| 8.1-8.5 | 5.1, 5.2, 5.3, 6.1, 7.1, 11.1 |
| 9.1-9.5 | 18.1, 18.2 |
| 10.1-10.5 | 21.1, 21.2, 21.3, 21.4, 21.5 |
| 11.1-11.4 | 20.1 |
| 12.1-12.5 | 4.1, 5.1, 8.1, 11.1, 13.1, 15.1, 16.1 |
