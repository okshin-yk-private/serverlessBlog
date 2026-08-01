# 調査記録

## 一次情報（信頼性: 高）

- [CloudFront FunctionsでKeyValueStoreを利用する](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/kvs-with-functions.html): KVS関連付け、JavaScript runtime 2.0、読み取り方法の根拠。
- [CloudFront Functions event structure](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html): viewer-requestでrequest URIを変更できる根拠。
- [CloudFrontがリクエストを処理する仕組み](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html): viewer-requestがキャッシュ確認前に実行される処理順の根拠。
- [S3 data consistency model](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel): PUT後のread-after-write強整合性の根拠。
- [CloudFrontでバージョン付きファイル名を使う](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/UpdatingExistingObjects.html#ReplacingObjects): invalidationに代えて別オブジェクト名を使用する設計の根拠。

## 推論として扱う事項

- リリース接頭辞へ書き換えたURIがキャッシュ上も旧リリースと分離される点は、viewer-requestの実行順とバージョン付きオブジェクトのAWS文書を組み合わせた設計上の推論である。Terraform適用後にdev環境で実リクエストを確認する必要がある。
- KVS伝播中に旧・新のどちらか一方が選択されるが、全エッジでの切り替え完了時刻をアプリケーション側から厳密に判定する仕組みは今回含めない。
