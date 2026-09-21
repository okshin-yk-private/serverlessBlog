# 公開サイトの atomic deployment

Issue #503 の実装契約と受入手順です。ここでの atomic は、各リクエストが
検証済みの旧版または新版を参照することを指します。世界中のエッジが同時に
切り替わる保証ではありません。

## 公開前の検証

1. 全ファイルのサイズと SHA-256（Base64）を計算します。
   `index.html`、`404.html`、`about/index.html`、`rss.xml`、`robots.txt`、
   `sitemap-index.xml`、`sitemap-0.xml` は空でないことが必須です。
   シンボリックリンクは拒否します。
2. `releases/<revision>/release-plan.json` を条件付きで作成します。
   同じリビジョンに異なるファイル一覧・内容を追加するデプロイは拒否します。
   このファイルだけでは公開可能とはみなしません。
3. 内容ハッシュ付きの `_astro/` 資産を先に転送し、その後で HTML 等を
   `releases/<revision>/` に転送します。既存オブジェクトは上書きしません。
4. `PutObject.ChecksumSHA256` と `HeadObject.ChecksumMode=ENABLED` を使い、
   サイズと SHA-256 を照合します。SHA-256 がない従来オブジェクトは、ETag を
   読取り条件にした GetObject で実データを取得して照合します。ETag 自体を
   内容のハッシュとは扱いません。検証失敗時は KVS を更新しません。
5. 全件成功後に同じファイル一覧を `release-manifest.json` として保存・検証します。
   両メタデータ名は予約され、ビルド成果物が含んでいれば失敗します。
6. KVS の ETag を条件に `activeRevision` と `highestPromotedRevision` を
   一括更新します。古いビルド、同じ秒で別名のビルドは公開しません。
   同じ秒の競合で失敗した場合は、新しいビルドとして再実行します。

KVS が未設定・不正・取得不能の場合、CloudFront は `503 / no-store` を返し、
未検証の旧ルート配置にはフォールバックしません。新規環境では最初の公開まで 503 です。

リビジョンの数値部分は全デプロイ経路で epoch 秒です。CodeBuild は
`CODEBUILD_START_TIME`、GitHub Actions はビルドジョブ開始時の値を使い、
遅く完了した古いビルドに新しい番号を割り当てません。ローカル経路も
ビルド前に採番します。CodeBuild は build phase 失敗後の post_build から
公開しません。記事更新の durable revision 管理は別契約（Issue #501）です。

## 公開後の検証と失敗の意味

CLI の通常実行には `--site-url https://<対象の公開ホスト>` が必須です。
公開 manifest が今回の内容に一致するまで待ち、次を確認します。

- トップ、About、RSS、robots、sitemap、直接の 404.html。
- 記事があれば 1 件の末尾スラッシュ有無、共有資産と favicon があれば各 1 件。
- 存在しない URL のステータスが 404 で、本文が今回の 404.html に一致すること。
- 最後にもう一度 manifest が今回の版であること。

HTTP ステータスだけでなく本文の SHA-256 も照合します。転送先の変更を避けるため
リダイレクトは追跡しません。既定の待機上限は 90 秒です。これは AWS の伝播時間の
SLA ではなく運用上のタイムアウトです。このクライアントが到達したエッジの確認であり、
全世界の伝播完了や全記事・全資産の HTTP 検証を証明するものではありません。

公開後の検証失敗はデプロイ失敗として返しますが、**ポインタは既に切り替わっている
可能性があります**。自動で旧版へ戻しません。別ビルドの公開を取り消さないよう、
現在のポインタを確認して以下の条件付きロールバックを使います。

DEV の Basic Auth がある場合、CLI は呼出し元が明示的に渡す
`SITE_VERIFY_BASIC_USER` / `SITE_VERIFY_BASIC_PASSWORD` から認証ヘッダーを作ります。
値をコマンド引数やログには出しません。CodeBuild は `verify_basic_auth=true` のときだけ
既存の `/serverless-blog/<env>/basic-auth/username` と `password` を Parameter Store から取得します。
権限追加はこの 2 パラメータへの `ssm:GetParameters` に限定します。値は CloudFront の
設定と一致している必要があります。この変更はパラメータを作成・更新しません。
カスタマー管理 KMS キーで暗号化している場合は、別途そのキーの復号権限が必要です。
GitHub Actions とローカルスクリプトは対象が 401 を返した場合に既存パラメータを取得します。

## ロールバック

対象環境への操作権限を確認してから実行します。以下は値を置き換える手順例であり、
この文書の追加自体は AWS 操作を実行しません。

```sh
cd scripts/deploy
bun run deploy -- \
  --bucket "$PUBLIC_BUCKET" --kvs-arn "$RELEASE_KVS_ARN" \
  --site-url "$PUBLIC_URL" --region ap-northeast-1 \
  --rollback --revision "$ROLLBACK_REVISION" \
  --expected-active "$CURRENT_REVISION" --dry-run
```

dry-run でも S3 と KVS を読み、復旧対象の manifest と全ファイルを検証します。
通常デプロイの dry-run はローカル成果物と KVS を確認し、S3 転送と公開 URL 検証を省略します。
実操作は同じ引数から `--dry-run` を除きます。
現在の公開版が `--expected-active` と異なる場合は中止します。ETag 競合後も
公開版を再確認します。対象は現在より古い、manifest を持つリリースに限ります。
manifest 導入前のリリースには、ファイル一覧を推測してロールバックしません。
復旧候補を確保するには、この方式で検証済みリリースを少なくとも 2 つ保持してください。

ロールバックしても `highestPromotedRevision` は戻しません。遅れて完了したビルドや
戻す前の版が再公開されることを防ぎます。次の公開にはそれより新しい番号が必要です。
この制御を無視する旧デプロイスクリプトを混在させないでください。移行時は旧ビルドを
停止し、CodeBuild の実際のソース版を含め、すべての公開経路を更新してください。

## 404 配信の修正と運用上の追加条件

2026-09-21 の PRD 公開 URL の匿名 GET では、直接 `/404.html` は 12,256 bytes、
存在しない URL の 404 本文は 12,050 bytes で、SHA-256 も異なっていました。
同じ閲覧地点での観測であり、全エッジの状態を示すものではありません。

固定 `response_page_path=/404.html` を撤去し、公開サイトの origin-response に
Lambda@Edge を追加します。関数は書換え済みリクエストのリリース番号から
`releases/<revision>/404.html` を取得し、404 のまま本文を返します。
KVS を再取得しないため、その間に公開版が変わってもリリースは混ざりません。
GET/HEAD の 404 だけを対象にし、API の 403 等は変更しません。
S3 取得に失敗した場合は元のエラーを維持し、公開後の検証を失敗させます。

- us-east-1 の Node.js 22 / x86_64 / 番号付きバージョンを関連付けます。
  環境変数の代わりにバケットとリージョンを成果物へ埋め込みます。
- 実行権限は対象バケットの `releases/*/404.html` の読取りと、各リージョンの
  対象関数のログ書込みに限定します。認証情報やエラー詳細をログへ出しません。
- origin-response 関数は成功したオリジン応答でも呼ばれます。404 の場合には
  追加の S3 GetObject も発生します。キャッシュヒットでは実行されません。
  Lambda@Edge の料金・コールドスタート・S3 への遅延が加わるトレードオフです。
- headers + body の 1 MB 上限に余裕を持たせ、404.html は公開前に 900 KiB 以下を要求します。
  S3 エラーの Content-Length / ETag 等は新本文と混在させず、read-only header は維持します。
- ランタイム同梱の AWS SDK v3 を利用します。SDK の minor version は固定されず、
  AWS ランタイム更新の対象です。ここでは安定した GetObject API だけを使用します。
- 初回デプロイ主体には Lambda の作成・IAM role の受渡しに加え、
  `lambda:GetFunction`、`lambda:EnableReplication*`、`lambda:DisableReplication*`、
  必要に応じた `iam:CreateServiceLinkedRole` が必要です。
  既存のデプロイロールにこれらがあるかは、今回のローカル検証では確認していません。
- エッジのログは実行リージョンごとに作成されます。新規ロググループの保持期限は
  この変更では自動設定されないため、反映後に既存のログ保持運用へ追加してください。
  削除時は先に関連付けを解除し、複製の削除完了を待つ必要があります。

## 保持・削除方針

`releases/` と共有 `_astro/` の現行オブジェクトは自動削除しません。
長期間有効なリリース、復旧対象、古いブラウザーが参照する資産を保護する代わりに、
保存容量と費用は増え続けます。S3 Versioning の非現行バージョンの期限切れと、
リリースの現行オブジェクトを削除することは別です。

日数だけの Lifecycle、`sync --delete`、通常公開時の `/*` invalidation は使いません。
将来の清掃には、公開・ロールバックと共通の排他制御、削除予定状態、有効版・復旧対象・
処理中の版の保護、残す HTML が参照する資産の保護が必要です。
単に KVS を一度読んでから削除する方法では競合を防げません。

## 受入確認（未実施の実環境項目）

ローカルの SDK モックは、AWS の実際の権限やエッジの挙動を証明しません。
Issue #503 を閉じる前に、DEV / PRD の承認された環境で次を確認します。

1. 実際の公開ビルドと公開 URL 検証が成功すること。
   特に Lambda@Edge の関連付け後、存在しない URL の本文が同じリリースの
   `404.html` に一致すること。モックは実際の OAC イベントや配信結果を保証しません。
2. ビルド中の旧版配信、旧 HTML の `_astro/` 資産、切替後の代表記事を確認すること。
3. `/admin`、`/api`、`/images`、共有資産、旧リリースの直接アクセスの振る舞いを確認すること。
4. 故障させた成果物が公開されないこと、遅い旧ビルドが新しい版を上書きしないこと。
5. manifest のある保持版への条件付きロールバックと、その後の新規公開を確認すること。
6. `bun run test:e2e:aws:public` を実行すること。この設定の共通セットアップは
   AWS テストデータを操作するため、ローカルの非接続検証には含めません。

## 公開処理の未完了を成功扱いにしない補強（2026-09-21）

PR #658 の本番 Deploy は成功表示でしたが、公開処理のログはファイル転送開始で止まり、
phase 終了・KVS 昇格・CLI 成功サマリーがありませんでした。同日 17:48 JST の匿名 GET では
トップが 200、`release-manifest.json` が 404 でした。インフラ反映と従来ページの配信成功だけでは、
新リリースの公開完了を証明できません。

async action に `program.parse()` を使う旧 CLI は、未解決 Promise を待つ処理があっても
Node / Bun とも終了コード 0 になるケースをローカルで再現しました。実際の AWS 要求が
完了しなかった原因は未特定です。この補強のローカルテストは本番転送の復旧を証明しません。

- 公開・ロールバック・ローカル公開の CLI は `parseAsync()` を待ち、成功が確定するまで
  終了コードを失敗のまま保持します。参照を保持したタイマーでプロセスの早期終了を防ぎ、
  期限超過時は終了コード 1 でプロセスを終了します。
- 期限は既定 300 秒。`--timeout-seconds` で 1〜3600 秒を指定できます。
  ローカル公開では依存インストール・ビルドも含みます。期限超過時もポインタが既に
  切り替わった可能性があり、再試行・ロールバック前に現在の公開状態を確認します。
- GitHub Actions の CLI を `node --import tsx cli.ts` で実行し、Node を使う既存の
  CodeBuild / ローカルの `tsx` 経路と実行環境を揃えます。Bun が停止原因だったと断定する変更ではありません。
- GitHub Actions の DEV / PRD と CodeBuild は CLI 成功後、SDK を読み込まない別プロセス
  `node verify-public-manifest.mjs <site-url> <revision>` を実行します。HTTPS の manifest が
  200、schemaVersion が 1、revision が今回の値、files が空でない配列の場合だけ成功します。
  404・旧 revision・JSON 不正・通信失敗・リダイレクトは失敗します。
- この独立検証は HTTP 期限を最大 10 秒とし、最大 90 秒間、約 2 秒間隔で再試行します。
  残り時間に応じて要求期限を短くし、処理自体が完了しない場合も 95 秒でプロセスを失敗終了します。
  明示的に渡された既存の
  Basic Auth 環境変数だけを利用し、認証情報を含み得るエラー本文をログに出しません。
  全ファイルの内容照合は引き続き公開 CLI 側の責務です。
- 別エッジの反映遅延や、直後に別リリースが公開された場合も、期限まで一致しなければ独立検証は失敗します。
  その場合も成功扱いにはせず、公開版を調査します。自動巻き戻しは行いません。

参照: [Commander の async action](https://github.com/tj/commander.js#action-handler)。

補強の検証: Node / Bun の別プロセスで未完了・成功・拒否・期限入力を確認し、
deploy テスト 183 件が成功。構成テストは 97 件成功し、終了コード 0 の公開処理に対しても
manifest 不一致なら GitHub DEV / PRD・CodeBuild が失敗することを確認しました。
Terraform fmt、CodeBuild / DEV / PRD validate、CodeBuild mock test 25 件も成功しました。
型・lint・変更した TypeScript / JavaScript の書式・差分チェックも成功しました。
追加確認したワークフロー YAML 全体の書式警告は変更前にも再現し、無関係な再整形はしていません。
上記のローカル検証時点では、本補強の再デプロイと公開後確認は未実施でした。

### DEV マージ後の確認と追加調整

PR #659 の全必須チェック成功後に `develop` へマージし、DEV の Deploy
`35584892043`（`9ae8917`）を確認しました。転送と検証は約 60 秒、KVS 昇格は約 0.6 秒で
成功し、CLI の公開後検証を含む約 106 秒の処理が成功終了しました。直後の独立ゲートは
約 0.7 秒で失敗したため、デプロイ全体と後続 E2E は成功扱いになっていません。

当時のゲートは 1 回だけ取得し、失敗理由を分類していなかったため、実際の応答が
HTTP エラー、旧 revision、JSON 不正、通信エラーのどれだったかは不明です。
伝播遅延を原因と断定せず、上記の上限付き再試行と安全な理由分類を追加しました。
ログは `httpStatus:<数値>`、`revisionMismatch`、`invalidSchema`、`invalidJSON`、
`requestFailed` と試行回数だけで、レスポンス本文・生の例外・認証情報を含めません。
新しいテストでは一時的な 404・旧 revision・通信失敗から回復できること、継続的な不一致は
期限内に非ゼロ終了することを、仮想時計と別プロセスで確認しました。
追加調整後の deploy テストは 186 件成功し、型・lint・変更した TS / JS の書式と差分チェックも成功しました。

## ローカル検証結果（2026-09-21）

最新 `develop`（`03cd5920410abf862a0a7e7aaa42e142eca8011c`）を取り込み、
既存差分を保持した上で、KVS 取得失敗時のコメントを実際の 503 応答に合わせました。
各パッケージの依存は更新後の lock に固定してインストールし、以下を再確認しました。

- `bun run verify` の構成チェックを個別に実行: lint、format、Admin / Astro の型検査が成功。
  Admin 507 成功 / 既存 5 skip、Astro 385、deploy 151、config 94 が成功。
  Go 1.26.6 の `make test`（race detector 有効）も成功。
- deploy TypeScript の `tsc --noEmit`、`scripts/local-deploy.sh` の `bash -n`: 成功。
- Terraform fmt / validate: 成功。DEV 6、PRD 6、CDN 24、CodeBuild 25 の
  mock provider テスト（合計 61 件）が成功。実 AWS の plan / apply は実行していません。
- Terraform はソースが一致する検証用コピーで backend を無効にして init し、AWS / Cloudflare
  provider をモック化しました。CodeBuild / PRD の OS 別チェックサム不足は公式署名検証済みの
  provider 再取得で解消し、既存 PRD lock の random provider 不足もコピー内で補いました。
  CDN / DEV の lock は補正不要でした。元の環境 lock は変更しておらず、検証用コピーの
  lock 補完を含む結果です。CDN module の archive provider 追加だけを今回の差分に含めます。
- 初回検証の CDN Checkov: 21 成功、失敗 0、1 skip。X-Ray 非対応の Lambda@Edge に限り
  `CKV_AWS_50` の理由付き skip を追加しました。共通の既存 skip 設定も適用しています。
- 初回検証の Trivy: 変更ファイルの secret scan は指摘なし。CDN の組込み misconfiguration checks で
  HIGH / CRITICAL の指摘なし。GitHub CI の実行結果とは別です。
- AWS E2E、Lambda@Edge の実際の関連付け、公開後検証、実ロールバックは未実施です。

## 参照元と根拠の範囲

以下は AWS の一次資料です。アプリケーション側の検証・復旧条件は、本リポジトリの
実装上の判断です。実環境での受入結果とは区別してください。

- [S3 PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html): SHA-256 の Base64 表現と条件付き作成。
- [S3 HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html): チェックサム取得と暗号化時の権限。
- [KVS UpdateKeys](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_kvs_UpdateKeys.html): ETag 条件と複数キーの一括更新。
- [KVS の紹介](https://aws.amazon.com/blogs/aws/introducing-amazon-cloudfront-keyvaluestore-a-low-latency-datastore-for-cloudfront-functions/): エッジへの伝播。
- [CloudFront エラー処理](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html): カスタムエラーページの取得。
- [S3 Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html): 経過日数による削除。

- [CodeBuild 環境変数](https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-env-vars.html): 開始時刻の単位とその時点の成功状態。
- [CodeBuild Parameter Store](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html#build-spec.env.parameter-store): `ssm:GetParameters` の要件。

- [Lambda@Edge のイベント](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-event-structure.html): origin-response の request と origin。
- [Lambda@Edge の制約](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html): 配置リージョン・バージョン・アーキテクチャ。
- [Lambda@Edge の上限](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-lambda-at-edge): 応答の最大サイズ。
- [Lambda@Edge の権限](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-permissions.html): 実行・複製・関連付けの権限。
- [エッジのログ](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-functions-logs.html): リージョン別のログと名前。
- [Node.js runtime SDK](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html): 同梱 SDK のバージョン管理。
