# Requirements Document

## Introduction
管理画面の画像アップロード機能を3つの観点から改善する。S3 URLの隠蔽化（CloudFront URL化）、アップロード画像のプレビュー機能強化、および画像削除機能の追加を実装する。これにより、セキュリティ向上、ユーザー体験改善、画像管理の柔軟性向上を実現する。

## Requirements

### Requirement 1: S3 URL隠蔽化（CloudFront URL化）
**Objective:** As a ブログ運営者, I want 画像URLがS3ではなくCloudFront経由で表示される, so that S3バケット名やAWSリソース構成が外部に露出しない

#### Acceptance Criteria
1. When the getUploadUrl Lambda関数がリクエストを受信する, the Lambda shall CloudFrontドメイン形式のimageUrlを返却する
2. The imageUrl shall `https://{cloudfront-domain}/images/{userId}/{uuid}.{ext}` の形式に従う
3. When Lambda関数がデプロイされる, the CDK shall CLOUDFRONT_DOMAIN環境変数をuploadUrlFunctionに設定する
4. If CLOUDFRONT_DOMAIN環境変数が設定されていない場合, the Lambda shall 500エラーを返却する
5. The CloudFront distribution shall S3バケットへの直接アクセスをブロックする（OAC経由のみ許可）

### Requirement 2: 画像プレビュー機能
**Objective:** As a ブログ管理者, I want アップロードした画像をMarkdownエディタ内でプレビュー確認できる, so that 記事公開前に画像の表示を確認できる

#### Acceptance Criteria
1. When 画像がアップロードされる, the Markdownエディタ shall プレビューペインで画像を表示する
2. When Markdownコンテンツに画像タグが含まれる, the プレビューペイン shall CloudFront URLから画像をレンダリングする
3. The ImageUploaderコンポーネント shall アップロード前にローカルプレビューを表示する（既存機能の維持）
4. While 画像アップロード中, the エディタ shall ローディング状態を表示する
5. When アップロードが完了する, the エディタ shall Markdown形式の画像タグをカーソル位置に挿入する

### Requirement 3: 画像削除機能
**Objective:** As a ブログ管理者, I want 不要になった画像をS3から削除できる, so that ストレージコストを削減し、画像を整理できる

#### Acceptance Criteria
1. When ユーザーが画像削除をリクエストする, the delete image API shall 画像が要求ユーザーに属することを検証する
2. When 認可が成功する, the delete image Lambda shall S3から画像を削除する
3. If 画像キーがユーザーIDプレフィックスで始まらない場合, the API shall 403 Forbiddenを返却する
4. When 削除が成功する, the API shall 204 No Contentを返却する
5. The 管理画面UI shall アップロード済み画像に削除ボタンを提供する
6. When 削除ボタンがクリックされる, the UI shall 確認ダイアログを表示する
7. If 削除が失敗する, the UI shall エラーメッセージを表示する

### Requirement 4: APIエンドポイント設計
**Objective:** As a 開発者, I want 画像削除用のRESTful APIエンドポイントが存在する, so that フロントエンドから画像を削除できる

#### Acceptance Criteria
1. The API Gateway shall `DELETE /admin/images/{key}` エンドポイントを公開する
2. The エンドポイント shall Cognito認証を要求する（認証必須）
3. When 未認証リクエストを受信する, the API shall 401 Unauthorizedを返却する
4. The delete image Lambda shall S3のDeleteObjectCommandを使用して画像を削除する
5. The Lambda shall DynamoDBへのアクセスは不要（画像メタデータは記事のimageUrlsフィールドで管理）

### Requirement 5: インフラストラクチャ更新
**Objective:** As a 開発者, I want CDKスタックがCloudFrontドメインをLambdaに渡す, so that Lambda関数がCloudFront URLを生成できる

#### Acceptance Criteria
1. The LambdaFunctionsStack shall CdnStackからCloudFrontドメイン名を受け取る
2. The uploadUrlFunction shall 環境変数CLOUDFRONT_DOMAINを持つ
3. The deleteImageFunction shall 新規Lambda関数として作成される
4. The deleteImageFunction shall imagesBucketへのDeleteObject権限を持つ
5. When CDKをデプロイする, the スタック shall 循環依存を発生させない

### Requirement 6: テストとカバレッジ
**Objective:** As a 開発者, I want 新機能が100%テストカバレッジを達成する, so that 品質を担保できる

#### Acceptance Criteria
1. The deleteImage Lambda関数 shall ユニットテストで100%カバレッジを達成する
2. The 統合テスト shall DELETE /admin/images/{key} エンドポイントを検証する
3. The フロントエンドテスト shall 画像削除UIコンポーネントをカバーする
4. When テストを実行する, the CI shall 全テストをパスする

