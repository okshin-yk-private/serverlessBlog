# ブログ構成図（draw.io 編集用）

[serverless-blog.drawio](serverless-blog.drawio) を draw.io / diagrams.net の「ファイル → 開く → デバイス」で開く。
図は3ページ構成。アイコン、サービス名、役割、境界、矢印は個別の要素で、移動・文字編集・接続変更ができる。
サービスごとにグループ化しているため、内部のラベルを編集する場合はグループ内の要素を選択する。
公式 SVG のパス自体を変更する用途ではなく、構成図の編集を想定する。

| ページ              | 内容                                                               | プレビュー                            |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| 01 配信・管理API    | Cloudflare DNS、CloudFront、S3、管理・公開 API、認証、データ保存   | [PNG](page-1.png) / [SVG](page-1.svg) |
| 02 記事公開・再調整 | 記事保存、CodeBuild、原子的な公開切替、イベント通知、定期照合、DLQ | [PNG](page-2.png) / [SVG](page-2.svg) |
| 03 デプロイ・運用   | GitHub Actions、実行ロール、配置、ログ、監視、通知、DEV 差分       | [PNG](page-3.png) / [SVG](page-3.svg) |

## 対象と信頼性

- 作成日：2026-09-19（JST）。
- 修正日：2026-09-22。02 ページに管理者のブラウザ → CloudFront → API Gateway → Lambda の経路を明示。
- 実装の参照元：ローカルの `feat/admin-public-design`、コミット `357fbc8a3541163317575ffaa5be28451d2058be`。
- PRD 定義を中心に、カスタムドメイン有効時を記載。リージョンは変数の既定値 `ap-northeast-1`。CloudFront 用 ACM 証明書は `us-east-1`。
- `enable_custom_domain` の変数既定値は `false` だが、デプロイワークフローでは `true` を設定している。この条件を図に明示した。
- Terraform、アプリコード、デプロイ定義を直接読んだ**コード上の構成図**。デプロイ済み SHA、Terraform state、AWS 実環境、GitHub の現在の設定との一致は検証していない。
- PRD と DEV のアカウント分離は未確認のため、別アカウント構成を推定していない。参照範囲の Lambda / CodeBuild に `vpc_config` がないため、VPC・サブネット境界を描いていない。

## AWS の表記ガイドとの関係

一次資料は [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) と、そこから配布される **Release 24-2026.07.31**。

- [公式アイコンパッケージ](https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip)
- [公式 PowerPoint ツールキット](https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Microsoft-PPTx-toolkits_07312026.1c286c4a809a3cf2902c88ff63bf7dd1fa3cd55d.zip)：Light BG のスライド 14–18、25–27 を確認。

サービス・リソース・グループには公式 SVG を改変せず埋め込んだ。ライブラリの古さやネットワーク接続に依存せず表示できる。
使用ファイル名と元 SVG の SHA-256 は [aws-icon-manifest.json](aws-icon-manifest.json) に記載。

白背景、AWS Cloud の黒実線、Region の青緑破線、公式グループアイコン、黒い開いた矢印、直交線、Arial のサービスラベルという公式の表記を採用。
サービスラベルは 16 px（12 pt 相当）、接続線は約 1.25 pt。タイトル、役割、補足説明は可読性に合わせて調整した。
CloudFront KeyValueStore の専用アイコンは今回確認した公式セットに見つからなかったため、名前を明示した汎用ボックスで表現する。Cloudflare と GitHub も AWS サービスのアイコンに置き換えていない。

**AWS 公式の記号・表記ガイドに基づく図であり、このブログの設計自体が AWS に承認された、または Well-Architected レビュー済みという意味ではない。**
配置、ページ分割、矢印の意味付けはこの図の編集上の選択。AWS に共通の通信プロトコル記法であるとは主張しない。

## 凡例と読み方

- 実線矢印：リクエスト・API 操作・イベント通知など、線のラベルに示す向き。応答は省略。
- 破線矢印：証明書・関数・認証方式の設定上の関連付け。Region の破線は境界であり、通信の意味ではない。
- S3 と DynamoDB はリージョン内に配置。CloudFront、Functions、KeyValueStore はリージョン境界の外。
- `OAC` は Origin Access Control。3つの S3 オリジンに適用される。API Gateway オリジンまで OAC が適用されるとは描いていない。
- 03 ページの実行ロールから出る矢印は、そのロールを引き受けた GitHub Actions の操作を示す。IAM サービス自身がビルド・配置するわけではない。STS の個別呼び出しは省略。
- 02 ページの処理番号は説明順。CodeBuild の状態変更イベントは途中状態も含み、厳密な到着順を示していない。
- 記事の保存・削除はブラウザから `/api/admin/posts/...` に送信する。CloudFront Functions が `/api` を除去し、API Gateway が Cognito ユーザープールのオーソライザーで認証してから Lambda を呼び出す。ブラウザから Lambda への直接通信ではない。
- 再調整処理は `BatchGetBuilds` で実状態を照合し、後続更新があれば `StartBuild` する。これらの再調整 Lambda と CodeBuild 間の戻り線は、交差を抑えるため注記にまとめた。
- 署名付き URL による画像 PUT はブラウザから S3 への直接通信。CloudFront 経由の画像 GET と区別し、01 ページに注記した。

## 実装上の出典

以下はすべて上記コミットのリポジトリ内一次資料。将来の変更に追従する場合は、まずこの表の実装を再確認する。

| 表示内容                                                           | 参照元                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD のモジュール接続、Cloudflare DNS、ACM、CodeBuild の main、監視 | [prd/main.tf](../../terraform/environments/prd/main.tf)、[variables.tf](../../terraform/environments/prd/variables.tf)、[versions.tf](../../terraform/environments/prd/versions.tf)         |
| DEV の Route 53、Basic 認証、監視差分                              | [dev/main.tf](../../terraform/environments/dev/main.tf)                                                                                                                                     |
| 4オリジン、パス別配信、OAC、CloudFront Functions、KVS              | [cdn/main.tf](../../terraform/modules/cdn/main.tf)                                                                                                                                          |
| Regional REST API、Cognito authorizer、API Gateway のログと X-Ray  | [api/main.tf](../../terraform/modules/api/main.tf)                                                                                                                                          |
| Lambda 群、VPC 接続設定の有無、X-Ray                               | [lambda/main.tf](../../terraform/modules/lambda/main.tf)                                                                                                                                    |
| posts / categories テーブル                                        | [database/main.tf](../../terraform/modules/database/main.tf)                                                                                                                                |
| S3 の各バケットとアクセスログ                                      | [storage/main.tf](../../terraform/modules/storage/main.tf)                                                                                                                                  |
| Cognito による認証、署名付き画像 PUT                               | [login/main.go](../../go-functions/cmd/auth/login/main.go)、[get_upload_url/main.go](../../go-functions/cmd/images/get_upload_url/main.go)                                                  |
| 記事の保存と desiredRevision 更新                                  | [create/main.go](../../go-functions/cmd/posts/create/main.go)、[update/main.go](../../go-functions/cmd/posts/update/main.go)、[delete/main.go](../../go-functions/cmd/posts/delete/main.go) |
| 管理画面の削除リクエスト、API ベースURL、Authorization ヘッダー    | [posts.ts](../../frontend/admin/src/api/posts.ts)、[client.ts](../../frontend/admin/src/api/client.ts)、[deploy.yml](../../.github/workflows/deploy.yml)                                    |
| ビルド枠、後続要求、実状態との照合                                 | [sitebuild.go](../../go-functions/internal/sitebuild/sitebuild.go)                                                                                                                          |
| CodeBuild の取得・ビルド・配置                                     | [codebuild/main.tf](../../terraform/modules/codebuild/main.tf)                                                                                                                              |
| ビルド時の記事取得                                                 | [public-astro/src/lib/api.ts](../../frontend/public-astro/src/lib/api.ts)                                                                                                                   |
| S3 全配置・検証後の KVS 切替                                       | [atomicDeploy.ts](../../scripts/deploy/atomicDeploy.ts)                                                                                                                                     |
| EventBridge ルール、ターゲット DLQ、5分周期 Scheduler              | [sitebuild_events.tf](../../terraform/modules/lambda/sitebuild_events.tf)                                                                                                                   |
| CloudWatch、SNS メール購読定義                                     | [monitoring/main.tf](../../terraform/modules/monitoring/main.tf)                                                                                                                            |
| GitHub OIDC、Terraform、管理画面配置、Astro 公開切替               | [deploy.yml](../../.github/workflows/deploy.yml)                                                                                                                                            |

## 省略範囲と検証

個別 IAM ポリシー、全 API ルート、全 Lambda の個別アイコン、キャッシュポリシー詳細、バックアップ設定、各 SSM パラメータ、Terraform backend、CI の全ジョブを省略した。
CloudWatch の全ログ／メトリクス線は省略。CloudFront アクセスログを有効と推定していない。S3 server access logs は別の S3 バケットに描いた。
SNS はメール購読の定義を表すもので、購読確認や実配送の成功は未確認。

XML 構文、ページごとの ID 一意性、parent / source / target 参照、親の循環、子のはみ出し、公式 SVG の一致を検証。
draw.io 公式の描画エンジンで3ページを読み込み、PNG / SVG に出力して表示を確認した。
アプリ・Terraform 定義の変更はなく、AWS API 呼び出し、plan / apply、デプロイ、アプリのテストは実施していない。
