# スクリプト一覧

目的別にスクリプトの役割をまとめています。実行方法は `package.json` のscriptsも参照してください。

## テスト・カバレッジ
- `tests/e2e/cleanup-test-data.ts` (`bun run cleanup:test-data`)
  - E2E が作った `[E2E-TEST]` prefix の記事・カテゴリを DEV から手動で削除する CLI。
  - `tests/e2e/utils/awsCleanup.ts` の `cleanupE2ETestData` と `global-teardown.ts` と
    同じ Cognito ログインを再利用する (API 経由なのでサイト再ビルド・S3 画像掃除も動く)。
  - `CLEANUP_TARGET_ENV=dev` が必須で、prd (`boneofmyfallacy.net` / `www.boneofmyfallacy.net`) には実行できない
    (詳細は `tests/e2e/README.md`)。
  - 例: `CLEANUP_TARGET_ENV=dev BASE_URL=https://dev.example.com TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... bun run cleanup:test-data`
  - 削除せず対象を表示するだけなら `-- --dry-run` を付ける。
- `generate-coverage-badges.js`
  - カバレッジバッジを生成。
  - 例: `bun run coverage:badges`

## ローカルデプロイ
- `local-deploy.sh`
  - ローカルからのデプロイ手順を自動化。
  - 例: `bash scripts/local-deploy.sh`

## AI/運用補助
- `sync-ai-docs.ts`
  - MCP設定と非kiroコマンドを同期。AGENTS.md / CLAUDE.mdは共有ルールへの参照を検証するだけで上書きしない。
  - 例: `bun scripts/sync-ai-docs.ts`

- `run-codex.sh`
  - 起動元のディレクトリに関係なく、このGitルートをCodexの作業ディレクトリにする。
  - 例: `bash /path/to/serverlessBlog/scripts/run-codex.sh`
