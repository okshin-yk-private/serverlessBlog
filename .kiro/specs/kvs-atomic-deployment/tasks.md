# 実装タスク

- [x] 1. KVS atomic deploymentの要件・設計・リスクを記録する
- [x] 2. CloudFront KVSをTerraformで作成し、公開Functionへ関連付ける
- [x] 3. 公開URI正規化とリリースプレフィックス書き換えを実装する
- [x] 4. S3リリース配置・検証・ETag付きKVS更新をデプロイスクリプトへ実装する
- [x] 5. CodeBuildを単調revisionと最小権限のKVS昇格フローへ変更する
- [x] 6. dev/prdへKVS ARNを接続し、30日のリリース保持を設定する
- [x] 7. TypeScript・Terraformの単体テストと静的検証を通す
- [x] 8. リポジトリ全体の `bun run verify` を通す
