# 実装タスク

- [x] 1. サイトビルド状態モデルとDynamoDB transaction helperを実装する
- [x] 2. create/update/deleteを公開影響判定と永続revisionへ接続する
- [x] 3. CodeBuild開始ロック、冪等開始、trailing buildを実装する
- [x] 4. EventBridge完了通知、DLQ、Scheduler照合をTerraformへ追加する
- [x] 5. 状態APIをtarget revision相関へ変更する
- [x] 6. saveMode契約とカテゴリ未設定autosaveを実装する
- [x] 7. 明示保存後の一覧遷移と一覧ビルド状態表示を実装する
- [x] 8. Go、Vitest、Terraform、E2Eの回帰テストを追加する
- [x] 9. dev/prd Terraform validateと `bun run verify` を通す
