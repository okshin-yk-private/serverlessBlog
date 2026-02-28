# 要件定義書

## はじめに

本仕様書は、現行のデュアル言語実装（Node.jsおよびRust）から統一されたGolangコードベースへのLambda関数移行要件を定義します。移行はStrangler Figパターンに従い、API互換性を維持しながらダウンタイムゼロの移行を実現します。

**現状:**
- Node.js Lambda関数: 11関数（Posts: 6、Auth: 3、Images: 2）
- Rust Lambda関数: 11関数（同一ドメイン）
- 課題: 二重メンテナンス、ビルドの複雑さ、スキルの分散

**目標状態:**
- 統一されたGolang実装: 11関数
- すべてのLambda関数を単一言語で実装
- コールドスタート性能の向上（<50ms）
- CI/CDパイプラインの高速化（<5分）

---

## 要件

### 要件1: Goプロジェクト基盤

**目的:** 開発者として、適切に構造化されたGoプロジェクト基盤が欲しい。これにより、すべてのLambda関数を一貫してビルドおよびデプロイできる。

#### 受け入れ基準

1. Goプロジェクトは `go-functions/go.mod` に `serverless-blog/go-functions` というモジュール名とGo version >= 1.21の `go.mod` ファイルを持つこと。
2. Goプロジェクトは `cmd/` ディレクトリ構造を使用し、各Lambda関数が独自の `main.go` エントリーポイントを持つこと（例: `cmd/posts/create/main.go`）。
3. Goプロジェクトは外部パッケージからインポートできない共有コード用の `internal/` ディレクトリを使用すること。
4. Makefileは `CGO_ENABLED=0`、`GOOS=linux`、`GOARCH=arm64` で静的バイナリとしてすべてのLambda関数をビルドすること。
5. When `make build` が実行されたとき、ビルドシステムは `bin/{function-name}/` ディレクトリに `bootstrap` という名前の実行可能バイナリを生成すること。
6. Goプロジェクトはリンター設定用の `.golangci.yml` 設定ファイルを含むこと。

---

### 要件2: 共通ライブラリ（internal/）

**目的:** 開発者として、再利用可能な共有ライブラリが欲しい。これにより、Lambda関数間で共通機能が重複しない。

#### 受け入れ基準

1. 共通ライブラリは、既存のTypeScript/Rust型（Post、Author、Categoryなど）と同等のGo構造体定義を持つ `types` パッケージを提供すること。
2. 共通ライブラリは、バリデーションエラー、NotFoundエラー、認可エラー用のカスタムエラー型を持つ `errors` パッケージを提供すること。
3. 共通ライブラリは、適切な設定でAWS SDK v2クライアント（DynamoDB、S3、Cognito）を初期化する `clients` パッケージを提供すること。
4. 共通ライブラリは、goldmarkを使用してMarkdownをHTMLに変換し、bluemondayを使用してXSS対策のために出力をサニタイズする `markdown` パッケージを提供すること。
5. When AWSクライアントがリクエストされたとき、Clientsパッケージは繰り返しの初期化を避けるためにシングルトンインスタンスを返すこと。
6. 共通ライブラリは、CloudWatch Logs Insightsと互換性のある構造化ログ用ミドルウェアを提供すること。
7. 共通ライブラリは、AWS X-Rayトレーシング統合用ミドルウェアを提供すること。
8. 共通ライブラリは、CloudWatch Embedded Metrics Format（EMF）出力用ミドルウェアを提供すること。

---

### 要件3: Postsドメイン Lambda関数

**目的:** ブログプラットフォーム運営者として、Golangベースの記事管理機能が欲しい。これにより、パフォーマンスが向上した状態でブログ記事を管理できる。

#### 受け入れ基準

**3.1 記事作成 (POST /posts)**
1. When 認証付きの有効な記事作成リクエストを受信したとき、CreatePost Lambdaは生成されたUUIDで新しい記事をDynamoDBに作成すること。
2. When リクエストに `contentMarkdown` が含まれているとき、CreatePost Lambdaはmarkdownパッケージを使用して `contentHtml` に変換すること。
3. If リクエストに必須フィールド（title、contentMarkdown）が欠けている場合、CreatePost Lambdaはバリデーションエラー詳細と共にHTTP 400を返すこと。
4. If リクエストに有効な認証がない場合、CreatePost LambdaはHTTP 401を返すこと。

**3.2 記事取得 (GET /posts/:id - 認証必須)**
1. When 認証付きの有効な記事取得リクエストと有効な記事IDを受信したとき、GetPost LambdaはDynamoDBから記事を返すこと。
2. If 記事IDがDynamoDBに存在しない場合、GetPost LambdaはHTTP 404を返すこと。
3. If リクエストに有効な認証がない場合、GetPost LambdaはHTTP 401を返すこと。

**3.3 公開記事取得 (GET /posts/:id - 公開)**
1. When 有効な記事IDで公開記事取得リクエストを受信したとき、GetPublicPost Lambdaは `publishStatus` が "published" の場合に記事を返すこと。
2. If 記事が公開されていないか存在しない場合、GetPublicPost LambdaはHTTP 404を返すこと。

**3.4 記事一覧取得 (GET /posts)**
1. When 記事一覧リクエストを受信したとき、ListPosts Lambdaは `createdAt` 降順でソートされたページネーション結果を返すこと。
2. When `category` クエリパラメータが提供されたとき、ListPosts LambdaはCategoryIndex GSIを使用して結果をフィルタすること。
3. When `limit` クエリパラメータが提供されたとき、ListPosts Lambdaは指定された件数に結果を制限すること（デフォルト: 10、最大: 100）。
4. When `nextToken` クエリパラメータが提供されたとき、ListPosts Lambdaは指定されたカーソルからページネーションを継続すること。

**3.5 記事更新 (PUT /posts/:id)**
1. When 認証付きの有効な記事更新リクエストを受信したとき、UpdatePost LambdaはDynamoDBで指定されたフィールドを更新すること。
2. When `contentMarkdown` が更新されたとき、UpdatePost Lambdaは `contentHtml` を再生成すること。
3. When `publishStatus` が "draft" から "published" に変更されたとき、UpdatePost Lambdaは `publishedAt` タイムスタンプを設定すること。
4. If 記事IDが存在しない場合、UpdatePost LambdaはHTTP 404を返すこと。
5. If リクエストに有効な認証がない場合、UpdatePost LambdaはHTTP 401を返すこと。

**3.6 記事削除 (DELETE /posts/:id)**
1. When 認証付きの有効な記事削除リクエストを受信したとき、DeletePost LambdaはDynamoDBから記事を削除すること。
2. When 記事に関連画像がある場合、DeletePost LambdaはS3から画像を削除すること。
3. If 記事IDが存在しない場合、DeletePost LambdaはHTTP 404を返すこと。
4. If リクエストに有効な認証がない場合、DeletePost LambdaはHTTP 401を返すこと。
5. When 削除が成功したとき、DeletePost LambdaはHTTP 204 No Contentを返すこと。

---

### 要件4: Authドメイン Lambda関数

**目的:** ユーザーとして、Golangでの認証機能が欲しい。これにより、管理パネルに安全にアクセスできる。

#### 受け入れ基準

**4.1 ログイン (POST /auth/login)**
1. When 有効な認証情報（email、password）を受信したとき、Login LambdaはCognitoで認証し、JWTトークン（accessToken、refreshToken、idToken）を返すこと。
2. When 認証が成功したとき、Login Lambdaはレスポンスに `expiresIn` を含めること。
3. If 認証情報が無効な場合、Login LambdaはHTTP 401を返すこと。
4. If ユーザーが確認されていない場合、Login Lambdaは適切なエラーメッセージと共にHTTP 401を返すこと。
5. If 必須フィールド（email、password）が欠けている場合、Login LambdaはHTTP 400を返すこと。

**4.2 ログアウト (POST /auth/logout)**
1. When 有効なアクセストークンが提供されたとき、Logout LambdaはCognito GlobalSignOutを実行すること。
2. When ログアウトが成功したとき、Logout LambdaはHTTP 200を返すこと。
3. If アクセストークンが無効または期限切れの場合、Logout LambdaはHTTP 401を返すこと。

**4.3 トークン更新 (POST /auth/refresh)**
1. When 有効なリフレッシュトークンが提供されたとき、Refresh LambdaはCognitoから新しいアクセストークンとIDトークンを取得すること。
2. When トークン更新が成功したとき、Refresh Lambdaは `expiresIn` と共に新しいトークンを返すこと。
3. If リフレッシュトークンが無効または期限切れの場合、Refresh LambdaはHTTP 401を返すこと。

---

### 要件5: Imagesドメイン Lambda関数

**目的:** コンテンツクリエイターとして、Golangベースの画像管理が欲しい。これにより、効率的に画像をアップロードおよび管理できる。

#### 受け入れ基準

**5.1 アップロードURL取得 (POST /images/upload-url)**
1. When fileNameとcontentTypeを含む有効なリクエストを認証付きで受信したとき、GetUploadUrl Lambdaは15分間有効なプリサインドS3 URLを生成すること。
2. GetUploadUrl Lambdaは `images/{userId}/{timestamp}_{sanitizedFileName}` 形式でS3キーを生成すること。
3. If ファイル拡張子が許可されていない（.jpg、.jpeg、.png、.gif、.webp）場合、GetUploadUrl LambdaはHTTP 400を返すこと。
4. If コンテンツタイプが許可されていない（image/jpeg、image/png、image/gif、image/webp）場合、GetUploadUrl LambdaはHTTP 400を返すこと。
5. If リクエストに有効な認証がない場合、GetUploadUrl LambdaはHTTP 401を返すこと。

**5.2 画像削除 (DELETE /images/{key+})**
1. When 認証付きの有効な削除リクエストを受信したとき、DeleteImage LambdaはS3から画像を削除すること。
2. DeleteImage Lambdaはリクエストユーザーが画像を所有していることを確認すること（パスプレフィックスに基づく）。
3. If ユーザーが画像を所有していない場合、DeleteImage LambdaはHTTP 403を返すこと。
4. If リクエストに有効な認証がない場合、DeleteImage LambdaはHTTP 401を返すこと。
5. When 削除が成功したとき、DeleteImage LambdaはHTTP 204を返すこと。

---

### 要件6: CI/CD統合

**目的:** DevOpsエンジニアとして、Golang関数用の自動化されたCI/CDが欲しい。これにより、コード品質とデプロイが自動化される。

#### 受け入れ基準

1. CIワークフローは、PRに `go` ラベルが付いている場合、すべてのGoコードに対してgolangci-lintを実行する `go-lint` ジョブを含むこと。
2. CIワークフローは、PRに `go` ラベルが付いている場合、`go test -race -coverprofile=coverage.out ./...` を実行する `go-tests` ジョブを含むこと。
3. CIワークフローは、Lambda関数パッケージのGoテストカバレッジが100%を下回った場合に失敗すること。
4. ラベラー設定は、`go-functions/**/*` 内のファイルを変更するPRに `go` ラベルを追加すること。
5. デプロイワークフローは、CDKデプロイ前に `make build` を使用してGo Lambda関数をビルドすること。
6. When Goリントまたはテストが失敗したとき、CIワークフローはPRマージをブロックすること。

---

### 要件7: APIパリティとテスト

**目的:** QAエンジニアとして、検証されたAPI互換性が欲しい。これにより、移行が既存のクライアントを破壊しない。

#### 受け入れ基準

1. 各Go Lambda関数は、100%カバレッジですべてのコードパスをカバーするユニットテストを持つこと。
2. Goテストスイートは、既存のNode.js/Rust実装とレスポンス形式が一致することを検証するAPIパリティテストを含むこと。
3. When パリティテストを実行するとき、テストスイートはHTTPステータスコード、レスポンスボディ構造、およびエラーメッセージ形式を比較すること。
4. Goテストスイートは、包括的な入力バリデーションシナリオのためにテーブル駆動テストを使用すること。
5. If APIレスポンスが既存の実装と異なる場合、パリティテストは詳細な差分出力と共に失敗すること。

---

### 要件8: オブザーバビリティ

**目的:** 運用エンジニアとして、包括的なオブザーバビリティが欲しい。これにより、Lambda関数を効果的に監視およびデバッグできる。

#### 受け入れ基準

1. 各Go Lambda関数は、CloudWatch Logs Insightsと互換性のある構造化JSONログを出力すること。
2. 各Go Lambda関数は、AWS SDK呼び出しと外部依存関係のX-Rayトレーシングを含むこと。
3. 各Go Lambda関数は、リクエスト数、レイテンシ、エラー率のためにCloudWatch EMFを使用してカスタムメトリクスを出力すること。
4. When エラーが発生したとき、Lambda関数はスタックトレースとリクエストコンテキストと共にエラーをログに記録すること。
5. ロギングミドルウェアは、すべてのログエントリに相関ID（リクエストID、トレースID）を含むこと。

---

### 要件9: CDKインフラストラクチャ更新

**目的:** インフラストラクチャエンジニアとして、Go Lambda関数のCDKサポートが欲しい。これにより、既存のインフラストラクチャと並行してデプロイできる。

#### 受け入れ基準

1. Lambda Functions Stackは、`provided.al2023` ランタイムでGo Lambda関数のデプロイをサポートすること。
2. Lambda Functions Stackは、Go関数をARM64アーキテクチャで設定すること。
3. CDK設定は、関数ごとにNode.js/RustとGoの実装を切り替えるためのフィーチャーフラグを許可すること。
4. When Go関数をデプロイするとき、CDK Stackは適切なメモリ（128-512MB）とタイムアウト（30秒）設定を構成すること。
5. CDK Stackは、必要な環境変数（TABLE_NAME、BUCKET_NAME、USER_POOL_IDなど）をGo関数に渡すこと。

---

### 要件10: クリーンアップと非推奨化

**目的:** メンテナーとして、非推奨の実装を削除したい。これにより、コードベースが保守可能な状態を維持できる。

#### 受け入れ基準

1. When すべてのGo Lambda関数が本番環境でパリティテストに合格したとき、非推奨化プロセスは `functions/`（Node.js）ディレクトリの削除を許可すること。
2. When すべてのGo Lambda関数が本番環境でパリティテストに合格したとき、非推奨化プロセスは `rust-functions/` ディレクトリの削除を許可すること。
3. When 旧実装が削除されたとき、CIワークフローはNode.jsおよびRust固有のジョブ（rust-lint、rust-tests、backend-unit-tests）を削除すること。
4. When 旧実装が削除されたとき、CDK StackはGo Lambda関数のみをデプロイするように更新されること。
5. 非推奨化には、新しいGolangのみのアーキテクチャを反映したドキュメントの更新を含むこと。

---

## パフォーマンス要件

### 要件11: パフォーマンス目標

**目的:** プラットフォーム運営者として、Go Lambda関数がパフォーマンス目標を満たすことを望む。これにより、ユーザー体験が向上する。

#### 受け入れ基準

1. 各Go Lambda関数は50ms未満（P95）のコールドスタート時間を達成すること。
2. 各Go Lambda関数は20MB未満（非圧縮）のバイナリサイズを持つこと。
3. Go Lambda関数は読み取り操作（listPosts、getPost、getPublicPost）で128MB未満のメモリを使用すること。
4. Goテストを含む完全なCIパイプラインは5分未満で完了すること。

---

## 非機能要件

### 要件12: セキュリティ

**目的:** セキュリティエンジニアとして、安全なLambda実装が欲しい。これにより、プラットフォームが一般的な脆弱性から保護される。

#### 受け入れ基準

1. Go Lambda関数は、すべてのユーザー入力をバリデートおよびサニタイズすること。
2. Go Lambda関数は、インジェクション攻撃を防ぐためにDynamoDB操作でパラメータ化されたクエリを使用すること。
3. Markdownプロセッサは、XSS攻撃を防ぐためにHTML出力をサニタイズすること。
4. If 画像削除リクエストでパストラバーサルが検出された場合、DeleteImage LambdaはHTTP 400を返すこと。
5. Go Lambda関数は、機密データ（パスワード、トークン、PII）をログに記録しないこと。
