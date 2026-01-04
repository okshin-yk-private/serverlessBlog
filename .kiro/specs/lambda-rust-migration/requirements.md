# 要件ドキュメント

## はじめに

本仕様書は、既存のAWS Lambda関数をNode.js 24.xランタイムからRustランタイムへ移行するための要件を定義します。この移行は、パフォーマンス向上（コールドスタート時間の短縮、レイテンシ低減）、コスト削減（メモリ使用量削減、実行時間短縮）、信頼性向上を目的としており、既存システムとの完全な機能的互換性を維持します。

**AWS Lambda Rustサポートは2025年11月14日にGA（一般提供）となり、AWS SupportおよびLambda SLAの対象です。** 全AWSリージョン（GovCloud、中国リージョン含む）で利用可能です。

サーバーレスブログプラットフォームは現在、posts、auth、imagesの3ドメインにわたる12のLambda関数でNode.js 24.xとLambda Powertoolsを使用しています。本移行では、`provided.al2023` OS-onlyランタイムとRust公式ツールチェーンを活用します。

### 公式ツール・ライブラリ
- **AWS SDK for Rust**: DynamoDB、S3、Cognito、CloudWatch等のAWSサービス連携
- **aws-lambda-rust-runtime**: Lambda Runtime Interface Client（RIC）
- **Cargo Lambda**: ビルド・デプロイ用CLIツール
- **lambda-http**: API Gateway HTTPイベント処理
- **aws_lambda_events**: イベントソース型定義

## 要件

### 要件1: 依存関係マッピングと技術準備
**目的:** 開発者として、現行Node.js実装の依存関係をRust代替にマッピングしたい。これにより、移行作業をスムーズに開始できる。

#### 受け入れ基準
1. 現行のLambda Powertools機能（Logger、Tracer、Metrics）に対応するRustクレートを特定し文書化すること。
2. Markdown処理（marked、DOMPurify）のRust代替クレート（pulldown-cmark、ammonia等）を特定すること。
3. 各Lambda関数で使用しているAWS SDKオペレーション（DynamoDB、S3、Cognito）がAWS SDK for Rustでサポートされていることを確認すること。
4. When 代替クレートが存在しない機能がある場合, the 技術リード shall 回避策または独自実装の必要性を文書化すること。

### 要件2: Rust開発環境セットアップ
**目的:** 開発者として、既存プロジェクトと統合された適切に構成されたRust開発環境が欲しい。これにより、Lambda関数を効率的に開発・テストできる。

#### 受け入れ基準
1. プロジェクトは、複数のLambda関数クレートをサポートするCargoワークスペース構成を含むこと。
2. ビルドシステムは、`aarch64-unknown-linux-musl`ターゲットを使用してARM64（Graviton2）互換バイナリを生成すること。
3. When `cargo lambda build --release --arm64`を実行した場合, the ビルドシステム shall 関数あたり10MB未満の静的リンクバイナリを生成すること。
4. 開発環境は、Cargo Lambdaによるローカルテスト（`cargo lambda watch`、`cargo lambda invoke`）をサポートすること。
5. プロジェクトは、一貫したビルドのために安定版Rustバージョンを指定する`rust-toolchain.toml`ファイルを維持すること。

### 要件3: Lambda関数移行 - Postsドメイン
**目的:** プラットフォーム運用者として、すべての記事関連Lambda関数をRustに移行したい。これにより、記事管理操作がパフォーマンス向上の恩恵を受ける。

#### 受け入れ基準
1. createPost関数は、`lambda-http`クレートを使用してAPI Gatewayイベントを処理し、Node.js実装と同一のレスポンス構造を返すこと。
2. getPost関数は、AWS SDK for Rustを使用してDynamoDBから記事を取得し、同等のアクセス制御ロジックを実装すること。
3. listPosts関数は、同一の動作でページネーション（limit、nextToken）とフィルタリング（category、publishStatus）をサポートすること。
4. updatePost関数は、部分更新を処理し、title、contentMarkdown、category、tagsに対して同じバリデーションルールを維持すること。
5. deletePost関数は、バッチ削除操作（`DeleteObjectsCommand`相当）を使用して関連するS3画像をカスケード削除すること。
6. If DynamoDB操作が失敗した場合, the Post Handler shall 既存のエラーハンドリングと一致する適切なHTTPステータスコード（400、404、500）を返すこと。

### 要件4: Lambda関数移行 - Authドメイン
**目的:** プラットフォーム運用者として、すべての認証Lambda関数をRustに移行したい。これにより、ログインとセッション操作のレイテンシが最小限になる。

#### 受け入れ基準
1. login関数は、AWS SDK for Rustの`InitiateAuth`（USER_PASSWORD_AUTHフロー）を使用してユーザーを認証し、JWTトークン（accessToken、refreshToken、idToken）を返すこと。
2. refresh関数は、`InitiateAuth`（REFRESH_TOKEN_AUTHフロー）を使用して新しいアクセストークンとIDトークンを取得すること。
3. logout関数は、`GlobalSignOut`を呼び出してすべてのセッションを無効化すること。
4. When 認証が失敗した場合, the Auth Handler shall 既存の動作と一致する適切なエラーメッセージ付きの401ステータスを返すこと（NotAuthorizedException、UserNotFoundException、UserNotConfirmedException）。
5. auth関数は、統合テスト用に環境変数経由でLocalStackエンドポイント構成をサポートすること。

### 要件5: Lambda関数移行 - Imagesドメイン
**目的:** プラットフォーム運用者として、画像関連Lambda関数をRustに移行したい。これにより、Pre-signed URL生成が高速化される。

#### 受け入れ基準
1. getUploadUrl関数は、AWS SDK for Rustの`PresigningConfig`を使用して15分（900秒）の有効期限でS3 Pre-signed URLを生成すること。
2. getUploadUrl関数は、ファイル拡張子（.jpg、.jpeg、.png、.gif、.webp）とコンテンツタイプ（image/jpeg、image/png、image/gif、image/webp）を検証すること。
3. getUploadUrl関数は、5MBのファイルサイズ制限を適用すること。
4. S3キーは、`images/{userId}/{timestamp}_{sanitizedFileName}`のパターンに従うこと。
5. If CloudFrontディストリビューションURLが設定されている場合, the Image Handler shall CloudFront URLを返すこと。それ以外の場合はS3ダイレクトURLにフォールバックすること。

### 要件6: 可観測性とモニタリング
**目的:** 運用エンジニアとして、Rust Lambda関数に同等の可観測性機能が欲しい。これにより、本番環境の問題を効果的に監視・トラブルシュートできる。

#### 受け入れ基準
1. Rust Lambda関数は、`tracing`クレートを使用してCloudWatch Logs Insightsクエリと互換性のある構造化JSONログを出力すること。
2. While 本番環境（prd）の場合, the 関数 shall AWS X-Ray SDKまたは`tracing-subscriber`のX-Ray統合を使用してトレーシングを有効化すること。
3. 関数は、AWS SDK for Rustの`cloudwatch`クライアントを使用して`BlogPlatform`名前空間にカスタムメトリクスを出力すること。
4. ログエントリは、既存のLambda Powertoolsパターンと一致するリクエストコンテキスト（requestId、userId、postId）を含むこと。
5. If エラーが発生した場合, the Error Logger shall 構造化形式でスタックトレースとエラー詳細をキャプチャすること。

### 要件7: CDKインフラストラクチャ更新
**目的:** DevOpsエンジニアとして、Rust Lambdaデプロイをサポートするようにcdkスタックを更新したい。これにより、インフラストラクチャの一貫性と自動化が維持される。

#### 受け入れ基準
1. LambdaFunctionsStackは、`Runtime.PROVIDED_AL2023`とARM64アーキテクチャを使用して`lambda.Function`でRust Lambda関数を定義すること。
2. CDKコードは、Cargo Lambdaがビルドした`bootstrap`バイナリを含むディレクトリを`Code.fromAsset()`で指定すること。
3. 環境変数（TABLE_NAME、BUCKET_NAME、USER_POOL_ID、USER_POOL_CLIENT_ID等）は、Node.js関数と同一にRust関数に渡されること。
4. When 本番環境にデプロイする場合, the CDK Stack shall `Tracing.ACTIVE`でRust関数のX-Rayトレーシングを有効化すること。
5. CDK Nagセキュリティチェックは、すべてのRust Lambda関数構成に対してパスすること。

### 要件8: テスト戦略
**目的:** 開発者として、Rust Lambda関数の包括的なテストが欲しい。これにより、正確性を確保しリグレッションを防止できる。

#### 受け入れ基準
1. 各Rust Lambda関数は、`#[cfg(test)]`モジュールでユニットテストを実装し、100%コードカバレッジを達成すること。
2. 統合テストは、DynamoDB Local（Docker）とCognito/S3シミュレーション用のLocalStackを使用すること。
3. 既存のAPI統合テストスイート（46テスト）は、変更なしでRust Lambda関数に対してパスすること。
4. When `cargo test`を実行した場合, the Test Runner shall 30秒以内にすべてのユニットテストを実行すること。
5. CIパイプラインは、`cargo lambda build --arm64`によるクロスコンパイルでRust関数をビルド・テストすること。

### 要件9: 段階的移行とロールバック
**目的:** プラットフォーム運用者として、ロールバック機能を備えた段階的移行アプローチが欲しい。これにより、移行中のリスクを最小化できる。

#### 受け入れ基準
1. 移行は、移行期間中にNode.jsとRust関数を並行して実行することをサポートすること。
2. API Gatewayルートは、Lambda関数エイリアスまたはステージ変数を使用してNode.jsまたはRust Lambda関数のいずれかにトラフィックをルーティングするよう構成可能であること。
3. If Rust関数のエラー率が5分間のウィンドウで5%を超えた場合, the CloudWatchアラーム shall ロールバックアラートをトリガーすること。
4. ロールバック手順は文書化され、CDKデプロイまたはLambdaエイリアス切り替えにより15分以内に実行可能であること。
5. Where 段階的ロールアウトが必要な場合, the システム shall Lambda Weighted Aliasを使用してトラフィックを段階的に移行できること。

### 要件10: パフォーマンス検証
**目的:** プラットフォーム運用者として、Rust移行によるパフォーマンス改善を検証したい。これにより、移行の労力を正当化できる。

#### 受け入れ基準
1. Rust Lambda関数は、100ms未満のコールドスタート時間を達成すること（Node.jsの約300msと比較）。
2. Rust Lambda関数は、パフォーマンスを維持しながら128MB以下のメモリ構成を使用すること。
3. While APIリクエストを処理している間, the Rust関数 shall 読み取り操作で50ms未満のP99レイテンシを達成すること。
4. パフォーマンステストは、Artillery等のツールを使用して5分間100同時リクエストの負荷テストを含むこと。
5. 移行は、課金時間（メモリ×実行時間）に基づき少なくとも40%のコスト削減を達成すること。

