# Environment-specific variable values for dev
# Requirements: 1.6

environment  = "dev"
project_name = "serverless-blog"
aws_region   = "ap-northeast-1"

# alarm_email should be set via environment variable or secrets manager
# alarm_email = "dev-alerts@example.com"

# Basic Auth credentials for dev environment protection
# IMPORTANT: Do NOT store actual credentials in this file!
# Credentials are fetched from AWS Parameter Store by local-deploy.sh:
#   /serverless-blog/dev/basic-auth/username
#   /serverless-blog/dev/basic-auth/password
# The script sets TF_VAR_basic_auth_username and TF_VAR_basic_auth_password
# environment variables automatically.
#
# For manual terraform commands, set environment variables:
#   export TF_VAR_basic_auth_username="your-username"
#   export TF_VAR_basic_auth_password="your-password"

# Custom Domain Configuration
# Set to true to enable custom domain (requires Cloudflare API token in SSM)
enable_custom_domain = true
domain_name          = "dev.boneofmyfallacy.net"
parent_domain        = "boneofmyfallacy.net"

# Cloudflare API Token
# IMPORTANT: Do NOT store actual token in this file!
# Token is fetched from AWS Parameter Store by local-deploy.sh:
#   /serverless-blog/dev/cloudflare/apikey
# The script sets TF_VAR_cloudflare_api_token environment variable automatically.
#
# For manual terraform commands, set environment variable:
#   export TF_VAR_cloudflare_api_token="your-cloudflare-api-token"
