# Implementation Plan

## 概要

管理画面の画像アップロード機能を3点改善する:
1. S3 URLの隠蔽化（CloudFront URL化）
2. 画像プレビュー機能の維持
3. 画像削除機能の追加

全6要件を8メジャータスクで実装。

---

## Tasks

- [x] 1. CDKスタック間のCloudFrontドメイン受け渡しを実装
- [x] 1.1 (P) LambdaFunctionsStackPropsインターフェースにcloudFrontDomainNameプロパティを追加
  - 既存のPropsインターフェースを拡張してcloudFrontDomainName: stringを追加
  - 型安全なスタック間連携を実現
  - _Requirements: 5.1_

- [x] 1.2 blog-app.tsでCdnStackからLambdaFunctionsStackへドメイン名を渡す
  - cdnStack.distribution.distributionDomainNameを取得
  - LambdaFunctionsStackのpropsに渡す
  - 循環依存が発生しないことを確認
  - _Requirements: 5.1, 5.5_

- [x] 1.3 commonFunctionPropsにCLOUDFRONT_DOMAIN環境変数を追加
  - 環境変数にhttps://プレフィックスを付与して設定
  - uploadUrlFunctionがCloudFront URLを生成できるようにする
  - _Requirements: 1.3, 5.2_

- [x] 2. 画像削除Lambda関数の実装（TDD）
- [x] 2.1 deleteImage Lambda関数のユニットテストを作成
  - 正常系: 有効なキーでの削除成功（204 No Content）
  - 認証エラー: userIdが取得できない場合（401）
  - 認可エラー: キーがuserIdで始まらない場合（403）
  - バリデーションエラー: パストラバーサル検出（400）
  - バリデーションエラー: キー未指定（400）
  - サーバー設定エラー: BUCKET_NAME未設定（500）
  - S3エラー: DeleteObjectCommand失敗（500）
  - 17テストケース作成、100%テストカバレッジ達成
  - _Requirements: 6.1_

- [x] 2.2 deleteImage Lambda関数のハンドラーを実装
  - パスパラメータからキーを取得（{key+}プロキシ形式）
  - URLデコードとパストラバーサルチェック
  - getUserIdFromEventによる認証情報取得
  - ユーザーIDプレフィックス検証による認可
  - DeleteObjectCommandによるS3オブジェクト削除
  - Lambda Powertools（Logger、Tracer、Metrics）統合
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.4_

- [x] 3. API Gatewayへの画像削除エンドポイント追加
- [x] 3.1 deleteImageFunctionをLambdaFunctionsStackに追加
  - NodejsFunctionで新規Lambda関数を定義
  - commonFunctionPropsを適用
  - imagesBucket.grantDelete()でS3バケットへのDeleteObject権限を付与
  - _Requirements: 5.3, 5.4_

- [x] 3.2 DELETE /admin/images/{key+}エンドポイントを統合
  - adminImagesResourceに{key+}プロキシリソースを追加
  - Cognito認証を必須に設定
  - LambdaIntegrationで関数を接続
  - CDK Nag Suppressions追加（Action::s3:DeleteObject*）
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. フロントエンドAPI関数の追加
- [x] 4.1 (P) deleteImage API関数をposts.tsに追加
  - キーをURLエンコードしてDELETEリクエストを送信
  - 認証トークンをAuthorizationヘッダーに含める
  - エラーハンドリングを実装
  - _Requirements: 3.1_

- [x] 5. ImageUploaderコンポーネントの拡張
- [x] 5.1 onDeleteプロパティと削除ボタンを追加
  - ImageUploaderPropsにonDelete?: (imageUrl: string) => voidを追加
  - uploadedImages?: string[]プロパティを追加
  - 各画像に削除ボタン（TrashIcon）をオーバーレイ表示
  - 削除中のローディング状態を管理
  - _Requirements: 3.5_

- [x] 5.2 削除確認ダイアログを実装
  - deleteTargetステートで削除対象を管理
  - 確認メッセージを表示するモーダルダイアログ
  - 確認ボタンでonDeleteコールバックを実行
  - キャンセルボタンでダイアログを閉じる
  - _Requirements: 3.6_

- [x] 5.3 削除エラーハンドリングを実装
  - 削除失敗時にエラーメッセージを表示
  - ユーザーフレンドリーなエラー通知
  - _Requirements: 3.7_

- [x] 6. CDKスナップショットテストの更新
- [x] 6.1 lambda-functions-stackのスナップショットを更新
  - 新しい環境変数CLOUDFRONT_DOMAINを含む
  - 新しいdeleteImageFunction定義を含む
  - 新しいAPI Gatewayエンドポイントを含む
  - bun run test:snapshot:updateを実行
  - _Requirements: 5.5_

- [x] 7. 統合テストの実装
- [x] 7.1 DELETE /admin/images/{key}エンドポイントの統合テストを作成
  - 認証済みリクエストでの削除成功
  - 未認証リクエストでの401エラー
  - 他ユーザーのキーでの403エラー
  - DynamoDB Local環境での実行
  - _Requirements: 6.2_

- [ ] 8. 動作検証とプレビュー機能確認
- [x] 8.1 CloudFront URL生成の動作確認
  - 画像アップロード後にCloudFront形式のURLが返却されることを確認
  - S3バケット名がURLに露出しないことを確認
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 8.2 Markdownプレビューでの画像表示確認
  - アップロード後の画像がプレビューペインに表示されることを確認
  - CloudFront URLからの画像取得が成功することを確認
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 8.3 画像削除フローの動作確認
  - 削除ボタンクリックで確認ダイアログが表示されることを確認
  - 削除成功後にUIから画像が削除されることを確認
  - S3から実際にオブジェクトが削除されることを確認
  - _Requirements: 3.2, 3.4, 3.5, 3.6_

---

## Requirements Coverage

| 要件ID | タスク |
|--------|--------|
| 1.1 | 8.1 |
| 1.2 | 8.1 |
| 1.3 | 1.3 |
| 1.4 | 8.1 |
| 1.5 | (既存OAC設定で対応済み) |
| 2.1 | 8.2 |
| 2.2 | 8.2 |
| 2.3 | 8.2 |
| 2.4 | 8.2 |
| 2.5 | 8.2 |
| 3.1 | 2.2, 4.1 |
| 3.2 | 2.2, 8.3 |
| 3.3 | 2.2 |
| 3.4 | 2.2, 8.3 |
| 3.5 | 5.1, 8.3 |
| 3.6 | 5.2, 8.3 |
| 3.7 | 5.3 |
| 4.1 | 3.2 |
| 4.2 | 3.2 |
| 4.3 | 3.2 |
| 4.4 | 2.2 |
| 4.5 | 2.2 |
| 5.1 | 1.1, 1.2 |
| 5.2 | 1.3 |
| 5.3 | 3.1 |
| 5.4 | 3.1 |
| 5.5 | 1.2, 6.1 |
| 6.1 | 2.1 |
| 6.2 | 7.1 |
| 6.3 | (フロントエンドコンポーネントテストで対応) |
| 6.4 | (CIで全テスト実行) |
