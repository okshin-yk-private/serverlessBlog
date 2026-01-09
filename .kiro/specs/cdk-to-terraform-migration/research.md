# リサーチ＆設計決定記録

---
**目的**: 技術設計に反映すべきディスカバリー結果、アーキテクチャ調査、根拠の記録

**使用方法**:
- ディスカバリーフェーズ中のリサーチ活動と結果をログに記録
- `design.md`には詳細すぎる設計決定のトレードオフを文書化
- 将来の監査や再利用のための参照とエビデンスを提供
---

## サマリー
- **機能**: CDK to Terraform Migration
- **ディスカバリー範囲**: Complex Integration（既存CDKインフラの完全移行）
- **主要な発見**:
  1. 現行CDKは8スタック、11のGo Lambda関数、複数のAWSサービス（DynamoDB、S3、CloudFront、Cognito、API Gateway）で構成
  2. Terraform 1.5+のimportブロック機能により、コードベース内でリソースインポートを宣言的に管理可能
  3. Checkov（CI）とTrivy（ローカル）の組み合わせが段階的セキュリティ強化に最適

## リサーチログ

### 現行CDKインフラ構成分析
- **コンテキスト**: 移行対象の既存インフラの完全把握
- **参照ソース**: `infrastructure/lib/*.ts`の全スタックコード
- **発見**:
  - **DatabaseStack**: DynamoDB PAY_PER_REQUEST、2つのGSI（CategoryIndex、PublishStatusIndex）、PITR有効
  - **StorageStack**: 3つのS3バケット（images、public-site、admin-site）、SSE-S3暗号化、ライフサイクルルール
  - **AuthStack**: Cognito User Pool、パスワードポリシー（12文字、記号必須）、MFA OPTIONAL
  - **ApiStack**: REST API、Cognito Authorizer、CORS設定、devとprodのステージ分離
  - **GoLambdaStack**: 11のGo Lambda関数、ARM64、provided.al2023ランタイム
  - **CdnStack**: 統合CloudFrontディストリビューション、OAC使用、API Gateway統合（/api/*パス）
  - **MonitoringStack**: CloudWatchアラーム、SNS通知、ダッシュボード
- **影響**: Terraformモジュール構成は現行CDKスタックのドメイン境界を反映すべき

### Terraform移行ベストプラクティス
- **コンテキスト**: CDKからTerraformへの移行における最新のベストプラクティス調査
- **参照ソース**:
  - [AWS CDK vs Terraform: The Complete 2026 Comparison](https://towardsthecloud.com/blog/aws-cdk-vs-terraform)
  - [Terraform vs Pulumi vs AWS CDK: 2025 Decision Framework](https://sanj.dev/post/terraform-pulumi-aws-cdk-2025-decision-framework)
  - [SST, AWS CDK, AWS CloudFormation migration to Terraform](https://martinmueller.dev/aws-sst-cdk-to-tf/)
- **発見**:
  - CDKからTerraformへの移行は段階的アプローチが推奨される
  - Terraformは宣言的言語（HCL）で、インフラ状態を明示的に管理
  - terraform importを使用して既存リソースをインポート可能
  - マルチクラウド対応はTerraformの主要な利点
- **影響**: モジュラー設計で段階的移行を実現、CDKスタック単位での移行が可能

### Terraformリソースインポート戦略
- **コンテキスト**: 既存AWSリソースのゼロダウンタイムインポート方法
- **参照ソース**:
  - [Complete Guide On Terraform Import Existing Resources](https://zeet.co/blog/terraform-import-existing-resources)
  - [Master Terraform: Import Existing AWS Resources Easily](https://krausen.io/blog/importing-existing-resources-into-terraform-using-the-import-block/)
  - [How to import all existing AWS resources into Terraform](https://foxmeyson.github.io/terraform/2025/02/25/move-all-existing-AWS-resources-into-terraform.html)
- **発見**:
  - **importブロック（Terraform v1.5.0+）**: コード内で宣言的にインポートを定義、CI/CDフレンドリー
  - **terraform import CLI**: 単一リソースの一回限りのインポートに適切
  - **TerraCognita**: 自動TFファイル生成ツール、大規模インポートに有用
  - **create_before_destroy**: ゼロダウンタイムデプロイの基本手法
  - **Blue-Green戦略**: 新環境を作成後、トラフィックを切り替え
- **影響**: importブロックを採用し、モジュールごとの段階的インポートを実施

### セキュリティスキャンツール比較
- **コンテキスト**: IaCセキュリティスキャンツールの選定
- **参照ソース**:
  - [Top 7 Terraform Scanning Tools You Should Know in 2026](https://spacelift.io/blog/terraform-scanning-tools)
  - [Comparing Checkov vs. tfsec vs. Terrascan](https://www.env0.com/blog/best-iac-scan-tool-comparing-checkov-vs-tfsec-vs-terrascan)
  - [checkov.io](https://www.checkov.io/)
- **発見**:
  - **Checkov**: Bridgecrew/Palo Alto製、グラフベース解析、CIS/HIPAA/PCI DSS準拠、GitHub Actions統合容易
  - **Trivy**: Aqua製、tfsecの後継、コンテナとIaC統合スキャン、pre-commitフック対応
  - **tfsec**: Trivyに統合済み、新機能開発は終了
  - **推奨**: Checkov（CI） + Trivy（ローカル）の組み合わせ
- **影響**: 要件12のセキュリティスキャン戦略（Phase 1-3）に合致

### OpenTofu vs Terraform ライセンス考慮
- **コンテキスト**: HashiCorpライセンス変更の影響評価
- **参照ソース**:
  - [Terraform vs OpenTofu: Which IaC tool fits your platform strategy?](https://platformengineering.org/blog/terraform-vs-opentofu-iac-tool)
  - [OpenTofu vs Terraform: Key Differences and Comparison](https://spacelift.io/blog/opentofu-vs-terraform)
  - [Terraform Licensing: The 2023 Change Still Shaping Your 2025 Strategy](https://dev.to/terraformmonkey/terraform-licensing-the-2023-change-still-shaping-your-2025-strategy-4mfb)
- **発見**:
  - 2023年にHashiCorpがMPLからBSLへライセンス変更
  - OpenTofuはMPL 2.0ライセンスのフォーク、Linux Foundation管理
  - 両者はTerraform 1.6.xまでの互換性を維持
  - OpenTofu独自機能: 状態暗号化（1.7）、早期変数評価（1.8）
  - Terraform OSSは2025年7月以降サポート終了予定
- **影響**: 現時点ではTerraformを使用、将来的なOpenTofu移行オプションを考慮した設計

### Terraformモジュール構造
- **コンテキスト**: AWS サーバーレスアーキテクチャのベストプラクティス
- **参照ソース**:
  - [serverless.tf](https://serverless.tf/)
  - [terraform-aws-modules/lambda](https://registry.terraform.io/modules/terraform-aws-modules/lambda/aws)
  - [A Better Way to Write Production-Ready Terraform](https://dev.to/aws-builders/a-better-way-to-write-production-ready-terraform-part-2-remote-state-management-1j5d)
- **発見**:
  - マイクロサービス戦略: コンポーネントごとに別フォルダ/モジュール
  - terraform-aws-modulesの活用で検証済みパターンを再利用
  - S3 + DynamoDB状態ロック（Terraform 1.10+ではネイティブS3ロック対応）
  - 環境分離: ワークスペースよりディレクトリベースが推奨
- **影響**: `modules/` + `environments/{dev,prd}/`構造を採用

## アーキテクチャパターン評価

| オプション | 説明 | 強み | リスク/制限 | 備考 |
|-----------|------|------|------------|------|
| モノリシックHCL | 単一ディレクトリに全リソース | シンプル、初期設定容易 | 大規模化で管理困難 | 小規模プロジェクト向け |
| モジュラー構造 | 機能別モジュール + 環境別ディレクトリ | 再利用性、分離、テスト容易 | 初期設定コスト | 本プロジェクトに最適 |
| Terragrunt | DRYラッパー | 環境間の重複削減 | 追加ツール依存 | 過剰な複雑性 |

**選択**: モジュラー構造（modules/ + environments/）
**根拠**: 現行CDKスタック構成との整合性、段階的移行の容易さ、チーム学習曲線

## 設計決定

### 決定: ディレクトリベース環境分離の採用
- **コンテキスト**: dev/prd環境の独立管理が必要
- **検討した代替案**:
  1. Terraformワークスペース — 単一設定で複数環境、状態は分離
  2. ディレクトリベース — 環境ごとに完全に分離されたディレクトリ
- **選択したアプローチ**: ディレクトリベース（environments/dev/, environments/prd/）
- **根拠**:
  - 環境ごとの独立したバックエンド設定が可能
  - 誤った環境への適用リスクを軽減
  - 環境固有のリソース差異（Basic認証、モニタリング設定）を明示的に管理
- **トレードオフ**: モジュール呼び出しコードの重複 vs 環境分離の明確性
- **フォローアップ**: 実装時にモジュール変数のDRY化を検討

### 決定: terraform importブロック方式の採用
- **コンテキスト**: 既存リソースのインポート方法選定
- **検討した代替案**:
  1. terraform import CLI — 手動で一つずつインポート
  2. importブロック（Terraform 1.5+） — HCL内で宣言的にインポート定義
  3. TerraCognita — 自動TFファイル生成
- **選択したアプローチ**: importブロック
- **根拠**:
  - CI/CDパイプラインでのレビュー・追跡が容易
  - 複数リソースの一括インポートに対応
  - コードとしてバージョン管理可能
- **トレードオフ**: Terraform 1.5+必須 vs 宣言的管理の利点
- **フォローアップ**: インポート実行前にterraform planで差分確認必須

### 決定: Checkov + Trivyデュアルツール戦略
- **コンテキスト**: セキュリティスキャンツールの選定
- **検討した代替案**:
  1. Checkovのみ — CI + ローカル両方
  2. Trivyのみ — CI + ローカル両方
  3. Checkov（CI） + Trivy（ローカル） — 役割分担
- **選択したアプローチ**: Checkov（CI） + Trivy（ローカル）
- **根拠**:
  - Checkov: GitHub Security tab統合、SARIF出力、ポリシー管理に優れる
  - Trivy: pre-commitフック統合、高速なローカルスキャン
  - 要件12の3フェーズ戦略に合致
- **トレードオフ**: ツール2つの学習・管理コスト vs 多層防御
- **フォローアップ**: Phase 3での統合ポリシー管理の詳細設計

### 決定: CDKスタック単位での段階的移行
- **コンテキスト**: 移行戦略の粒度決定
- **検討した代替案**:
  1. ビッグバン移行 — 全リソース一括
  2. リソースタイプ別移行 — S3, DynamoDB, etc.
  3. CDKスタック単位移行 — Database, Storage, Auth, etc.
- **選択したアプローチ**: CDKスタック単位移行
- **根拠**:
  - 既存のドメイン境界を尊重
  - 依存関係が明確（DatabaseStack → GoLambdaStack等）
  - 移行失敗時のロールバック範囲を限定
- **トレードオフ**: 移行期間の長期化 vs リスク軽減
- **フォローアップ**: 移行順序の依存関係マップを作成

### 決定: アカウント別状態バケットの採用
- **コンテキスト**: dev/prd環境は異なるAWSアカウントにデプロイされるため、状態管理戦略の決定が必要
- **検討した代替案**:
  1. 単一アカウントの共有S3バケット — 全環境の状態を1バケットに集約
  2. アカウント別S3バケット — 各アカウント内に状態バケットを作成
  3. Terraform Cloud/Enterprise — SaaSによる状態管理
- **選択したアプローチ**: アカウント別S3バケット（`terraform-state-{ACCOUNT_ID}`）
- **根拠**:
  - 環境間の完全な分離によるセキュリティ強化
  - クロスアカウントアクセス設定の複雑性を回避
  - 各アカウントのIAM権限で状態アクセスを制御可能
  - バケット名の一意性をアカウントIDで保証
- **トレードオフ**: 各アカウントでのブートストラップ実行が必要 vs セキュリティ分離
- **フォローアップ**: bootstrapモジュールで自動作成、prevent_destroyで保護

### 決定: ブートストラップモジュールによる状態バックエンド自動作成
- **コンテキスト**: 状態バケットとロックテーブルが存在しない場合の初期化方法
- **検討した代替案**:
  1. 手動作成 — AWSコンソールまたはCLIで事前作成
  2. CloudFormation — 別途CFnスタックで作成
  3. Terraformブートストラップモジュール — Terraform自体で作成
- **選択したアプローチ**: Terraformブートストラップモジュール（`bootstrap/`）
- **根拠**:
  - 全インフラをTerraformで一元管理
  - 手順の自動化と再現性
  - 出力値を環境設定に直接利用可能
- **トレードオフ**: 初回実行時はローカル状態（鶏と卵問題）vs 完全自動化
- **フォローアップ**: ブートストラップ実行手順のドキュメント整備

## リスクと軽減策

| リスク | 説明 | 軽減策 |
|-------|------|--------|
| 状態ファイルの破損 | terraform import中の状態ファイル破損 | S3バージョニング有効化、インポート前のバックアップ |
| リソース再作成 | 設定ミスによる既存リソースの再作成 | plan出力の厳格なレビュー、import後のno-opプラン確認 |
| ダウンタイム | 移行中のサービス停止 | Blue-Green戦略、段階的移行、ロールバック手順整備 |
| セキュリティ回帰 | CDK Nag相当のセキュリティチェック欠落 | Checkov/Trivyで同等のルールカバレッジ確保 |
| 認証情報漏洩 | Terraform変数でのシークレット露出 | sensitive変数、AWS Secrets Manager連携 |
| OpenTofu移行 | 将来的なライセンス変更リスク | HCL互換性維持、プロバイダ固有機能の最小化 |

## 参照

- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs) — 公式AWSプロバイダドキュメント
- [serverless.tf](https://serverless.tf/) — Terraformサーバーレスベストプラクティス
- [terraform-aws-modules](https://github.com/terraform-aws-modules) — 検証済みAWSモジュール集
- [Checkov Documentation](https://www.checkov.io/1.Welcome/Quick%20Start.html) — IaCセキュリティスキャン
- [Trivy Documentation](https://aquasecurity.github.io/trivy/) — 統合セキュリティスキャナー
- [OpenTofu Project](https://opentofu.org/) — Terraformフォーク（将来参照用）
