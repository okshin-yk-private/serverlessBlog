# 週次の本番リリース

毎週土曜09:00（日本時間）にGitHub Actionsの`Weekly Production Release`が開始します。
GitHubの混雑による遅延・実行の取りこぼしはあり、09:00ちょうどの反映は保証しません。
`WEEKLY_RELEASE_MODE=enabled`のときだけ、初回のschedule実行がPRを作成・マージします。
手動実行とRe-runは読み取り専用です。人によるPR承認・prod環境承認は必須にしません。

対象はDependabotだけでなく、開始時点の`develop`に含まれる機能・インフラ変更全体です。
本番のデプロイ後Smoke Testは既存Deploy workflowで実行します。
マージ後のデプロイ失敗を自動revertする仕組みはありません。

## リリースの流れ

1. `main`の保護と現在の`develop`・`main`のSHAを確認する。
2. treeが同じなら差分なしで終了。既存のmain向けPRがあれば重複作成せず停止する。
3. 最新DEV Deployの成功と、公開サイト・管理画面のデプロイ後E2Eステップの成功を確認する。
   原則として対象develop SHAの実行が必要。docsなど明示した管理用ファイルだけが
   後から変更されている場合は、その祖先SHAの成功を再利用し、PR本文に記録する。
   アプリ・依存・Terraform・デプロイ設定・E2E等が変わっていれば再利用しない。
   手動DEV Deployを証跡にする場合は、Infra・Admin・Astroすべてのデプロイ成功が必要。
   E2Eのjob/step自体がskippedなら不合格。テスト内の個別skip数はこのcontrollerでは解析しない。
4. `release/weekly-YYYY-MM-DD-<run-id>`を固定したdevelop SHAから作る。
   固定したmain SHAをこの一時ブランチに通常mergeし、両SHAの祖先関係と
   **候補treeが元developと完全に一致すること**を確認する。競合・内容の不一致は停止。
   `develop`自体の書き換え、force push、`ours`による競合の強制解決は行わない。
5. この一時ブランチからmainへPRを作り、候補SHAの最新の3つのworkflowと必須jobを待つ。
   - CI / All CI Checks Passed
   - Security Scan / Security Scan Summary
   - Dependency Update Security / Dependency Update Security Gate
6. mainとdevelop、候補SHA、DEV結果、必須チェック、main保護を再取得する。
   変化・失敗・`no-automerge`ラベルがあれば停止する。
7. 全条件を満たせば、期待するhead SHAをREST APIに指定して**merge commit**でマージする。
   長期ブランチの祖先関係を維持するためsquash/rebaseは使わない。main pushでPRD Deployが起動する。

PR作成後の待機上限は45分、マージ可能時間は土曜09:00〜12:00 JSTです。
待機中にdevelopが進んだ場合も停止します。変更の一部だけを勝手に選んでリリースしません。
停止後のPRを翌週の処理が自動更新・自動マージすることはありません。
停止理由を解消して既存PRを閉じるか、確認後に手動でリリースします。
branch作成後・PR作成前に停止した場合、一時ブランチが残ることがあります。

## 保護と権限

mainにはPR経由の変更、上記3チェック（GitHub Actions App ID 15368に固定）、
strict（最新baseとの同期）、管理者にも適用、force pushと削除の禁止を設定します。
`Dependency Update Security`はdevelopとmainの両方で実行します。

既存のリポジトリ限定GitHub Appを利用し、権限を追加しません。
Contents/Pull requests write、Actions/Checks/Administration readが必要です。
App tokenはPR検査には渡さず、信頼したdevelop上のcontrollerだけが使います。
PRのコード・artifact・cacheはcontrollerで実行しません。
Appにbypass権限は付与せず、GitHubの保護に従います。
GitHub標準のAuto-merge予約は使わないため、予約が翌日以降に残ることはありません。

## 停止

- `WEEKLY_RELEASE_MODE=dry-run`へ戻すと次回以降は読み取り専用になる。
- 既に開始した実行には変数変更が即時反映されないため、実行中のworkflowもキャンセルする。
- PR単位では`no-automerge`を付ける。ただし最終API呼び出しと同時の操作は原子的でない。
- 緊急時はAppのインストール停止・token失効を行う。Dependabot自動マージも同じAppのため停止する。

この設定はCIが捕捉しない互換性問題、未知の脆弱性、悪意あるコードを保証しません。
Security Scanの成功と検出件数ゼロは別です。追加ゲートは新規・変化した既知のHigh/Criticalと
検出可能な秘密情報を停止し、既存の同一検出を安全と認定するものではありません。

## 検証と一次資料

`bun run test:unit:config`、Python挙動テスト、actionlint、変更ファイルのformat/lintを実行します。
有効化時はActionsの手動実行でApp認証・main保護・DEV証跡の読み取りを確認します。
本番への実マージの初回確認は最初の土曜実行で行われます。

- [GitHub schedule仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub branch merge API](https://docs.github.com/en/rest/branches/branches#merge-a-branch)
- [GitHub SHA条件付きPR merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- [GitHub長期ブランチのマージ方式](https://docs.github.com/en/pull-requests/reference/pull-request-merges)
