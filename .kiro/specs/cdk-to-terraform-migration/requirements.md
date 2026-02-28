# 要件ドキュメント

## はじめに

本仕様書は、サーバーレスブログプラットフォームのInfrastructure as Code（IaC）をAWS CDK（TypeScript）からTerraformへ移行するための要件を定義します。この移行は、ベンダーロックインの軽減、マルチクラウド移植性の向上、Terraformの成熟したエコシステムの活用を目的としつつ、既存インフラとの機能的同等性を維持します。

### 現状
- AWS CDK v2（TypeScript）
- 8つのCDKスタック: LayersStack, DatabaseStack, StorageStack, AuthStack, ApiStack, GoLambdaStack, ApiIntegrationsStack, CdnStack, MonitoringStack
- Go Lambda関数（全11関数）
- DynamoDB, S3, CloudFront, Cognito, API Gateway

### 目標状態
- Terraform（HCL）によるモジュラーアーキテクチャ
- 同一構成のAWSリソース
- GitHub Actionsによる継続的なCI/CD統合
- ダウンタイムゼロの移行戦略

### ディレクトリ構造

```
terraform/
├── modules/                    # 再利用可能なモジュール
│   ├── database/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── storage/
│   ├── auth/
│   ├── api/
│   ├── lambda/
│   ├── cdn/
│   └── monitoring/
└── environments/               # 環境別設定
    ├── dev/
    │   ├── main.tf            # モジュール呼び出し
    │   ├── variables.tf       # 環境固有の変数定義
    │   ├── outputs.tf
    │   ├── backend.tf         # S3バックエンド設定（dev用）
    │   └── terraform.tfvars   # 環境固有の値
    └── prd/
        ├── main.tf
        ├── variables.tf
        ├── outputs.tf
        ├── backend.tf         # S3バックエンド設定（prd用）
        └── terraform.tfvars
```

## 要件

### 要件1: Terraformプロジェクト初期化
**目的:** DevOpsエンジニアとして、保守性が高くベストプラクティスに従った構造化されたTerraformプロジェクトが欲しい。

#### 受入基準
1. Terraformプロジェクトは、再利用可能なインフラコンポーネント用の`modules/`ディレクトリと、環境固有の設定用の`environments/`ディレクトリ（dev, prd）を持つ構造であること。
2. Terraformプロジェクトは、Terraformバージョン >= 1.5.0を使用し、必要なプロバイダ制約を定義すること。
3. 各環境ディレクトリ（dev, prd）は、S3とDynamoDBによる状態ロックを使用したリモート状態管理のための独自のバックエンド設定を持ち、環境ごとに分離された状態ファイルを持つこと。
4. Terraformプロジェクトは、ワークスペースではなくディレクトリベースの環境分離（`environments/dev/`、`environments/prd/`）を使用し、独立した状態管理とデプロイを可能にすること。
5. Terraformプロジェクトは、適切な型、説明、バリデーションルールを持つ変数定義を含むこと。
6. 各環境ディレクトリは、環境固有の変数値を使用して`modules/`から共有モジュールを呼び出すこと。
7. `modules/`ディレクトリは、database、storage、auth、api、lambda、cdn、monitoringの再利用可能で環境非依存のTerraformモジュールを含むこと。

---

### 要件2: DynamoDBテーブル移行
**目的:** DevOpsエンジニアとして、ブログデータストレージが同一の動作を維持するよう、DynamoDBテーブル設定を移行したい。

#### 受入基準
1. When Terraform設定が適用された時、DynamoDBモジュールはパーティションキー`id`（String）を持つBlogPostsテーブルを作成すること。
2. DynamoDBモジュールはPAY_PER_REQUEST課金モードを設定すること。
3. DynamoDBモジュールはパーティションキー`category`、ソートキー`createdAt`のCategoryIndex GSIを作成すること。
4. DynamoDBモジュールはパーティションキー`publishStatus`、ソートキー`createdAt`のPublishStatusIndex GSIを作成すること。
5. DynamoDBモジュールはポイントインタイムリカバリを有効化すること。
6. DynamoDBモジュールはAWSマネージドキーによるサーバーサイド暗号化を有効化すること。

---

### 要件3: S3バケット移行
**目的:** DevOpsエンジニアとして、画像ストレージと静的ホスティングが機能し続けるよう、S3バケット設定を移行したい。

#### 受入基準
1. When Terraform設定が適用された時、S3モジュールはバージョニングが有効な画像ストレージバケットを作成すること。
2. S3モジュールは全バケットにSSE-S3暗号化を設定すること。
3. S3モジュールはストレージバケットへの全てのパブリックアクセスをブロックすること。
4. S3モジュールはバージョン管理のためのライフサイクルポリシーを作成すること。
5. S3モジュールは静的ホスティング用の公開サイトバケットと管理画面バケットを作成すること。
6. S3モジュールはCloudFront OACアクセス用の適切なバケットポリシーを設定すること。

---

### 要件4: Cognito認証移行
**目的:** DevOpsエンジニアとして、ユーザー認証がシームレスに動作し続けるよう、Cognito設定を移行したい。

#### 受入基準
1. When Terraform設定が適用された時、CognitoモジュールはEメールベースのサインインを持つUser Poolを作成すること。
2. Cognitoモジュールは現在の要件に合致するパスワードポリシーを設定すること。
3. CognitoモジュールはUSER_PASSWORD_AUTHおよびREFRESH_TOKEN_AUTHフローを持つApp Clientを作成すること。
4. Cognitoモジュールはメール検証設定を構成すること。
5. If MFAが現在設定されている場合、Cognitoモジュールは同等のMFA設定を維持すること。

---

### 要件5: API Gateway移行
**目的:** DevOpsエンジニアとして、全てのAPIエンドポイントが同一に機能するよう、API Gateway設定を移行したい。

#### 受入基準
1. When Terraform設定が適用された時、API Gatewayモジュールは既存の全エンドポイントを持つREST APIを作成すること。
2. API Gatewayモジュールは保護されたエンドポイント用のCognito Authorizerを設定すること。
3. API Gatewayモジュールは現在の設定に合致するCORS設定を構成すること。
4. API Gatewayモジュールは全エンドポイントのLambda統合を作成すること。
5. API Gatewayモジュールは必要に応じてリクエストバリデーションを設定すること。
6. API Gatewayモジュールはdevおよびprdのデプロイステージを作成すること。

---

### 要件6: Go Lambda関数移行
**目的:** DevOpsエンジニアとして、全てのサーバーレス関数が正しくデプロイされるよう、Lambda関数設定を移行したい。

#### 受入基準
1. When Terraform設定が適用された時、LambdaモジュールはARM64アーキテクチャで全11のGo Lambda関数をデプロイすること。
2. Lambdaモジュールは全関数にprovided.al2023ランタイムを設定すること。
3. Lambdaモジュールは現在の設定に合致する適切なメモリサイズとタイムアウト値を設定すること。
4. LambdaモジュールはTABLE_NAME、BUCKET_NAME、その他必要な値の環境変数を設定すること。
5. Lambdaモジュールは各関数グループに最小権限のIAMロールを作成すること。
6. While 本番環境がアクティブな間、Lambdaモジュールはprd環境のみでX-Rayトレーシングを有効化すること。
7. Lambdaモジュールは既存のビルド出力ディレクトリ（`go-functions/bin/`）からGoバイナリを参照すること。

---

### 要件7: CloudFront CDN移行
**目的:** DevOpsエンジニアとして、コンテンツ配信が最適化された状態を維持するよう、CloudFront設定を移行したい。

#### 受入基準
1. When Terraform設定が適用された時、CloudFrontモジュールはOACを使用したS3オリジンのディストリビューションを作成すること。
2. CloudFrontモジュールは全ビューアーに対してHTTPSリダイレクトを設定すること。
3. CloudFrontモジュールはGzipおよびBrotli圧縮を有効化すること。
4. CloudFrontモジュールは適切なTTL設定のキャッシュ動作を構成すること。
5. CloudFrontモジュールはコスト最適化のためPRICE_CLASS_100を使用すること。
6. CloudFrontモジュールは`/api/*`パス用の追加オリジンとしてAPI Gatewayを設定すること。

---

### 要件8: モニタリングインフラ移行
**目的:** DevOpsエンジニアとして、可観測性が維持されるよう、モニタリング設定を移行したい。

#### 受入基準
1. Where 本番環境の場合、MonitoringモジュールはLambdaのエラー、実行時間、スロットル用のCloudWatchアラームを作成すること。
2. Where 本番環境の場合、MonitoringモジュールはDynamoDBの読み取り/書き込みスロットル用のCloudWatchアラームを作成すること。
3. Where 本番環境の場合、MonitoringモジュールはAPI Gatewayの4XX/5XXエラーとレイテンシ用のCloudWatchアラームを作成すること。
4. Where 本番環境の場合、Monitoringモジュールはメールサブスクリプション付きのアラーム通知用SNSトピックを作成すること。
5. MonitoringモジュールはLambda、DynamoDB、API Gatewayのウィジェットを含むCloudWatchダッシュボードを作成すること。

---

### 要件9: 状態移行戦略
**目的:** DevOpsエンジニアとして、既存リソースが再作成されずにインポートされるよう、安全な移行戦略が欲しい。

#### 受入基準
1. 移行は全ての既存AWSリソースのterraform importコマンドを含むこと。
2. 移行はTerraform状態と実際のAWSリソースを比較する検証スクリプトを提供すること。
3. 移行は移行失敗時のロールバック手順を含むこと。
4. 移行はCDK論理IDとTerraformリソースアドレス間のリソースマッピングを文書化すること。
5. If リソースインポートが失敗した場合、移行ドキュメントは手動修復手順を提供すること。

---

### 要件10: CI/CD統合
**目的:** DevOpsエンジニアとして、Terraformデプロイが自動化されるよう、GitHub Actionsワークフローを更新したい。

#### 受入基準
1. When developブランチへのコードプッシュ時、CIワークフローはterraform fmt、validate、planを実行すること。
2. When mainブランチへのマージ時、CIワークフローは承認後に本番環境へTerraform変更を適用すること。
3. CIワークフローはAWS認証情報にOIDC認証を使用すること。
4. CIワークフローはレビュー用にTerraform plan出力をアーティファクトとして保存すること。
5. CIワークフローはモジュール検証用のterraform testを含むこと。

---

### 要件11: ドキュメントとテスト
**目的:** DevOpsエンジニアとして、Terraformコードが保守可能であるよう、包括的なドキュメントとテストが欲しい。

#### 受入基準
1. Terraformプロジェクトは各モジュールの使用方法を記載したREADME.mdを含むこと。
2. Terraformプロジェクトは完全なデプロイ例を含むexamplesディレクトリを含むこと。
3. Terraformプロジェクトは重要なモジュールのterraformテストを含むこと。
4. Terraformプロジェクトはterraform-docsを使用してドキュメントを生成すること。
5. Terraformプロジェクトはフォーマットとバリデーション用のpre-commitフックを含むこと。

---

### 要件12: セキュリティとコンプライアンス
**目的:** DevOpsエンジニアとして、インフラが安全な状態を維持するよう、セキュリティベストプラクティスを維持したい。

#### セキュリティスキャン戦略

Checkov（CI）とTrivy（ローカル）の併用による段階的セキュリティ強化を採用する。

**Phase 1: CI可視化（Checkov導入）**
- GitHub ActionsにCheckovを`soft_fail: true`で導入
- SARIF形式でGitHub Security tabに結果を可視化
- ベースラインリスクを定義し、`.checkov.yaml`でスキップルールを一元管理

**Phase 2: ローカル防御（Trivy導入）**
- pre-commitフックでTrivyを実行
- HIGH/CRITICALレベルをローカルでブロック
- 開発者への仕様周知・教育

**Phase 3: 統合と自動化**
- Checkovを「ハードフェイル（ブロック）」に切り替え
- OPA/Regoを用いた共通カスタムポリシーの検討
- PRコメント自動化と抑制ルール同期スクリプトの整備

#### 受入基準
1. TerraformプロジェクトはCIセキュリティスキャン用にCheckovを統合し、SARIF出力をGitHub Security tabに送信すること。
2. Terraformプロジェクトはローカルpre-commitセキュリティスキャン用にTrivyを統合し、HIGH/CRITICAL重大度の問題をブロックすること。
3. Terraform設定はPhase 3においてCheckovとTrivyの両方のスキャンでHIGHまたはCRITICALの検出なしでパスすること。
4. Terraformプロジェクトは正当な理由を文書化した一元的なスキップルール管理のための`.checkov.yaml`を含むこと。
5. Terraformプロジェクトはローカルスキャン例外用の`.trivyignore`を含み、CIルールと同期させること。
6. Terraform設定は最小権限アクセスの同等のIAMポリシーを維持すること。
7. Terraform設定は保存データの暗号化設定を維持すること。
8. Terraform設定は全てのパブリックエンドポイントでHTTPS強制を維持すること。
9. If 機密変数が使用される場合、Terraform設定はログへの露出を防ぐためそれらをsensitiveとしてマークすること。
10. プロジェクトはセキュリティツールセットアップ（Trivy、pre-commit）のための開発者ドキュメントを含むこと。

