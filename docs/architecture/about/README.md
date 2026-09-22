# About 用の AWS 構成図

既存の 3 ページ版を維持した、別ファイルの 1 ページ版です。本番を中心に、同じ用途のリソースを集約してブログ全体を示します。About ページの掲載コードに組み込み済みです。本番へのデプロイはまだ行っていません。

- [編集用 draw.io](serverless-blog-about.drawio)
- [Web 掲載用 SVG](serverless-blog-about.svg)
- [PNG プレビュー](serverless-blog-about.png)
- [Terraform リソース定義との対応表（JSON）](resource-coverage.json)
- [使用した AWS 公式 SVG と SHA-256](aws-icon-manifest.json)

## 前提と信頼性

2026-09-22 にローカルの Terraform、アプリケーション、デプロイ定義を確認しました。参照コミットは `357fbc8a3541163317575ffaa5be28451d2058be`。カスタムドメインを有効化する本番デプロイ設定を前提にしています。AWS 実環境への照会は行っておらず、デプロイ済みリソース数・通知購読の確認状態・環境間のアカウント分離を保証する図ではありません。

表記は [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) の公式アイコン・グループ境界・接続線ガイドに準拠しています。公式 SVG は色・縦横比を保って埋め込み、ラベルと矢印は draw.io で編集できます。これは表記の準拠であり、このシステム自体が AWS の推奨リファレンスアーキテクチャ、または AWS による審査済み設計という意味ではありません。専用アイコンを確認できなかった CloudFront KeyValueStore と AWS 外のシステムは名前付きの汎用ボックスです。

## 網羅範囲と集約

リソースをすべて個別アイコンにすると紹介図の可読性が下がるため、以下の単位で集約しています。設定リソースも対応するサービスに含めています。[対応表](resource-coverage.json) は PRD / DEV が参照するモジュール、環境直下、bootstrap の `resource` ブロックを図の cell ID に対応付けたものです。`count` / `for_each` や環境条件を展開した実インスタンス数ではありません。

| 図のサービス                         | 含むリソース・設定                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudFront                           | Distribution、4 origins、S3 OAC、cache / origin request / response headers policies、behaviors、TLS・ログ関連設定                                                                                    |
| CloudFront Functions / KeyValueStore | 公開・管理画面・画像・API の URI 書換え、公開 revision の参照・切替。定義済みの旧 public SPA 関数と DEV の Basic 認証も集約                                                                          |
| S3（アプリ）                         | 公開サイト・管理画面・画像の 3 バケット、bucket policies、暗号化、public access block、versioning、lifecycle、CORS、server access logging                                                            |
| S3（運用）                           | アクセスログ用バケット、bootstrap の Terraform state バケット、各付随設定。S3 native locking を使用                                                                                                  |
| API Gateway                          | Regional REST API、Cognito authorizer、validator、resources / methods / integrations / responses、deployment / stage、access logs、method settings、account 設定                                     |
| Lambda（API）                        | 記事関連 8、認証 3、画像 2、カテゴリ 5 の計 18 関数、環境変数・実行設定・呼び出し権限                                                                                                                |
| Lambda（再調整）                     | `reconcile_build_post` 1 関数。CodeBuild の実状態と DynamoDB の要求状態を照合し、必要に応じて後続ビルドを起動                                                                                        |
| DynamoDB                             | posts / categories の 2 テーブル、インデックス・PITR 等の設定。ビルド状態は posts 内に保存され、専用の第 3 テーブルはない                                                                            |
| Cognito                              | User pool、app client、管理者 group。DEV のテスト用ユーザー・group membership・生成パスワードもこのサービスに集約                                                                                    |
| CodeBuild                            | Astro 用 project、ソース・環境・ビルド設定。生成物の S3 配置後に CloudFront KeyValueStore を更新                                                                                                     |
| EventBridge / Scheduler / SQS        | CodeBuild 状態変更ルールと target、5 分周期 schedule、EventBridge target 用 DLQ と queue policy。Scheduler に DLQ は設定されていない                                                                 |
| CloudWatch                           | Lambda / API Gateway / CodeBuild の log groups、メトリクスアラーム、dashboard。本番 DynamoDB アラームの入力対象は posts                                                                              |
| SNS                                  | アラーム通知 topic、topic policy、email subscription                                                                                                                                                 |
| X-Ray                                | 本番 Lambda / API Gateway のトレース有効化設定。独立した Terraform resource ではない。全経路のトレース取得を保証しない                                                                               |
| Systems Manager                      | Parameter Store の認証・バケット・CDN・CodeBuild 関連パラメーター。DEV のテスト用パラメーターを含む                                                                                                  |
| IAM                                  | 各サービスの roles / policies / attachments、Scheduler 実行権限、API Gateway の CloudWatch 出力権限。Actions が利用する既存ロールはワークフロー参照であり、この Terraform で新規作成するとは限らない |
| ACM                                  | us-east-1 の CloudFront 用 certificate と validation                                                                                                                                                 |
| Cloudflare / Route 53                | 本番 Cloudflare の DNS-only records と証明書検証。DEV の Route 53 zone、A / AAAA alias、証明書検証 records。Route 53 は図の下部に注記。Cloudflare 側の DEV 委任設定も外部 DNS に集約                 |
| GitHub                               | リポジトリと Actions。AWS リソースではないがソース取得・デプロイ元として表示                                                                                                                         |

VPC 接続を持たない Lambda とリージョンサービスとして描画しています。呼び出されていない `agentcore` モジュールや、定義のない WAF / ALB / Step Functions などは含めていません。データソース・タグ・個別ポリシー文・API メソッドは独立したアイコンにはしていません。

## 矢印を省略した関係

主経路は `ブラウザ → CloudFront → API Gateway → Lambda → DynamoDB` と、静的配信・記事公開・完了通知・定期照合です。応答の逆方向、各サービスへのログ・指標・トレース、IAM 権限の付与、SSM 設定取得、Actions による全サービスへのデプロイは省略しています。

ほかに、Lambda から Cognito への認証 API 呼出し、画像操作の S3 アクセス、再調整 Lambda から CodeBuild への状態照会・後続起動、CodeBuild の GitHub ソース取得および公開記事 API の取得を省略しています。ビルド時の記事取得も `CloudFront → API Gateway → Lambda` を通ります。署名付き URL によるブラウザから S3 への直接 PUT は注記しています。

破線矢印は設定上の関連付けを表します。Cognito authorizer の関連付けを含み、実行時のトークン検証の各内部通信を図示するものではありません。

## 参照コード

- [本番モジュール構成](../../../terraform/environments/prd/main.tf)
- [開発モジュール構成](../../../terraform/environments/dev/main.tf)
- [CDN と Functions](../../../terraform/modules/cdn/main.tf)
- [EventBridge・Scheduler・DLQ](../../../terraform/modules/lambda/sitebuild_events.tf)
- [Terraform state bootstrap](../../../terraform/bootstrap/main.tf)
- [デプロイワークフロー](../../../.github/workflows/deploy.yml)

図の更新時は draw.io 編集後に SVG / PNG を再出力してください。掲載用 SVG は `frontend/public-astro/src/assets/blog-architecture.svg` に配置し、SVG のルートに `color-scheme: only light` を指定して公式アイコンの配色を維持します。図の縦横サイズが変わった場合は `about.astro` の画像の `width` / `height` も合わせて更新してください。

About では本文幅いっぱいに表示し、画像または原寸リンクから別タブで開けます。SVG は Astro のアセットとして取り込み、ビルド時にハッシュ付きの `/_astro/` URL になります。

2026-09-22 の掲載作業ではユーザーが調整した配置・接続線を維持し、KeyValueStore のラベルのみ「CloudFront KeyValueStore / 公開中のバージョンを保持」に修正しました。更新主体は CodeBuild 内のデプロイスクリプト、参照主体は CloudFront Functions です。
