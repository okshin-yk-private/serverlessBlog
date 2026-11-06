# Terraform Plan 公開後の対応

## 確認済みの事実

- 公開リポジトリの旧 `terraform-plan-dev` 成果物に、DEV Basic 認証のユーザー名・パスワードと Cloudflare トークンの非空の平文値が含まれていた。値そのものは記録しない。
- 成果物 ID `13350853466` は削除後に API が 404 を返し、`terraform-plan-dev` / `terraform-plan-prd` の一覧は各 0 件だった。第三者の取得・悪用の有無は未確認。
- PR #860 は生 Plan の公開を廃止した。公開するのは変更操作別の件数だけで、機密フラグの有無にかかわらず値・アドレス・診断文を含めない。

## CI の再実行経路

旧 `.github/workflows/ci.yml` は GitHub 上で無効のまま維持する。
再有効化すると過去の run は当時の SHA/ref で再実行されるため、最新 develop の修正だけでは防げない。
安全な処理を `.github/workflows/ci-secure.yml`（表示名 `CI Secure`）へ移した。
必須チェック名と GitHub Actions App は変更しない。Dependabot・merge queue の参照先も更新した。

登録後は旧 workflow の無効状態、新 workflow の別 ID・有効状態、および新 run の workflow ID を API で確認する。
通常の status checks とは別に特定 workflow を必須にする ruleset を追加する場合は、その参照先も確認すること。
旧 run のログを大量削除する必要はない。旧 workflow を再有効化しないこと。

## Cloudflare トークン

DEV/PRD の `cloudflare_api_token` を `sensitive = true` と `ephemeral = true` にする。
provider 設定にのみ使用する値であり、plan と保存済み plan の apply の両方へ `TF_VAR_cloudflare_api_token` を渡す。
既存の GitHub CI/Deploy は SSM から環境変数に読み込むため、この供給経路を継続する。
過去の成果物・state・SSM バージョンは、この変更で消去されない。

所有者は Cloudflare で露出したトークンをロールまたは失効・再発行し、利用している環境の SSM SecureString を更新する。
再発行だけで旧トークンが残る方式を選んだ場合は、旧トークンの失効も必要。

- DEV: `/serverless-blog/dev/cloudflare/apikey`
- PRD: `/serverless-blog/prd/cloudflare/apikey`

両環境が同じトークンを共有しているかは未確認。該当環境を特定し、両方で利用していれば両方を更新する。
トークンをチャット・Issue・workflow input に貼らない。SSM 更新後は実際の GitHub plan/deploy で権限・有効性を確認する。
ローカル確認 API の 401 だけで、旧トークンの失効済みとは判定しない。

## DEV 認証の更新

`Deploy` を `develop` 上で手動実行し、`environment=dev`、`components=infrastructure`（または `all`）、`rotate_dev_access=true` を指定する。
PRD・他ブランチ・frontend/astro のみの指定では、変更前に停止する。

1. 現在の SSM 認証値で DEV の `/admin/` が 200 を返すことを確認する。
2. ユーザー名は維持し、パスワードを暗号学的乱数で更新する。AWS CLI への JSON 入力は mode 0600 の実ファイルを使い、呼び出し終了時に削除する（利用中の CLI では `/dev/stdin` 経由の入力が JSON として受理されなかった）。旧・新値の検証用ファイルは runner の一時領域に mode 0600 で置く。
3. SSM の新値で既存の Terraform deploy を実行する。明示的な更新操作に限り、`module.auth.random_password.e2e_admin[0]` と `module.api.aws_api_gateway_api_key.cloudfront[0]` を `-replace` で再生成する。Cognito ユーザーはパスワード更新だけとし、対象キー・usage-plan association・生成パスワード以外の削除が計画されていたら停止する。既存の backup / MFA ガードも維持する。
4. CloudFront distribution が `Deployed` になるまで待つ。公開・管理・API・画像・Astro の各パスで未認証・旧 Basic・旧 Cookie が 401、新 Basic と新 Cookie が管理画面にアクセスできることを確認する。
5. 旧 API key ID の取得が明示的な NotFound となること、新しい origin key 経由で公開 API が 200 を返すこと、E2E パスワードの SSM 値が変わったことを確認する。E2E ユーザーを global sign-out し、後続の E2E で新しいパスワードによるログインを確認する。既発行 JWT をオフライン検証する側では有効期限まで受理され得るため、全 JWT の即時失効とは扱わない。
6. 成否にかかわらず検証用ファイルを削除する。値を成果物やログへ出さない。

SSM 更新・API key 置換・エッジ反映は原子的ではなく、その間は一時的に不整合やアクセス不能が起き得る。API key と usage-plan association の伝播も待つ必要がある。
途中で失敗したら「更新完了」と扱わない。**露出した旧値へ戻さず、現在の SSM 値を通常の infrastructure deploy で反映して復旧する。**
再実行でさらにパスワードを変える前に、SSM とエッジの不整合を解消する。
実行中の deploy をキャンセルしない。検証は実行地点からの観測であり、全世界の全エッジで同時に試験したことは意味しない。

Basic 認証値と Cookie の受理値は CloudFront Function のコードに埋め込まれる。
この通常の resource 属性を ephemeral にすることはできず、Terraform state には残る。
新パスワードは SSM から取得し、利用中ブラウザーの保存済み Basic 認証を更新して再ログインする。

## 残る確認事項と優先順位

1. **最優先:** Cloudflare の旧トークン失効、SSM 更新、DEV 認証更新の実行・拒否確認。コードのマージだけでは資格情報は無効にならない。
2. **高:** main への反映と PRD 検証。develop の成功は PRD への適用を意味しない。main マージは対象を明示した承認を受けて実施する。
3. **高:** 旧 Plan は state 全体を含み得る。確認した 3 変数だけが露出範囲だったと断定しない。API origin key とテスト用管理者パスワードは source 上の保存属性を根拠に予防的更新対象としたが、旧成果物内の値は未確認。削除済み resource を含む過去の状態・SSM/state の履歴・アクセス履歴は別途確認が必要。
4. **中:** state の S3 アクセス権・暗号化・旧バージョン保持を確認する。復旧用履歴を一律削除せず、必要な証跡を保持して失効を優先する。
5. **設計変更:** Basic 認証のコード埋め込みを廃止する場合は別設計が必要。今回のローテーションと Cloudflare ephemeral 化だけでは解決しない。

API Gateway usage-plan key の `value` は AWS provider 6.70.0 で Sensitive が付かない属性である。通常の deploy でも Plan／Apply の生出力を一時ファイルに抑止し、公開するのは操作件数・成否・許可リストにある AWS エラー分類だけにする。失敗時も生の診断文を公開せず、一時ファイルは終了時に削除する。

## 一次資料

- [GitHub: workflow の無効化](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)
- [GitHub: 元 SHA/ref を使う再実行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
- [HashiCorp: sensitive と ephemeral](https://developer.hashicorp.com/terraform/language/manage-sensitive-data)
- [AWS provider 6.70.0: usage-plan key の保存属性](https://github.com/hashicorp/terraform-provider-aws/blob/v6.70.0/internal/service/apigateway/usage_plan_key.go)
- [Cloudflare: トークンのロール](https://developers.cloudflare.com/fundamentals/api/how-to/roll-token/)

仕様の根拠は上記公式資料。実環境の完了状態は Issue #861 の検証結果・対応する GitHub run を参照する。
