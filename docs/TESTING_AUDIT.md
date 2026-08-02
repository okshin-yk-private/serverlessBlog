# テスト体制監査レポート

実施日: 2026-08-02

ローカルフック(`.husky/`)と GitHub Actions CI で実行されるテスト項目について、
過不足と実行時間を監査した記録。数値はすべて実測値に基づく。

## 結論

**実行時間は問題ではなかった。** CI の実測 wall clock は直近 30 ラン中 2.4〜4.3 分で、
クリティカルパスは `terraform-fmt → validate → plan` の約 2.6 分。すでに十分速い。

**問題はテストが書かれているのに実行されていないことだった。** テストコードは存在し
CI も緑になるが、実際には検証していない箇所が多数あった。

| 項目 | 存在 | 監査前に実行 | 監査後 |
| --- | --- | --- | --- |
| Terraform `run` ブロック | 232 | **22** (9.5%) | 232 (100%) |
| `scripts/deploy` テスト | 65 | **0** | 65 |
| `tests/config` テスト | 7 | **0** | 7 |
| admin E2E spec | 16 | 4 (PR) | 6 (PR) / 16 (nightly + post-deploy) |
| `go-functions/tests/benchmark` | 10 | **0** | nightly |

---

## 1. Terraform テストが 9.5% しか動いていなかった

### 原因

`terraform test` は**カレントモジュールの `tests/` しか探索せず、子モジュールに再帰しない**。
CI は `working-directory: terraform` で実行していたため、`terraform/tests/` の 22 ブロック
しか動いていなかった。以下は一度も実行されていなかった:

- `terraform/modules/*/tests/` — 191 ブロック
- `terraform/bootstrap/tests/` — 7 ブロック
- `terraform/environments/*/tests/` — 12 ブロック

さらに直前の `find . -name "*.tftest.hcl" | head -1` というガードが「テストは見つかって
いる」ように見せており、気づきにくい状態だった。

### 発見: 未実行のテストは腐っていた

有効化して全 12 ディレクトリを実行したところ、5 ターゲットが失敗した。いずれも
**テストが実行されないまま実装が変わり、テスト側が取り残されていた**もの:

| ターゲット | 症状 |
| --- | --- |
| `modules/database` | モジュールに必須変数 `categories_table_name` が追加されたがテストに未反映。加えて AWS provider 6.x で GSI が `hash_key`/`range_key` から `key_schema` ブロックに移行 |
| `modules/monitoring` | 唯一 `mock_provider` が無く実 AWS に接続して失敗。さらに Lambda 毎アラーム `lambda_errors`(for_each) が集約アラーム `lambda_errors_all`(count) に置き換わっていた |
| `modules/auth` | 4 件のアサーション不一致。`user_pool_client.name` は CDK インポート互換のため固定値だった等 |
| `environments/dev` `prd` | `import` ブロックがモックプロバイダと非互換。`aws.us_east_1` エイリアスと `cloudflare` プロバイダも未モック |

### 対応

- `scripts/ci/terraform-test-targets.sh` を新設し、`tests/*.tftest.hcl` を持つ
  ディレクトリを動的に列挙(現在 12)。`--changed <BASE_REF>` で変更差分に絞り込み、
  `--json` で GitHub Actions のマトリクス用配列を出力する。
- CI の `terraform-test` をマトリクス化。PR では変更差分のみ、nightly で全量実行。
- 失敗していた 5 ターゲットのテストを修正。**モジュール本体は変更していない**
  (出荷されているのはモジュール側であり、実行されていなかったテスト側が
  ドリフトしていると判断したため)。

修正後、全 12 ターゲット 232 ブロックが通ることを実測で確認済み。

### 既知の制約

`environments/dev` のテストは `enable_custom_domain = false` を明示している。
`true`(dev の `terraform.tfvars` の実値)にすると `modules/dns-route53` の
`aws_route53_record.acm_validation` が ACM 証明書の `domain_validation_options`
を `for_each` のキーに使うが、これは apply 後にしか確定せずモックプロバイダでは
plan 時に解決できない。このテストの検証対象(environment / project_name /
aws_region / alarm_email)とは無関係なため意図的に切り離している。
カスタムドメイン経路の検証は別途必要。

---

## 2. どこからも実行されていなかったテスト

### `scripts/deploy` (65 ケース)

CloudFront KVS のアトミック昇格(リリースポインタ切り替え)を担保するテストが、
CI・`bun run verify`・husky フックのいずれからも実行されていなかった。
本番デプロイの中核ロジックが無検証だった。

対応: `test:unit:deploy` を追加して `test:unit` チェーンに接続(= `verify` にも入る)。
`deploy-scripts` ラベルと CI ジョブ、pre-commit/pre-push の検出も追加。

### `tests/config/playwright-aws-config.test.ts` (7 ケース)

ルートに vitest 設定がなく、実行するスクリプトも存在しない孤立状態だった。
なおこのファイルは vitest ではなく `bun:test` を import しているため、
`bun test tests/config/` で実行する。`test:unit:config` として接続した。

### `go-functions/tests/benchmark`

CI の Go ジョブ双方から `grep -v '/tests/benchmark$'` で明示的に除外されていた。
nightly で実行するようにしたが、このテスト群は `go-functions/bin/` が無いと
`t.Skip()` するため、nightly では `make build` 後に実行している。

---

## 3. 壊れていたゲート

| 箇所 | 内容 |
| --- | --- |
| `coverage-check` | 「Verify 100% Coverage Requirement」ステップはレポートファイルの存在を echo するだけで何も強制していなかった。末尾で「`jest.config.cjs` の coverageThreshold で 100% を強制」と述べていたが、このリポジトリに jest は存在しない。実際の強制は `go-tests-coverage`(90%) と admin vitest(80%) が個別に行っている |
| `ci-success` | 判定が `== "failure"` のみで **cancelled を取りこぼす**。また `needs` に含む `terraform-merge-artifacts` / `terraform-security-scan` を検証していなかった。merge が失敗すると両 plan ジョブが `skipped` になり、`skipped ≠ failure` のため CI が緑になりえた |
| ラベル判定 | `grep -q "frontend"` の部分一致で、`frontend-*` のような別ラベルでもゲートが開く余地があった。カンマ区切り完全一致に修正 |
| bun キャッシュ | キーが存在しない `bun.lockb` を参照しており `hashFiles` が空文字を返すため、**全 18 箇所で `bun-deps-Linux-` に潰れていた**。依存変更で無効化されず、4 プロジェクトが互いの `node_modules` を復元しうる状態だった |
| `deploy.yml` | `concurrency` が無く、`develop` への連続 push で `terraform apply -auto-approve` が同一 state に並走しうる。apply には `-lock-timeout` も無いため後発は即失敗する |
| Lambda キャッシュ | `deploy.yml` は `lambda-all-*` を restore するが save していない。唯一の書き手は ci.yml の PR 実行で、PR ref にスコープされるため push 実行からは読めず、毎回 18 本を再ビルドしていた |
| pre-commit(terraform) | `pre-commit run` をリポジトリルート外から、パスのプレフィックスを剥がして実行していたため `.pre-commit-config.yaml` の `files: ^terraform/` にマッチせず、**`terraform_validate` / `terraform_docs` / `trivy` が黙ってスキップ**されていた |
| pre-commit(gitleaks) | 上記の副作用で、gitleaks が terraform 変更時にしか動いていなかった。全コミットで実行するよう変更 |
| カバレッジ判定 | `echo "$COV < 90" \| bc -l` が `bc` 不在時にエラーとなるが `FAILED` が立たず、**しきい値チェックが素通り**していた。`awk` に置換 |

---

## 4. admin E2E — ドキュメントと実態の乖離

コミット `deee4d8` は admin E2E 16 本のうち 12 本を MSW 環境の flakiness
(Tiptap エディタ初期化のレース)を理由に PR CI から除外し、
「post-deploy AWS E2E ジョブ (deploy.yml) で全件実行する運用とする」と記していた。

**これは成立していなかった。**

- `deploy.yml` は `bun run test:e2e:aws -- --project=chromium` を実行
- `package.json` の `test:e2e:aws` は定義時点で `--project=chromium` 固定
- `playwright.aws.config.ts` の `chromium` プロジェクトは
  `testMatch: ['**/home.spec.ts', '**/article.spec.ts']` のみ
- 全 16 admin spec を含む `admin-chromium` プロジェクトを起動する
  `test:e2e:aws:admin` は **どのワークフローからも呼ばれていなかった**

結果として、Tiptap エディタ・画像アップロード・autosave・unsaved-guard・
publish-flow・slug-conflict・preview-parity・metadata-sidebar の E2E は
自動実行がゼロだった。

対応:
- `post-deploy-e2e-dev` に `test:e2e:aws:admin` の実行を追加(実 AWS 環境なので
  MSW 起因のレースを受けにくい)。実績がないため当面 `continue-on-error: true`
  としつつ、Step Summary とレポート artifact で結果を必ず可視化する。
- PR CI は `--workers=1`(config の `workers: 4` を打ち消していた)を削除し、
  比較的安定している `admin-slug-conflict` / `admin-metadata-sidebar` を追加して 6 本に。
- nightly で MSW 環境の全 16 spec を実行し、flakiness を継続観測する。

---

## 5. 重複・無駄の削減

- **Astro ビルドが PR ごとに 2 回**走っていた(`frontend-astro-tests` と
  `e2e-public-tests`)。1 回目の `dist/` を artifact 化して受け渡すよう変更。
- **Lambda 18 並列ビルドが Go のみの PR でも実行**されていた。成果物を消費する
  plan ジョブは `has-terraform` 必須だが、labeler は `go-functions/**` に
  `terraform` ラベルを付けない。条件を `has-terraform` のみに変更(約 5.4 ランナー分の削減)。
- **Terraform provider キャッシュのブロックが 7 箇所にコピペ**されていた。
  `.github/actions/setup-terraform-cached` に集約(ci.yml 5 箇所を置換)。
- **全 42 ジョブに `timeout-minutes` が無く**既定の 6 時間だった。実測に基づき付与。
- `astro check` が `typecheck` ジョブと `build` スクリプトで二重実行されている
  (未対応 — 影響が小さく、build 側は成果物の正当性担保として妥当なため)。

---

## 6. ローカルフックの再配分

pre-commit が重すぎた(`golangci-lint run ./...` + `go test -race -coverprofile ./...`
が Go を触る全コミットに乗り、CI 実測換算で約 2.5 分相当)。

| フック | 実行内容 |
| --- | --- |
| pre-commit | lint-staged / terraform fmt + pre-commit フック / gitleaks(全コミット) / `go vet` + `go test`(race・カバレッジなし) / admin・astro の lint + unit / `scripts/deploy` unit |
| pre-push (新設) | `golangci-lint run ./...` / `go test -race` + カバレッジ 90% ゲート / `scripts/deploy` unit |

検出条件も修正した。従来 `go-functions/*.go` のみを見ていたため
`go.mod` / `go.sum` / `Makefile` の変更で Go テストが動かなかった。

---

## 7. 残っている課題(本監査では未対応)

### テストが存在しないソース

- `frontend/admin/src/api/auth.ts`, `src/api/posts.ts`
  — テストが無く、かつ `src/api/**` は vitest のカバレッジ計測からも除外されている
  ため 80% ゲートから完全に不可視。最も優先度が高い。
- `frontend/admin` — `TiptapToolbar.tsx`, `UploadImageNodeView.tsx`,
  `extensions/UploadImage.ts`(画像アップロード経路。PR CI が飛ばしている E2E と同じ領域)、
  `ThemeContext.tsx`, `ThemeToggle.tsx`, `ConfirmDialog.tsx`,
  `SortableCategoryItem.tsx`, `useAuth.ts`, `skeleton/*` 4 ファイル
- `frontend/public-astro` — `.astro` コンポーネント/レイアウト/ページ 11 ファイル
  (ビルド成果物経由の integration テストと Playwright でのみ間接的にカバー)
- `scripts/deploy/cli.ts`, `astroLocalDeployCli.ts`
- `scripts/*.js|.ts|.sh` 全般

### その他

- Checkov は `soft-fail: true` のため findings がマージをブロックできない
  (Phase 1 運用として意図的。解除には別途トリアージが必要)
- `terraform-plan-prd` が `environment: prod` を指定している。この環境に
  レビュアー必須設定がある場合、`main` 宛 PR が読み取り専用の plan で
  承認待ちになる。GitHub 環境設定の実態確認が必要
- tflint は未導入
- `.github/workflows/README.md` が全面的に陳腐化している
  (CDK 時代の記述、存在しない `ci-test.yml`、削除済み `frontend/public`、
  `npm ci` / `package-lock.json` 前提など)
- Goバージョンは`go-functions/go.mod`を単一情報源とし、ワークフロー・ローカルデプロイとの不一致を
  `scripts/ci/verify-go-toolchain.sh`で検出する。過去の`1.25.12`重複に関する指摘はこの構成で解消済み。
- `.pre-commit-config.yaml` の非 terraform フック(go-fmt/go-vet/go-mod-tidy、
  eslint、whitespace 系)は、husky が `core.hooksPath` を専有しているため
  `pre-commit install` を別途実行しない限り動かない
