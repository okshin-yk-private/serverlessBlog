# E2E Test User (non-production only)
#
# post-deploy の admin E2E は実 Cognito にログインできるユーザーを必要とするが、
# user pool は allow_admin_create_user_only = true のため利用者が手で作るまで
# 存在しなかった。手動作成だと認証情報の管理場所が定まらないため、Terraform で
# 作成し、パスワードは SSM SecureString 経由でのみ CI に渡す。
#
# パスワードは random_password で生成され、平文がリポジトリにもログにも
# 現れない。値は Terraform state (暗号化された S3 backend) と SSM にのみ入る。
#
# 関連: Issue #520

resource "random_password" "e2e_admin" {
  count = var.create_e2e_test_user ? 1 : 0

  length = 24
  # user pool の password_policy (小文字/大文字/数字/記号すべて必須) を必ず満たす
  min_lower   = 2
  min_upper   = 2
  min_numeric = 2
  min_special = 2
  # 値は GitHub Actions の環境変数を経由して Playwright に渡るため、
  # クォートやバックスラッシュなどシェルで解釈が割れる文字は使わない
  override_special = "!#%*+-=?@^_"
}

resource "aws_cognito_user" "e2e_admin" {
  count = var.create_e2e_test_user ? 1 : 0

  user_pool_id = aws_cognito_user_pool.main.id
  username     = var.e2e_test_user_email

  attributes = {
    email = var.e2e_test_user_email
    # 検証済みにしておかないと FORCE_CHANGE_PASSWORD 相当の状態になり
    # SRP 認証が通らない。実在しないアドレスなので確認メールも送れない。
    email_verified = true
  }

  # temporary_password ではなく password を渡すことで恒久パスワードになり、
  # 初回ログイン時のパスワード変更チャレンジが発生しない
  password = random_password.e2e_admin[0].result

  # 招待メールを送らない (宛先は実在しない)
  message_action = "SUPPRESS"

  lifecycle {
    precondition {
      condition     = var.environment != "prd"
      error_message = "E2E test user must never be created in production."
    }
  }
}

# カテゴリ管理など admin グループを要求する操作を E2E で検証できるようにする
resource "aws_cognito_user_in_group" "e2e_admin" {
  count = var.create_e2e_test_user ? 1 : 0

  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = aws_cognito_user_group.admin.name
  username     = aws_cognito_user.e2e_admin[0].username
}

# CI (deploy.yml の post-deploy E2E) が読み出す。dev の Basic 認証と同じく
# SecureString + --with-decryption で扱う。
resource "aws_ssm_parameter" "e2e_admin_email" {
  #checkov:skip=CKV_AWS_337:Non-production only (a lifecycle precondition blocks prd). SecureString already encrypts at rest with the AWS-managed key; a CMK would only add a key-policy authorization layer, and every principal able to read this parameter already holds AWS account access that exceeds what the dev admin account grants. Revisit if this user is ever created outside non-production.
  count = var.create_e2e_test_user ? 1 : 0

  name        = "/serverless-blog/${var.environment}/e2e/admin-email"
  description = "E2E test admin user email for ${var.environment} environment"
  type        = "SecureString"
  value       = var.e2e_test_user_email

  tags = local.tags
}

resource "aws_ssm_parameter" "e2e_admin_password" {
  #checkov:skip=CKV_AWS_337:Non-production only (a lifecycle precondition blocks prd). SecureString already encrypts at rest with the AWS-managed key; a CMK would only add a key-policy authorization layer, and every principal able to read this parameter already holds AWS account access that exceeds what the dev admin account grants. The value is a random_password regenerated whenever the user is recreated, never a human credential. Revisit if this user is ever created outside non-production.
  count = var.create_e2e_test_user ? 1 : 0

  name        = "/serverless-blog/${var.environment}/e2e/admin-password"
  description = "E2E test admin user password for ${var.environment} environment"
  type        = "SecureString"
  value       = random_password.e2e_admin[0].result

  tags = local.tags
}
