# 実装計画

## タスク概要

本実装計画は、AWSサーバーレスブログシステムの段階的な構築を定義します。各タスクはTDD（テスト駆動開発）方式で実施し、前のタスクの成果物を活用しながら機能を追加します。

---

- [ ] 1. プロジェクト基盤とLambda Layersのセットアップ

- [x] 1.1 CDKプロジェクトの初期化とディレクトリ構造の作成
  - CDKプロジェクトを初期化し、TypeScript設定を構成する
  - ステアリング文書に従ったディレクトリ構造を作成する（infrastructure/, layers/, functions/, frontend/, tests/）
  - package.jsonに必須依存関係を追加する（aws-cdk-lib, constructs, cdk-nag, jest, ts-jest）
  - CDKテスト環境を設定し、サンプルテストが実行できることを確認する
  - Gitリポジトリを初期化し、.gitignoreを設定する
  - _Requirements: 6.1, 6.3_

- [x] 1.2 Lambda Powertools Layerの構築
  - Lambda Powertools用のLayerディレクトリ構造を作成する
  - package.jsonでPowertools依存関係を定義する（Logger, Tracer, Metrics, Parameters）
  - Lambda Layer用のCDKスタックを実装し、LayerVersionを定義する
  - LayerスタックのCDKユニットテストを作成し、互換ランタイムとレイヤー名を検証する
  - LayerスタックのCDKスナップショットテストを作成する
  - _Requirements: 6.3, 6.5_

- [x] 1.3 共通ユーティリティLayerの構築
  - プロジェクト共通ライブラリ用のLayerディレクトリ構造を作成する
  - マークダウンからHTMLへの変換ロジックを実装する（XSS対策を含む）
  - S3 Pre-signed URL生成ユーティリティを実装する
  - DynamoDB操作ヘルパーユーティリティを実装する（PutItem, GetItem, Query, DeleteItem）
  - 共通ライブラリのユニットテストを作成する（マークダウン変換、URL生成、DynamoDB操作）
  - 共通ライブラリLayer用のCDKスタックを実装する
  - _Requirements: 1.7, 3.4, 4.4, 4.5_

- [ ] 2. データベースとストレージインフラの構築

- [ ] 2.1 DynamoDBテーブルとGlobal Secondary Indexesの定義
  - DynamoDBテーブルをCDKで定義する（パーティションキー: id、オンデマンドモード）
  - CategoryIndexを定義する（パーティションキー: category、ソートキー: createdAt）
  - PublishStatusIndexを定義する（パーティションキー: publishStatus、ソートキー: createdAt）
  - ポイントインタイムリカバリを有効化する
  - DynamoDBスタックのCDKユニットテストを作成する（テーブル構成、GSI、PITR検証）
  - DynamoDBスタックのCDKスナップショットテストを作成する
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 2.2 S3バケットの構成（画像ストレージと静的サイトホスティング）
  - 画像ストレージ用S3バケットをCDKで定義する（バージョニング有効、パブリックアクセスブロック）
  - 静的コンテンツ用S3バケットをCDKで定義する（公開ページ用、管理画面用）
  - 画像バケットのライフサイクルポリシーを設定する（30日間未アクセスで低頻度アクセス層へ移行）
  - バケット暗号化を設定する（SSE-S3）
  - S3スタックのCDKユニットテストを作成する（バケット設定、暗号化、ライフサイクルポリシー検証）
  - S3スタックのCDKスナップショットテストを作成する
  - _Requirements: 4.5, 5.4_

- [ ] 3. 認証システムの実装

- [ ] 3.1 Cognito User Poolとアプリクライアントの設定
  - Cognito User PoolをCDKで定義する（メールサインイン、パスワードポリシー設定）
  - MFA設定をOptionalに設定する（将来的にRequiredに変更可能）
  - User Pool Clientを定義する（管理画面用）
  - 自己登録を無効化する（管理者による手動ユーザー作成のみ）
  - CognitoスタックのCDKユニットテストを作成する（User Pool設定、クライアント設定検証）
  - CognitoスタックのCDKスナップショットテストを作成する
  - _Requirements: 2.2, 2.3_

- [ ] 3.2 API Gateway Cognito Authorizerの統合
  - API Gateway REST APIをCDKで定義する
  - Cognito User Pool AuthorizerをAPI Gatewayに統合する
  - 管理API用のリソースパス（/admin/*）にAuthorizerを適用する
  - 公開API用のリソースパス（/posts）は認証不要に設定する
  - API Gatewayスタックの基本CDKユニットテストを作成する（Authorizer設定検証）
  - _Requirements: 2.1, 2.4, 2.6, 3.7_

- [ ] 4. 記事管理API実装（管理者向け）

- [ ] 4.1 記事作成機能の実装（マークダウン自動変換とHTML保存）
  - 記事作成Lambda関数のユニットテストを先に作成する（TDD）
  - マークダウンをHTMLに変換する処理を実装する（共通ライブラリLayer使用）
  - 記事データをDynamoDBに保存する処理を実装する（contentMarkdown、contentHtml両方保存）
  - 一意の記事ID（UUID）を生成し、createdAt、updatedAtを設定する
  - リクエストバリデーションを実装する（タイトル、本文、カテゴリの検証）
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（POST /admin/posts）
  - 統合テストを作成する（API Gateway → Lambda → DynamoDB）
  - _Requirements: 1.1, 1.2, 1.7, 4.4_

- [ ] 4.2 記事更新機能の実装
  - 記事更新Lambda関数のユニットテストを先に作成する（TDD）
  - 既存記事の存在確認処理を実装する（DynamoDB GetItem）
  - マークダウン変換と更新処理を実装する（updatedAtを現在時刻に設定）
  - リクエストバリデーションを実装する
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（PUT /admin/posts/{id}）
  - 統合テストを作成する（存在しない記事の更新時の404エラー検証含む）
  - _Requirements: 1.3, 1.4, 4.4_

- [ ] 4.3 記事削除機能の実装
  - 記事削除Lambda関数のユニットテストを先に作成する（TDD）
  - 記事削除処理を実装する（DynamoDB DeleteItem）
  - 記事存在確認とエラーハンドリングを実装する
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（DELETE /admin/posts/{id}）
  - 統合テストを作成する（削除後の取得時404エラー検証含む）
  - _Requirements: 1.5, 1.6_

- [ ] 4.4 記事取得機能の実装（管理用、マークダウン含む）
  - 記事取得Lambda関数のユニットテストを先に作成する（TDD）
  - 記事詳細取得処理を実装する（DynamoDB GetItem、contentMarkdown含む）
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（GET /admin/posts/{id}）
  - 統合テストを作成する
  - _Requirements: 1.3_

- [ ] 4.5 画像アップロードURL生成機能の実装
  - Pre-signed URL生成Lambda関数のユニットテストを先に作成する（TDD）
  - S3 Pre-signed URL生成処理を実装する（共通ライブラリLayer使用、有効期限5分）
  - ファイルタイプ検証を実装する（image/jpeg, image/png, image/gifのみ許可）
  - ファイルサイズ検証を実装する（最大5MB）
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（POST /admin/images/upload-url）
  - 統合テストを作成する（Pre-signed URLの有効性検証含む）
  - _Requirements: 4.5_

- [ ] 5. 公開API実装（一般ユーザー向け）

- [ ] 5.1 公開記事一覧取得機能の実装（ページネーション対応）
  - 記事一覧取得Lambda関数のユニットテストを先に作成する（TDD）
  - PublishStatusIndex（publishStatus='published'）を使用したクエリ処理を実装する
  - ページネーション処理を実装する（1ページ10件、nextToken使用）
  - contentMarkdownを除外し、contentHtmlのみ返却する処理を実装する
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（GET /posts）
  - 統合テストを作成する（ページネーション動作検証含む）
  - _Requirements: 3.1, 3.6_

- [ ] 5.2 公開記事詳細取得機能の実装
  - 記事詳細取得Lambda関数のユニットテストを先に作成する（TDD）
  - 記事取得処理を実装する（contentMarkdown除外、contentHtmlのみ）
  - 下書き記事（publishStatus='draft'）は404を返す処理を実装する
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（GET /posts/{id}）
  - 統合テストを作成する（下書き記事アクセス時の404検証含む）
  - _Requirements: 3.2, 3.3, 3.4_

- [ ] 5.3 カテゴリ別記事フィルタ機能の実装
  - カテゴリフィルタLambda関数のユニットテストを先に作成する（TDD）
  - CategoryIndexを使用したクエリ処理を実装する（category + publishStatus='published'）
  - ページネーション処理を実装する
  - Lambda Powertools（Logger, Tracer, Metrics）を統合する
  - Lambda関数をAPI Gatewayに統合する（GET /posts?category={name}）
  - 統合テストを作成する（カテゴリフィルタとページネーション動作検証）
  - _Requirements: 3.5_

- [ ] 6. 管理画面フロントエンド実装

- [ ] 6.1 React + Viteプロジェクトのセットアップ
  - React + Viteプロジェクトを初期化する
  - TypeScript設定を構成する
  - Tailwind CSSまたは選定したUIライブラリをインストールする
  - Reactルーティング設定を構成する（記事一覧、作成、編集ページ）
  - 環境変数設定を構成する（API Gateway URL、Cognito設定）
  - ビルドスクリプトを設定する（S3デプロイ用）
  - _Requirements: 6.1_

- [ ] 6.2 認証フローの実装（ログイン/ログアウト）
  - AWS Amplify Authライブラリを統合する
  - Cognito Hosted UIまたはカスタムログインフォームを実装する
  - JWTトークンをlocalStorageに保存する処理を実装する
  - 認証ガードを実装する（未認証時のログイン画面リダイレクト）
  - トークン期限切れ時の自動ログアウト処理を実装する
  - ログアウト機能を実装する（トークンクリア、Cognito SignOut）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 6.3 記事作成・編集フォームの実装
  - マークダウンエディタコンポーネントを実装する
  - 記事作成フォームを実装する（タイトル、本文、カテゴリ、公開状態）
  - 画像アップロード機能を実装する（Pre-signed URL取得 → S3直接アップロード → URL挿入）
  - フォームバリデーションを実装する（フロントエンド側）
  - 記事作成API呼び出し処理を実装する（Authorizationヘッダーにトークン設定）
  - 記事編集フォームを実装する（既存記事データの取得と表示）
  - 記事更新API呼び出し処理を実装する
  - _Requirements: 1.1, 1.2, 1.7, 4.5_

- [ ] 6.4 記事一覧・削除機能の実装
  - 管理者用記事一覧表示コンポーネントを実装する（下書き含む）
  - 記事一覧API呼び出し処理を実装する
  - 記事削除確認ダイアログを実装する
  - 記事削除API呼び出し処理を実装する
  - 削除後の一覧更新処理を実装する
  - _Requirements: 1.3, 1.4, 1.5, 1.6_

- [ ] 7. 公開ページフロントエンド実装

- [ ] 7.1 静的HTMLとCSSの作成
  - 公開ページ用のHTMLテンプレートを作成する（index.html、post.html）
  - レスポンシブCSSを作成する（モバイル、デスクトップ対応）
  - JavaScriptによるAPI呼び出しモジュールを実装する
  - マークダウンレンダリング用のCSSを作成する（コードブロック、テーブル等）
  - _Requirements: 3.7_

- [ ] 7.2 記事一覧表示の実装
  - 公開記事一覧取得API呼び出し処理を実装する
  - 記事一覧の動的レンダリング処理を実装する
  - ページネーション機能を実装する（次ページ、前ページボタン）
  - カテゴリフィルタUIを実装する
  - _Requirements: 3.1, 3.5, 3.6_

- [ ] 7.3 記事詳細表示の実装
  - 記事詳細取得API呼び出し処理を実装する（URLパラメータから記事ID取得）
  - 記事詳細の動的レンダリング処理を実装する（タイトル、HTML本文、メタデータ）
  - マークダウンから生成されたHTMLの安全な表示処理を実装する
  - 記事が存在しない場合の404エラー表示を実装する
  - _Requirements: 3.2, 3.3, 3.4_

- [ ] 8. CloudFront CDN配信設定

- [ ] 8.1 CloudFrontディストリビューションの設定
  - CloudFrontディストリビューションをCDKで定義する
  - オリジンを設定する（公開ページS3、管理画面S3、API Gateway）
  - HTTPS強制ポリシーを設定する（HTTP → HTTPSリダイレクト）
  - カスタムドメイン設定を構成する（オプション）
  - CloudFrontスタックのCDKユニットテストを作成する（オリジン、HTTPS設定検証）
  - _Requirements: 5.1, 5.4_

- [ ] 8.2 キャッシュポリシーとビヘイビアの設定
  - デフォルトキャッシュビヘイビアを設定する（公開ページ用、TTL 1日）
  - 追加ビヘイビアを設定する（管理画面: キャッシュ無効、API: TTL 5分）
  - 画像キャッシュポリシーを設定する（TTL 7日）
  - CloudFrontスタックのCDKスナップショットテストを作成する
  - _Requirements: 5.4, 5.5_

- [ ] 9. 統合テストとE2Eテスト

- [ ] 9.1 Lambda関数統合テストの実装
  - 記事作成 → 取得 → 更新 → 削除フローの統合テストを作成する
  - マークダウン変換の統合テストを作成する（マークダウン入力 → HTML出力検証）
  - 画像アップロードフローの統合テストを作成する（Pre-signed URL → S3アップロード）
  - カテゴリフィルタとページネーションの統合テストを作成する
  - エラーケースの統合テストを作成する（認証失敗、バリデーションエラー、404等）
  - _Requirements: All_

- [ ] 9.2 管理者ワークフローE2Eテストの実装
  - ログインフローのE2Eテストを作成する（認証 → 管理画面アクセス）
  - 記事作成フローのE2Eテストを作成する（フォーム入力 → 保存 → 確認）
  - 画像アップロードフローのE2Eテストを作成する（画像選択 → アップロード → 挿入）
  - 記事編集フローのE2Eテストを作成する（既存記事取得 → 編集 → 更新）
  - 記事削除フローのE2Eテストを作成する（削除確認 → 削除実行 → 一覧更新）
  - _Requirements: 1.1-1.7, 2.1-2.6_

- [ ] 9.3 一般ユーザーワークフローE2Eテストの実装
  - トップページアクセスのE2Eテストを作成する（記事一覧表示検証）
  - 記事詳細表示のE2Eテストを作成する（タイトルクリック → 詳細表示）
  - カテゴリフィルタのE2Eテストを作成する（カテゴリ選択 → 絞り込み表示）
  - ページネーションのE2Eテストを作成する（次ページ遷移検証）
  - 下書き記事の非表示検証のE2Eテストを作成する（公開記事のみ表示）
  - _Requirements: 3.1-3.7_

- [ ] 10. CDK Nagセキュリティ検証と最適化

- [ ] 10.1 CDK Nagルールの適用と修正
  - すべてのCDKスタックにAwsSolutionsChecksを適用する
  - IAM4ルール違反を修正する（AWS管理ポリシー → カスタム最小権限ポリシー）
  - IAM5ルール違反を修正する（ワイルドカード権限 → 具体的ARN指定）
  - S1ルール違反を修正する（S3アクセスログ有効化）
  - S2ルール違反を修正する（S3パブリックアクセスブロック確認）
  - S10ルール違反を修正する（S3 SSL/TLS通信強制）
  - APIG1ルール違反を修正する（API Gatewayアクセスログ有効化）
  - APIG2ルール違反を修正する（リクエストバリデーション設定）
  - DDB3ルール違反を修正する（DynamoDBポイントインタイムリカバリ確認）
  - L1ルール違反を修正する（最新Lambdaランタイム確認）
  - 正当な理由があるサプレッションのみ文書化する
  - _Requirements: 2.6, 4.2, 5.6_

- [ ] 10.2 パフォーマンス監視設定の実装
  - CloudWatchアラームを設定する（API Gateway 5xxエラー率 > 5%）
  - CloudWatchアラームを設定する（Lambda実行時間 > 10秒）
  - CloudWatchアラームを設定する（DynamoDBスロットリング発生）
  - CloudWatchダッシュボードを作成する（APIリクエスト数、Lambda実行時間、エラー率）
  - Lambda Powertools Metricsのカスタムメトリクス設定を確認する
  - CloudWatch Logs Insightsクエリを作成する（エラーログ分析用）
  - _Requirements: 5.6, 6.5, 6.6_

- [ ] 11. CI/CDパイプラインの構築とデプロイ自動化

- [ ] 11.1 AWS OIDC連携とIAMロールの設定
  - 開発環境AWSアカウントにGitHub OIDC IDプロバイダーを作成する
  - 本番環境AWSアカウントにGitHub OIDC IDプロバイダーを作成する
  - 開発環境用IAMロールを作成する（develop ブランチからのみAssumeRole可能な信頼ポリシー設定）
  - 本番環境用IAMロールを作成する（master ブランチからのみAssumeRole可能な信頼ポリシー設定）
  - IAMロールに最小権限ポリシーを付与する（CDKデプロイに必要な権限のみ）
  - GitHub Secrets/Variablesを設定する（AWS_ROLE_ARN_DEV、AWS_ROLE_ARN_PRD、AWS_REGION）
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 11.2 テストワークフローの実装
  - test.ymlワークフローファイルを作成する（.github/workflows/）
  - PRトリガー設定を実装する（develop、masterブランチへのPR時）
  - Node.js環境セットアップステップを実装する（Node.js 22.x、npmキャッシュ設定）
  - Lambda関数ユニットテスト実行ステップを実装する
  - CDKインフラテスト実行ステップを実装する
  - カバレッジレポート生成ステップを実装する（オプション）
  - ワークフローをローカルでテストする（act等を使用）
  - _Requirements: 6.1, 6.5, 6.6_

- [ ] 11.3 開発環境デプロイワークフローの実装
  - deploy-dev.ymlワークフローファイルを作成する
  - developブランチへのプッシュトリガーを設定する
  - OIDC認証ステップを実装する（aws-actions/configure-aws-credentials使用）
  - AWS認証確認ステップを実装する（aws sts get-caller-identity）
  - CDK Synthステップを実装する（CDK Nag警告表示）
  - CDKデプロイステップを実装する（--context env=dev、--require-approval never）
  - E2Eテスト実行ステップを実装する（デプロイ後検証）
  - エラー通知設定を実装する（オプション: Slack、メール）
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 11.4 本番環境デプロイワークフローの実装
  - deploy-prd.ymlワークフローファイルを作成する
  - masterブランチへのプッシュトリガーを設定する
  - GitHub Environment Protection Rulesを設定する（production環境、手動承認必須）
  - すべてのテスト実行ステップを実装する（Lambda、CDK、CDK Nag厳格モード）
  - 手動承認待機ステップを実装する（environment: production設定）
  - OIDC認証ステップを実装する（本番環境IAMロール使用）
  - CDKデプロイステップを実装する（--context env=prd、--context enableCdkNag=true）
  - スモークテスト実行ステップを実装する（基本動作確認）
  - デプロイ完了通知を実装する
  - _Requirements: 6.1, 6.2, 6.4_

- [ ] 11.5 CDK Nag検証ワークフローの実装
  - cdk-nag-check.ymlワークフローファイルを作成する
  - PRトリガー設定を実装する（develop、masterブランチへのPR時）
  - CDK Synth厳格モードステップを実装する（--strict）
  - CDK Nag警告のPRコメント投稿機能を実装する（オプション）
  - ワークフローテストを実行する
  - _Requirements: 6.1, 6.5_

- [ ] 11.6 Branch Protection Rulesの設定
  - developブランチのBranch Protection Ruleを設定する
  - masterブランチのBranch Protection Ruleを設定する
  - 必須ステータスチェックを設定する（testワークフローを必須化）
  - PR必須設定を有効化する（直接プッシュ禁止）
  - 承認レビュー必須を設定する（develop: 1人、master: 2人推奨）
  - 最新状態での実行必須を設定する（Require branches to be up to date）
  - CODEOWNERS設定を実装する（オプション: infrastructure/、.github/workflows/等）
  - 設定動作確認を実施する（テストPR作成とマージ試行）
  - _Requirements: 6.1, 6.2, 6.4_

- [ ] 11.7 環境別設定とコンテキスト管理の実装
  - CDKコンテキストで環境切り替えロジックを実装する（env: dev/prd）
  - 環境別設定を実装する（DynamoDB削除保護、CloudWatchログ保持期間）
  - 環境別リソース命名規則を実装する（{resource}-{env}形式）
  - CDK Nag環境別適用ロジックを実装する（dev: 警告のみ、prd: 必須）
  - 環境変数による設定オーバーライド機能を実装する
  - 環境別デプロイのテストを実施する（dev、prd両環境）
  - _Requirements: 6.1, 6.3, 6.4_

---

## 実装完了基準

すべてのタスクが完了し、以下の条件を満たすこと:
- ✅ すべてのCDKユニットテストとスナップショットテストが成功する
- ✅ すべてのLambda関数ユニットテストが成功する
- ✅ すべての統合テストが成功する
- ✅ すべてのE2Eテストが成功する
- ✅ CDK Nag検証がエラーなしで完了する（正当なサプレッションのみ）
- ✅ `cdk deploy --all` が成功し、すべてのAWSリソースがプロビジョニングされる
- ✅ 管理者が記事を作成・編集・削除できる
- ✅ 一般ユーザーが公開記事を閲覧できる
- ✅ パフォーマンス要件（2秒以内のページ表示）を満たす

## 次のステップ

タスクが承認されたら、以下のコマンドで実装を開始してください:

```bash
# すべての保留中タスクを実行
/kiro:spec-impl serverless-blog-aws

# 特定のタスクを実行
/kiro:spec-impl serverless-blog-aws 1.1

# 複数のタスクを実行
/kiro:spec-impl serverless-blog-aws 1,2,3
```
