# セキュリティツールセットアップガイド

本ドキュメントは、Terraformインフラストラクチャのセキュリティスキャン環境をセットアップするための手順を説明します。

## 概要

本プロジェクトでは、以下のセキュリティスキャンツールを使用します：

| ツール | 用途 | 実行環境 | フェーズ |
|-------|------|---------|---------|
| **Trivy** | ローカルセキュリティスキャン | pre-commit | Phase 2 |
| **Checkov** | CIセキュリティスキャン | GitHub Actions | Phase 1 |

## 前提条件

- Python 3.8以上
- Terraform 1.14.0以上
- Git
- brew (macOS) または apt (Ubuntu)

## Trivyのインストール

### macOS

```bash
brew install trivy
```

### Ubuntu/Debian

```bash
sudo apt-get install wget apt-transport-https gnupg lsb-release
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main | sudo tee /etc/apt/sources.list.d/trivy.list
sudo apt-get update
sudo apt-get install trivy
```

### バージョン確認

```bash
trivy --version
# Trivy Version: 0.58.2 以上を推奨
```

## pre-commitのインストール

### pipでインストール

```bash
pip install pre-commit
```

### Homebrewでインストール (macOS)

```bash
brew install pre-commit
```

### バージョン確認

```bash
pre-commit --version
# pre-commit 4.0.0 以上を推奨
```

## pre-commitフックの有効化

```bash
# terraformディレクトリに移動
cd terraform

# pre-commitフックをインストール
pre-commit install

# 出力例:
# pre-commit installed at .git/hooks/pre-commit
```

## 使用方法

### コミット時の自動実行

pre-commitフックをインストールすると、`git commit`実行時に自動的にセキュリティスキャンが実行されます。

```bash
git add .
git commit -m "feat: Add new module"

# 出力例:
# Terraform Format...........................................................Passed
# Terraform Validate.........................................................Passed
# Terraform Docs.............................................................Passed
# Trivy IaC Scan.............................................................Passed
# Trailing Whitespace........................................................Passed
# End of File Fixer..........................................................Passed
# Check YAML.................................................................Passed
# Check Large Files..........................................................Passed
# No Commit to Protected Branches............................................Passed
```

### 手動実行

```bash
# すべてのファイルをスキャン
pre-commit run --all-files

# 特定のフックのみ実行
pre-commit run trivy-config --all-files
pre-commit run terraform_fmt --all-files
pre-commit run terraform_validate --all-files
```

### Trivy単独実行

pre-commitを使用せずにTrivyを直接実行することもできます：

```bash
# terraformディレクトリでスキャン
cd terraform
trivy config --severity HIGH,CRITICAL --exit-code 1 --ignorefile .trivyignore .

# 特定のモジュールをスキャン
trivy config --severity HIGH,CRITICAL modules/database

# 詳細出力
trivy config --severity HIGH,CRITICAL --format json .
```

## スキップ設定

### .trivyignoreファイル

特定のセキュリティルールを例外として登録する場合は、`.trivyignore`ファイルを編集します：

```bash
# terraform/.trivyignore
AVD-AWS-0089  # S3バケットロギング無効化（正当な理由あり）
AVD-AWS-0066  # Lambda DLQ未設定（同期関数のため不要）
```

### 一時的なスキップ

特定のコミットでセキュリティスキャンをスキップする場合：

```bash
# Trivyスキャンをスキップ
SKIP=trivy-config git commit -m "WIP: temporary commit"

# すべてのフックをスキップ
git commit --no-verify -m "emergency fix"
```

**注意**: `--no-verify`の使用はセキュリティリスクを伴います。本番環境へのマージ前に必ずセキュリティスキャンを実行してください。

## トラブルシューティング

### Trivyが見つからない

```bash
# パスを確認
which trivy

# インストールされていない場合は再インストール
brew install trivy  # macOS
```

### pre-commitフックが実行されない

```bash
# フックを再インストール
cd terraform
pre-commit install --force

# フックの状態を確認
ls -la ../.git/hooks/pre-commit
```

### Trivy実行時エラー

```bash
# キャッシュをクリア
trivy clean --all

# データベースを更新
trivy image --download-db-only
```

### terraform validateエラー

```bash
# 初期化が必要な場合
cd terraform/environments/dev
terraform init

# バックエンド設定をスキップ（ローカルバリデーションのみ）
terraform validate
```

## セキュリティルールの同期

Checkov（`.checkov.yaml`）とTrivy（`.trivyignore`）のスキップルールは同期を維持する必要があります：

1. 新しいスキップルールを追加する場合、両方のファイルを更新
2. 正当な理由を必ず文書化
3. 定期的にスキップルールをレビュー

### ルールマッピング例

| Checkov ID | Trivy ID | 説明 |
|------------|----------|------|
| CKV_AWS_18 | AVD-AWS-0089 | S3アクセスログ |
| CKV_AWS_119 | AVD-AWS-0025 | DynamoDB CMK暗号化 |
| CKV_AWS_116 | AVD-AWS-0066 | Lambda DLQ |
| CKV_AWS_158 | AVD-AWS-0017 | CloudWatch CMK |

## CI/CD統合

### ローカルとCIの役割分担

- **ローカル（Trivy + pre-commit）**: 開発時の迅速なフィードバック
- **CI（Checkov）**: PRマージ時の包括的なセキュリティゲート

### ワークフロー

1. 開発者がコードを変更
2. `git commit` → Trivyが自動実行
3. HIGH/CRITICALがあればコミット失敗
4. 問題修正後、再コミット
5. PRを作成
6. GitHub ActionsでCheckovが実行
7. Security tabで結果を確認
8. レビュー・マージ

## 参考リンク

- [Trivy ドキュメント](https://aquasecurity.github.io/trivy/)
- [Trivy AVD (Aqua Vulnerability Database)](https://avd.aquasec.com/)
- [pre-commit ドキュメント](https://pre-commit.com/)
- [Checkov ドキュメント](https://www.checkov.io/)
- [pre-commit-terraform](https://github.com/antonbabenko/pre-commit-terraform)

## サポート

問題が発生した場合は、以下を確認してください：

1. ツールのバージョンが最新であること
2. `.trivyignore`と`.checkov.yaml`の同期
3. `terraform validate`が成功すること
4. GitHubのSecurity tabでCheckov結果を確認
