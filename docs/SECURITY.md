# セキュリティ

実装済みの対策と、検討したうえで見送った対策の判断をまとめる。スキャナの運用は
[SECURITY_SCANNING.md](./SECURITY_SCANNING.md)、監視は [monitoring.md](./monitoring.md) を参照。

## 前提: リポジトリは公開されている

このリポジトリは **PUBLIC** である。Terraform、ワークフロー、CloudFront Functions のコードは
誰でも読める前提で設計する。

- 秘密情報はコードにも Terraform の変数既定値にも置かない（GitHub Secrets / SSM Parameter Store）。
- `deploy.yml` の `::add-mask::`（AWS アカウント ID、バケット名、ディストリビューション ID など）はログの衛生対策である。
  公開リポジトリでは構成そのものが読めるため、これを防御策として数えない。
- 以前の版にあった「Private リポジトリなので攻撃対象面が小さい」という前提は、現状に当てはまらないため削除した。

## 実装済みの対策

| 層 | 対策 | 実装箇所 |
| --- | --- | --- |
| CI/CD | GitHub OIDC で AWS ロールを引き受ける（長期のアクセスキーなし） | `.github/workflows/deploy.yml`（ロールは Terraform 管理外） |
| CI/CD | Checkov / Trivy / gitleaks / CodeQL / govulncheck | [SECURITY_SCANNING.md](./SECURITY_SCANNING.md) |
| エッジ | スキャナが狙うパス（`.env`、`.git`、`wp-admin` など）を、キャッシュやオリジンに届く前に 404 で返す | `terraform/modules/cdn/functions/viewer-guard.js.tftpl` |
| エッジ | セキュリティヘッダー（HSTS 1 年、`X-Frame-Options: DENY`、`nosniff`、CSP、Referrer-Policy）。公開サイトと管理画面で別のポリシー | `terraform/modules/cdn/main.tf` の `aws_cloudfront_response_headers_policy` |
| エッジ | DEV は Basic 認証 + セッション Cookie | 同上 `viewer-guard`、[DEV_BASIC_AUTH.md](./DEV_BASIC_AUTH.md) |
| API | ステージ全体 100 rps / バースト 200、管理系の書き込みメソッドは 10 rps / バースト 20 | `terraform/modules/api/variables.tf` |
| API | 管理 API は Cognito オーソライザー必須 | `terraform/modules/api/main.tf` |
| 認証 | PRD は MFA 必須（TOTP）、DEV は任意。ユーザーの存在を応答で漏らさない（`prevent_user_existence_errors`） | `terraform/modules/auth/main.tf`、[admin-totp-rollout.md](./security/admin-totp-rollout.md) |
| データ | S3 はパブリックアクセスを全面ブロック、SSE-S3、TLS 以外を拒否 | `terraform/modules/storage/main.tf` |
| データ | DynamoDB は保存時暗号化、PITR（DEV / PRD）、削除保護（PRD） | `terraform/modules/database/main.tf` |
| 監視 | Lambda / API Gateway / DynamoDB / CloudFront のアラーム（PRD） | [monitoring.md](./monitoring.md) |

## 見送った対策と、その判断

### AWS WAF は導入しない（2026-10-31 時点）

**判断**: CloudFront に AWS WAF の Web ACL は付けない。次の「再評価の条件」のどれかに当たったら見直す。

**理由**

1. **守りたいものに対して、WAF の追加効果が小さい。**
   - L3/L4 の DDoS は、追加料金なしで自動適用される AWS Shield Standard の対象である。
   - 既知のスキャナのパスは `viewer-guard` がエッジで落とす（#682）。
   - オリジンにかかる費用は、API Gateway のスロットリングで上限を抑えている。
   - 不特定のユーザーが入力するフォーム（コメント、問い合わせなど）はない。
     管理画面は Cognito の認証と PRD での MFA 必須で守っている。
2. **固定費がブログの規模に見合わない。**
   - 最小構成でも約 $7/月かかる（Web ACL $5 + Core rule set $1 + レートベースルール $1。リクエストは $0.60/100 万件）。
     ブログの他の AWS 費用と比べて大きい。
3. **CloudFront の定額料金プラン（WAF を含む）は、現行構成では使えない見込み。**
   - KeyValueStore と標準ログは Pro（$15/月）以上でないと使えない。
   - 独自のキャッシュポリシー、オリジンリクエストポリシー、レスポンスヘッダーポリシーは Business（$200/月）以上でないと使えない。
   - 本ディストリビューションはこのすべてを使っているため、そのまま加入できるのは実質 Business 以上と見ている。

**受け入れているリスク**

- **L7 の HTTP フラッドによる課金（Denial of Wallet）。**
  Shield Standard は L7 を守らない。
  CloudFront のリクエスト課金と、オリジン（API Gateway / Lambda / Lambda@Edge）の呼び出し課金は、WAF がないと IP 単位で止められない。
  CloudFront 自体には、WAF なしで使える IP 単位のレート制限機能がない。
- 検知の手段は、CloudFront のリクエスト数アラーム（`serverless-blog-public-traffic`）と Cost Anomaly Detection（導入済み、Terraform 管理外）。
  AWS Budgets は未導入。

**再評価の条件（どれか 1 つに当たったら見直す）**

1. 月額費用、または CloudFront のリクエスト数が、通常の 3〜5 倍以上になった。
2. 不特定のユーザーが入力するフォームやログインを公開する。
3. 標準ログで、オリジンや Lambda に届く攻撃的なリクエストが継続して見つかった。
4. 管理画面の公開範囲や認証方式を弱める変更をする。

**導入する場合の構成（メモ）**

- Web ACL は CLOUDFRONT スコープなので、`us-east-1` に作る。
- ルールは次の 3 つ: Core rule set（最初は Count で様子を見る）、Known bad inputs、IP 単位のレートベースルール。
- Core rule set の `SizeRestrictions_BODY` は 8 KB を超える本文をブロックするため、記事を保存する管理 API で誤検知する。
  このルールは除外するか、対象を絞る（scope-down）。
- 定額プランを検討するなら、独自ポリシーを AWS マネージドポリシーに置き換えられるかを先に確認する。
  加入するとディストリビューションから Web ACL を外せなくなり、解約は請求サイクルの終了時まで反映されない。
  加入できるかは DEV で確かめる。

**参照**（2026-10-31 確認）

- AWS WAF 料金: https://aws.amazon.com/waf/pricing/
- マネージドルールグループと追加料金: https://docs.aws.amazon.com/waf/latest/developerguide/waf-managed-rule-groups.html
- Core rule set の各ルール: https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html
- CloudFront の定額料金プラン: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html
- Shield Standard: https://docs.aws.amazon.com/waf/latest/developerguide/ddos-standard-summary.html

注: WAF 料金ページの表は直接取得できず、上記の金額はページ内の計算例から読み取った。導入を判断するときは改めて確認する。

### その他

- **Lambda の予約同時実行数**: 設定していない（Checkov CKV_AWS_115 の skip 理由を参照）。
  公開サイトは SSG なので、実行時に Lambda を呼ぶのは主に管理画面である。
- **Lambda の VPC 配置、コード署名**: 見送り。理由は `terraform/.checkov.yaml` の CKV_AWS_117 / CKV_AWS_272。

## アカウント単位の設定（Terraform 管理外）

次の設定はこのリポジトリでは管理していない。有効かどうかはコンソールで確認する。

| 設定 | 状態 |
| --- | --- |
| Cost Anomaly Detection | 導入済み |
| AWS Budgets | 未導入 |
| GuardDuty / Security Hub | 未確認 |
| root ユーザーの MFA、IAM Access Analyzer | 未確認 |

## インシデント時の初動

1. **範囲を特定する**: CloudTrail で不審な API 呼び出しを確認し、CloudWatch Logs で `requestId` から追跡する
   （[structured-logging.md](./structured-logging.md)）。
2. **隔離する**: GitHub の `AWS_ROLE_ARN` のロールの信頼ポリシーを無効にする。必要なら API Gateway のステージのスロットリングを 0 にする。
3. **認証情報を失効させる**: Cognito ユーザーのセッションを取り消し、漏れた可能性のあるシークレット（SSM、GitHub Secrets）を更新する。
4. **データを戻す**: DynamoDB は PITR、S3 はバージョニングから戻す。
5. **記録する**: 原因と再発防止策を Issue に残す。

## 定期確認（月次）

- [ ] Code scanning のアラート（[SECURITY_SCANNING.md](./SECURITY_SCANNING.md)）
- [ ] Cost Anomaly Detection の通知と、月額費用の推移（WAF の再評価条件 1）
- [ ] CloudFront 標準ログに出ている攻撃的なリクエストの傾向（WAF の再評価条件 3）
- [ ] `terraform/.checkov.yaml` の skip で、`Review-by` の期限を過ぎたもの
