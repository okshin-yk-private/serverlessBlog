# Dependabot自動マージの運用

この変更をマージしただけでは、依存更新は自動マージされません。
`DEPENDABOT_AUTOMERGE_MODE` が未設定・`dry-run`・未知の値の場合は読み取り専用です。
有効化、実際の依存更新のマージ、DEVデプロイの開始は別の承認段階です。
`main`とPRDは対象外です。

## 構成と判定条件

`Dependency Update Security` は読み取り専用のPR検査です。
`CI`、`Security Scan`、この検査のいずれかが完了すると、`workflow_run`で
`Dependabot Auto Merge`が起動し、3つすべての最新の検証結果を取得します。
完了イベント自体の成功や、過去の緑色表示だけではマージしません。

対象は次の条件をすべて満たすPRです。

- 作成者のログイン名・固定IDがDependabotで、同一リポジトリの`develop`向け。
- draftではなく、`no-automerge`ラベルが付いていない。
- `dependabot/bun/`または`dependabot/go_modules/`のブランチ。
- Dependabot作成の署名検証済み1コミットのみで、そのSHAがPRの最新SHAと一致。
- コミットの更新メタデータの**全項目**がminorまたはpatch。不明な構造は拒否。
- 変更は下記の1ディレクトリ内の既存ファイルの更新のみ。追加・削除・renameは拒否。
  - ルート、`frontend/admin`、`frontend/public-astro`、`scripts/deploy`の`package.json`と`bun.lock`。
  - `go-functions`の`go.mod`と`go.sum`。
- コミットの親が現在の`develop`。ベースが進んだ場合はDependabotのrebaseと再検証を待つ。
- 最新SHA・当該PRに対応する3つのworkflowと、下記の各jobがすべて`success`。
  - `All CI Checks Passed`
  - `Security Scan Summary`
  - `Dependency Update Security Gate`
- GitHubがマージ可能と判定し、既存のnative Auto-merge予約がない。

予約が将来のコミットへ残ることを避けるため、GitHub標準のAuto-merge予約は使いません。
検査完了後に対象を再取得・再判定し、REST merge APIへ期待するhead SHAを渡して
squash mergeします。ブランチ保護を迂回しません。
リポジトリの「Allow auto-merge」の有効化も、この実装では不要です。

Terraform、GitHub Actions、major更新、複数コミット、複数ディレクトリの更新は
手動レビューに残ります。対象外PRがあること自体はcontrollerのエラーではなく、
ログに`BLOCKED`として理由を表示します。workflowの緑色はマージ完了を意味しません。

## セキュリティ検査の意味と限界

- Gitleaksのデフォルトルールで`base..head`のコミット差分を検査し、検出で失敗。
  既存の履歴用・lockfile用の例外は流用しません。出力は100% redactし、秘密値を含む
  レポートを保存・公開しません。過去の既存漏えいはこの差分検査では解消されません。
- Trivy 0.70.0で4つのBun lockfileとGo moduleを、dev dependenciesを含めて検査。
  base/headを同一ジョブ・同一DB snapshotで比較します。
- 差分キーはmanifest、パッケージ、バージョン、脆弱性ID、重大度。
  新規High/Critical、HighからCriticalへの変化、脆弱性が残るパッケージのバージョン変更を停止。
- 同じバージョン・同じ重大度の既存High/Criticalは件数を表示します。
  **既存問題を安全と認定したり、例外承認したりするものではありません。**
  運用開始前に既存の検出結果を確認し、対応・例外の理由と期限を別途記録します。
- 必須manifestが解析されない、JSON不正、DB取得失敗、スキャナー異常時は失敗。
  PRのインストール処理やライフサイクルスクリプトは実行せず、manifestだけを隔離して解析。
- 新規の既知High/Criticalと検出可能なシークレットのゲートです。
  未知の脆弱性、悪意あるパッケージの挙動、実環境の互換性を保証しません。
  既存のCodeQL・Bun audit・govulncheck等を置き換えません。

controllerは`develop`のコードだけを実行し、PR head、PR artifact、依存インストール、
共有cacheを使いません。App tokenは有効化後のcontrollerだけに発行し、PR検査へ渡しません。

## 導入手順

1. このPRのローカル検証とGitHubのCI・セキュリティ検査を確認する。
2. 実装PRを`develop`へマージする。controllerはdefault branchに存在してから動作する。
   実装PRのマージと、その変更パスによるDEV workflow起動は別途承認する。
3. `DEPENDABOT_AUTOMERGE_MODE=dry-run`を設定（未設定でも同じ）。
   `Dependabot Auto Merge`のRun workflowで対象のPR番号を指定し、ログを確認する。
   手動実行は、modeが`enabled`になった後も常に読み取り専用。
4. 少なくとも適格なBun/Go PRの現在SHAで、3つの検査が実際に完了し、
   controllerの対象判定・停止理由が妥当であることを確認する。
   この実装PR自体はDependabot PRではないため、適格判定の実地確認には使えない。
5. 既存の検出結果と新規ゲートの誤検出を確認する。単に緑色にするための一括抑制はしない。
6. 下記のGitHub Appとclassic branch protectionを準備する。
7. 運用開始の承認後、modeを`enabled`へ変更する。
   既に全検査が終わったPRは次の完了イベントまで動作しないため、必要な検査を再実行する。
8. 最初の1件で、squash merge、DEV Deploy、該当するデプロイ後E2Eの成功を確認する。

## GitHub側の設定

専用GitHub Appをこのリポジトリだけにインストールします。権限は次のとおりです。

| Repository permission | Access         | 目的                   |
| --------------------- | -------------- | ---------------------- |
| Contents              | Read and write | 対象SHAのマージ        |
| Pull requests         | Read and write | PR情報・マージ         |
| Actions               | Read           | 最新workflow結果       |
| Checks                | Read           | jobの成功・発行元      |
| Administration        | Read           | ブランチ保護条件の確認 |
| Metadata              | Read           | GitHub Appの必須権限   |

Appに管理者権限・保護ルールのbypass・Workflows書き込み権限は与えません。
App tokenによるマージで既存のpush起動を維持します。Appの秘密鍵はチャットへ貼らず、
Actions secretへ直接登録します。個人の長期PATは使いません。

| 種類                | 名前                               | 値                               |
| ------------------- | ---------------------------------- | -------------------------------- |
| Repository variable | `DEPENDABOT_AUTOMERGE_MODE`        | 最初は`dry-run`、承認後`enabled` |
| Repository variable | `DEPENDABOT_AUTOMERGE_APP_ID`      | 専用AppのID                      |
| Actions secret      | `DEPENDABOT_AUTOMERGE_PRIVATE_KEY` | 専用Appの秘密鍵                  |

`develop`のclassic branch protectionで、PR経由のマージと次を設定します。

- 前述の3つのcheckを必須化。発行元はGitHub Actions（App ID `15368`）に固定。
- Require branches to be up to date before merging（`strict=true`）。
- 管理者にも保護ルールを適用（`enforce_admins=true`）。
- 必須レビューがある場合は、そのレビュー完了まではマージされない。
  controllerによる自動approveやレビュー要件のbypassは実装していない。
- squash mergeを許可する。

この初期実装はclassic protectionをAPIで検証します。rulesetのみでの同等性判定は
対応していないため、有効なrulesetだけがある場合も停止します。
必須チェック設定は一般の`develop`向けPRにも適用されます。

## 停止と復旧

1. modeを`dry-run`へ戻し、実行中のcontrollerをキャンセルする。
   変数変更だけでは、既にトークンを取得している実行を即時停止できない。
2. 緊急時はAppのインストールを停止し、発行済みtokenも失効させる。
3. 対象PRだけを停止するなら`no-automerge`ラベルを付ける。
   最終API呼び出しと同時の変更まで原子的に保証されないため、緊急停止は上記を使う。
4. 既にマージされた変更は、原因確認後にrevert PRで戻し、DEVへの反映まで確認する。
   自動revertやPRD操作は行わない。

## 検証と一次資料

ローカル: `bun run test:unit:config`、変更ファイルのESLint/Prettier、
`actionlint .github/workflows/dependabot-auto-merge.yml .github/workflows/dependency-update-security.yml`。
config suiteからPython標準ライブラリの挙動テストも実行します。
APIを模擬したテストは権限・GitHubの実行時挙動を保証しないため、導入時の実地確認が必要です。

- [GitHub workflow_runの権限と起動条件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- [GitHub REST merge APIと期待するhead SHA](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- [GitHub branch protection](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection)
- [GitHub tokenと後続workflowの起動](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)
- [Trivy 0.70.0 Bun parser](https://github.com/aquasecurity/trivy/blob/v0.70.0/pkg/fanal/analyzer/language/nodejs/bun/bun.go)
- [Dependabotの署名・メタデータ検証実装](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/verified_commits.ts)

根拠はGitHub/各ツールの一次資料と固定バージョンの実装です。
GitHub側の設定、既存検出結果、実地検証の完了状態は導入時点で再確認します。
