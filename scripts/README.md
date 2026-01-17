# スクリプト一覧

目的別にスクリプトの役割をまとめています。実行方法は `package.json` のscriptsも参照してください。

## テスト・カバレッジ
- `cleanup-test-data.js`
  - AWS統合テスト/E2E後のテストデータ削除用。
  - 例: `bun run cleanup:test-data`
- `generate-coverage-badges.js`
  - カバレッジバッジを生成。
  - 例: `bun run coverage:badges`

## ローカルデプロイ
- `local-deploy.sh`
  - ローカルからのデプロイ手順を自動化。
  - 例: `bash scripts/local-deploy.sh`

## AI/運用補助
- `sync-ai-docs.ts`
  - AI向けドキュメントの同期・更新に利用。
  - 例: `bun scripts/sync-ai-docs.ts`
