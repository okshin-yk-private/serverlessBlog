# 移行前後のサービス疎通テスト手順書

CDKからTerraformへの移行前後に実施するサービス疎通テストの手順を説明します。

**Requirements: 9.2**

## 概要

この手順書は、移行が正常に完了し、すべてのサービスが期待通りに動作していることを確認するためのテスト手順を提供します。

### テストレベル

1. **インフラ検証**: AWS リソースの存在と設定確認
2. **接続性テスト**: ネットワークとエンドポイントの疎通確認
3. **機能テスト**: API とアプリケーションの動作確認
4. **パフォーマンステスト**: レスポンス時間とスループット確認

---

## 前提条件

```bash
# 必要なツール
- AWS CLI (設定済み)
- curl
- jq
- bash

# 環境変数
export ENVIRONMENT="dev"  # または "prd"
export AWS_REGION="ap-northeast-1"
```

---

## 1. インフラ検証テスト

### 1.1 DynamoDB テスト

```bash
#!/bin/bash
# test_dynamodb.sh

echo "=== DynamoDB Verification ==="

TABLE_NAME="serverless-blog-posts-${ENVIRONMENT}"

# テーブルの存在確認
echo "Checking table existence..."
if aws dynamodb describe-table --table-name "$TABLE_NAME" &> /dev/null; then
    echo "[PASS] Table exists: $TABLE_NAME"
else
    echo "[FAIL] Table not found: $TABLE_NAME"
    exit 1
fi

# テーブル設定の確認
echo "Checking table configuration..."
TABLE_INFO=$(aws dynamodb describe-table --table-name "$TABLE_NAME")

# 課金モード
BILLING_MODE=$(echo "$TABLE_INFO" | jq -r '.Table.BillingModeSummary.BillingMode')
if [ "$BILLING_MODE" == "PAY_PER_REQUEST" ]; then
    echo "[PASS] Billing mode: PAY_PER_REQUEST"
else
    echo "[WARN] Billing mode: $BILLING_MODE (expected: PAY_PER_REQUEST)"
fi

# GSI確認
GSI_COUNT=$(echo "$TABLE_INFO" | jq '.Table.GlobalSecondaryIndexes | length')
if [ "$GSI_COUNT" -eq 2 ]; then
    echo "[PASS] GSI count: 2"
else
    echo "[FAIL] GSI count: $GSI_COUNT (expected: 2)"
fi

# データ読み取りテスト
echo "Testing data read..."
ITEM_COUNT=$(aws dynamodb scan --table-name "$TABLE_NAME" --select COUNT --query 'Count' --output text)
echo "[INFO] Table contains $ITEM_COUNT items"
```

### 1.2 S3 バケットテスト

```bash
#!/bin/bash
# test_s3.sh

echo "=== S3 Verification ==="

ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
BUCKETS=(
    "serverless-blog-images-${ENVIRONMENT}-${ACCOUNT_ID}"
    "serverless-blog-public-site-${ENVIRONMENT}-${ACCOUNT_ID}"
    "serverless-blog-admin-site-${ENVIRONMENT}-${ACCOUNT_ID}"
)

for BUCKET in "${BUCKETS[@]}"; do
    echo "Checking bucket: $BUCKET"

    # 存在確認
    if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
        echo "[PASS] Bucket exists"

        # 暗号化確認
        if aws s3api get-bucket-encryption --bucket "$BUCKET" &> /dev/null; then
            echo "[PASS] Encryption enabled"
        else
            echo "[FAIL] Encryption not enabled"
        fi

        # パブリックアクセスブロック確認
        PAB=$(aws s3api get-public-access-block --bucket "$BUCKET" 2>/dev/null)
        if [ $? -eq 0 ]; then
            BLOCK_PUBLIC=$(echo "$PAB" | jq -r '.PublicAccessBlockConfiguration.BlockPublicAcls')
            if [ "$BLOCK_PUBLIC" == "true" ]; then
                echo "[PASS] Public access blocked"
            else
                echo "[WARN] Public access not fully blocked"
            fi
        fi
    else
        echo "[FAIL] Bucket not found"
    fi
done
```

### 1.3 Cognito テスト

```bash
#!/bin/bash
# test_cognito.sh

echo "=== Cognito Verification ==="

POOL_NAME="serverless-blog-${ENVIRONMENT}"

# User Pool ID取得
USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 \
    --query "UserPools[?Name=='$POOL_NAME'].Id" --output text)

if [ -n "$USER_POOL_ID" ] && [ "$USER_POOL_ID" != "None" ]; then
    echo "[PASS] User Pool found: $USER_POOL_ID"

    # MFA設定確認
    MFA=$(aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" \
        --query 'UserPool.MfaConfiguration' --output text)
    echo "[INFO] MFA configuration: $MFA"

    # App Client確認
    CLIENT_COUNT=$(aws cognito-idp list-user-pool-clients --user-pool-id "$USER_POOL_ID" \
        --query 'length(UserPoolClients)' --output text)
    if [ "$CLIENT_COUNT" -ge 1 ]; then
        echo "[PASS] App client(s) found: $CLIENT_COUNT"
    else
        echo "[FAIL] No app clients found"
    fi
else
    echo "[FAIL] User Pool not found"
    exit 1
fi
```

### 1.4 API Gateway テスト

```bash
#!/bin/bash
# test_apigateway.sh

echo "=== API Gateway Verification ==="

API_NAME="serverless-blog-api-${ENVIRONMENT}"

# REST API ID取得
API_ID=$(aws apigateway get-rest-apis \
    --query "items[?name=='$API_NAME'].id" --output text)

if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
    echo "[PASS] REST API found: $API_ID"

    # ステージ確認
    if aws apigateway get-stage --rest-api-id "$API_ID" --stage-name "$ENVIRONMENT" &> /dev/null; then
        echo "[PASS] Stage exists: $ENVIRONMENT"

        # エンドポイント取得
        ENDPOINT="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/${ENVIRONMENT}"
        echo "[INFO] API Endpoint: $ENDPOINT"
    else
        echo "[FAIL] Stage not found"
    fi

    # リソース数確認
    RESOURCE_COUNT=$(aws apigateway get-resources --rest-api-id "$API_ID" \
        --query 'length(items)' --output text)
    echo "[INFO] API resources: $RESOURCE_COUNT"
else
    echo "[FAIL] REST API not found"
    exit 1
fi
```

### 1.5 Lambda テスト

```bash
#!/bin/bash
# test_lambda.sh

echo "=== Lambda Verification ==="

FUNCTIONS=(
    "blog-create-post-go"
    "blog-get-post-go"
    "blog-get-public-post-go"
    "blog-list-posts-go"
    "blog-update-post-go"
    "blog-delete-post-go"
    "blog-login-go"
    "blog-logout-go"
    "blog-refresh-go"
    "blog-upload-url-go"
    "blog-delete-image-go"
)

PASS_COUNT=0
FAIL_COUNT=0

for FUNC in "${FUNCTIONS[@]}"; do
    if aws lambda get-function --function-name "$FUNC" &> /dev/null; then
        CONFIG=$(aws lambda get-function-configuration --function-name "$FUNC")
        RUNTIME=$(echo "$CONFIG" | jq -r '.Runtime')
        ARCH=$(echo "$CONFIG" | jq -r '.Architectures[0]')

        if [ "$RUNTIME" == "provided.al2023" ] && [ "$ARCH" == "arm64" ]; then
            echo "[PASS] $FUNC (runtime: $RUNTIME, arch: $ARCH)"
            ((PASS_COUNT++))
        else
            echo "[WARN] $FUNC (runtime: $RUNTIME, arch: $ARCH)"
            ((PASS_COUNT++))
        fi
    else
        echo "[FAIL] $FUNC not found"
        ((FAIL_COUNT++))
    fi
done

echo ""
echo "Lambda functions: $PASS_COUNT passed, $FAIL_COUNT failed"
```

### 1.6 CloudFront テスト

```bash
#!/bin/bash
# test_cloudfront.sh

echo "=== CloudFront Verification ==="

# ディストリビューション検索
DIST_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Comment, 'Unified CDN')].Id" --output text 2>/dev/null)

if [ -n "$DIST_ID" ] && [ "$DIST_ID" != "None" ]; then
    echo "[PASS] Distribution found: $DIST_ID"

    # ステータス確認
    STATUS=$(aws cloudfront get-distribution --id "$DIST_ID" \
        --query 'Distribution.Status' --output text)
    if [ "$STATUS" == "Deployed" ]; then
        echo "[PASS] Status: Deployed"
    else
        echo "[INFO] Status: $STATUS"
    fi

    # ドメイン取得
    DOMAIN=$(aws cloudfront get-distribution --id "$DIST_ID" \
        --query 'Distribution.DomainName' --output text)
    echo "[INFO] Domain: https://$DOMAIN"
else
    echo "[WARN] Distribution not found by comment, listing all..."
    aws cloudfront list-distributions \
        --query 'DistributionList.Items[*].[Id,DomainName,Comment]' --output table
fi
```

---

## 2. 接続性テスト

### 2.1 CloudFront経由のエンドポイントテスト

```bash
#!/bin/bash
# test_connectivity.sh

echo "=== Connectivity Tests ==="

# CloudFrontドメイン取得
CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[0].DomainName" --output text)

if [ -z "$CLOUDFRONT_DOMAIN" ] || [ "$CLOUDFRONT_DOMAIN" == "None" ]; then
    echo "[FAIL] CloudFront domain not found"
    exit 1
fi

BASE_URL="https://$CLOUDFRONT_DOMAIN"
echo "Base URL: $BASE_URL"

# 公開サイトテスト
echo ""
echo "Testing public site..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$HTTP_CODE" == "200" ]; then
    echo "[PASS] Public site: HTTP $HTTP_CODE"
else
    echo "[FAIL] Public site: HTTP $HTTP_CODE"
fi

# 管理画面テスト
echo ""
echo "Testing admin site..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin/")
if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "304" ]; then
    echo "[PASS] Admin site: HTTP $HTTP_CODE"
else
    echo "[WARN] Admin site: HTTP $HTTP_CODE"
fi

# APIテスト（公開エンドポイント）
echo ""
echo "Testing public API..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/posts")
if [ "$HTTP_CODE" == "200" ]; then
    echo "[PASS] Public API: HTTP $HTTP_CODE"
else
    echo "[FAIL] Public API: HTTP $HTTP_CODE"
fi
```

### 2.2 API レスポンス検証

```bash
#!/bin/bash
# test_api_response.sh

echo "=== API Response Tests ==="

CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[0].DomainName" --output text)
BASE_URL="https://$CLOUDFRONT_DOMAIN"

# 記事一覧API
echo "Testing GET /api/posts..."
RESPONSE=$(curl -s "$BASE_URL/api/posts")

# レスポンス形式確認
if echo "$RESPONSE" | jq -e '.items' > /dev/null 2>&1; then
    echo "[PASS] Response has 'items' array"
    ITEM_COUNT=$(echo "$RESPONSE" | jq '.items | length')
    echo "[INFO] Items count: $ITEM_COUNT"
else
    echo "[FAIL] Response format invalid"
    echo "$RESPONSE" | head -c 200
fi

# nextToken確認
if echo "$RESPONSE" | jq -e 'has("nextToken")' > /dev/null 2>&1; then
    echo "[PASS] Response has 'nextToken' field"
fi
```

---

## 3. 機能テスト

### 3.1 認証フローテスト

```bash
#!/bin/bash
# test_auth_flow.sh

echo "=== Authentication Flow Test ==="

CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[0].DomainName" --output text)
BASE_URL="https://$CLOUDFRONT_DOMAIN"

# 注意: このテストは実際の認証情報が必要です
# テスト用ユーザーを事前に作成してください

echo "[INFO] Authentication endpoint: $BASE_URL/api/admin/auth/login"

# ログインテスト（モック）
# 実際のテストでは有効な認証情報を使用してください
echo "[INFO] Skipping actual login test (requires credentials)"

# 未認証アクセステスト
echo ""
echo "Testing protected endpoint without auth..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/admin/posts")
if [ "$HTTP_CODE" == "401" ] || [ "$HTTP_CODE" == "403" ]; then
    echo "[PASS] Protected endpoint returns $HTTP_CODE without auth"
else
    echo "[WARN] Protected endpoint returns $HTTP_CODE (expected: 401 or 403)"
fi
```

### 3.2 CRUD操作テスト（読み取りのみ）

```bash
#!/bin/bash
# test_crud_read.sh

echo "=== CRUD Read Tests ==="

CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[0].DomainName" --output text)
BASE_URL="https://$CLOUDFRONT_DOMAIN"

# 記事一覧取得
echo "Testing list posts..."
POSTS=$(curl -s "$BASE_URL/api/posts")
POST_COUNT=$(echo "$POSTS" | jq '.items | length' 2>/dev/null || echo "0")

if [ "$POST_COUNT" -gt 0 ]; then
    echo "[PASS] Found $POST_COUNT posts"

    # 最初の記事IDを取得
    FIRST_POST_ID=$(echo "$POSTS" | jq -r '.items[0].id')

    # 個別記事取得テスト
    echo ""
    echo "Testing get single post: $FIRST_POST_ID"
    SINGLE_POST=$(curl -s "$BASE_URL/api/posts/$FIRST_POST_ID")

    if echo "$SINGLE_POST" | jq -e '.id' > /dev/null 2>&1; then
        TITLE=$(echo "$SINGLE_POST" | jq -r '.title')
        echo "[PASS] Retrieved post: $TITLE"
    else
        echo "[FAIL] Could not retrieve single post"
    fi
else
    echo "[INFO] No posts found (database may be empty)"
fi
```

---

## 4. パフォーマンステスト

### 4.1 レスポンス時間測定

```bash
#!/bin/bash
# test_performance.sh

echo "=== Performance Tests ==="

CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[0].DomainName" --output text)
BASE_URL="https://$CLOUDFRONT_DOMAIN"

# 各エンドポイントのレスポンス時間を測定
ENDPOINTS=(
    "/"
    "/admin/"
    "/api/posts"
)

echo "Measuring response times..."
echo ""

for ENDPOINT in "${ENDPOINTS[@]}"; do
    # 3回測定して平均を計算
    TOTAL_TIME=0
    for i in 1 2 3; do
        TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL$ENDPOINT")
        TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc)
    done
    AVG_TIME=$(echo "scale=3; $TOTAL_TIME / 3" | bc)

    # 閾値チェック（2秒以内）
    if (( $(echo "$AVG_TIME < 2.0" | bc -l) )); then
        echo "[PASS] $ENDPOINT: ${AVG_TIME}s (< 2s threshold)"
    else
        echo "[WARN] $ENDPOINT: ${AVG_TIME}s (> 2s threshold)"
    fi
done
```

---

## 5. ヘルスチェックスクリプト

すべてのテストを統合したヘルスチェックスクリプト:

```bash
#!/bin/bash
# health-check.sh
# Usage: ./scripts/health-check.sh [dev|prd]

set -euo pipefail

ENVIRONMENT="${1:-dev}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

# 結果カウンター
PASS=0
FAIL=0
WARN=0

check_result() {
    local status=$1
    local message=$2
    case $status in
        PASS) ((PASS++)); echo -e "\033[0;32m[PASS]\033[0m $message" ;;
        FAIL) ((FAIL++)); echo -e "\033[0;31m[FAIL]\033[0m $message" ;;
        WARN) ((WARN++)); echo -e "\033[1;33m[WARN]\033[0m $message" ;;
    esac
}

echo "=========================================="
echo " Health Check: $ENVIRONMENT environment"
echo "=========================================="

# 1. CloudFrontドメイン取得
CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[0].DomainName" --output text 2>/dev/null || echo "")

if [ -z "$CLOUDFRONT_DOMAIN" ] || [ "$CLOUDFRONT_DOMAIN" == "None" ]; then
    check_result FAIL "CloudFront domain not found"
    exit 1
else
    check_result PASS "CloudFront domain: $CLOUDFRONT_DOMAIN"
fi

BASE_URL="https://$CLOUDFRONT_DOMAIN"

# 2. 公開サイト
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" == "200" ]; then
    check_result PASS "Public site accessible (HTTP $HTTP_CODE)"
else
    check_result FAIL "Public site not accessible (HTTP $HTTP_CODE)"
fi

# 3. 管理画面
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin/" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "304" ]; then
    check_result PASS "Admin site accessible (HTTP $HTTP_CODE)"
else
    check_result WARN "Admin site: HTTP $HTTP_CODE"
fi

# 4. 公開API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/posts" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" == "200" ]; then
    check_result PASS "Public API accessible (HTTP $HTTP_CODE)"
else
    check_result FAIL "Public API not accessible (HTTP $HTTP_CODE)"
fi

# 5. DynamoDB
TABLE_NAME="serverless-blog-posts-${ENVIRONMENT}"
if aws dynamodb describe-table --table-name "$TABLE_NAME" &> /dev/null; then
    check_result PASS "DynamoDB table accessible"
else
    check_result FAIL "DynamoDB table not accessible"
fi

# 6. Lambda関数サンプルチェック
if aws lambda get-function --function-name "blog-list-posts-go" &> /dev/null; then
    check_result PASS "Lambda functions accessible"
else
    check_result FAIL "Lambda functions not accessible"
fi

# 結果サマリー
echo ""
echo "=========================================="
echo " Results"
echo "=========================================="
echo -e "\033[0;32mPassed: $PASS\033[0m"
echo -e "\033[1;33mWarnings: $WARN\033[0m"
echo -e "\033[0;31mFailed: $FAIL\033[0m"

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "Health check FAILED. Please investigate the failures above."
    exit 1
else
    echo ""
    echo "Health check PASSED."
    exit 0
fi
```

---

## 6. 移行前後のチェックリスト

### 移行前チェック

- [ ] 現行システムのヘルスチェック完了
- [ ] バックアップ取得完了
- [ ] ロールバック手順の確認
- [ ] 関係者への通知

### 移行後チェック

- [ ] インフラ検証テスト完了
- [ ] 接続性テスト完了
- [ ] 機能テスト完了
- [ ] パフォーマンステスト完了
- [ ] ヘルスチェックスクリプト成功

---

## 付録: テスト結果レポートテンプレート

```markdown
# 移行検証レポート

## 基本情報
- 日時: YYYY-MM-DD HH:MM
- 環境: dev/prd
- 実施者: Name

## テスト結果サマリー
| カテゴリ | 成功 | 警告 | 失敗 |
|---------|------|------|------|
| インフラ検証 | X | X | X |
| 接続性テスト | X | X | X |
| 機能テスト | X | X | X |
| パフォーマンス | X | X | X |
| **合計** | X | X | X |

## 詳細結果
[テスト出力をここに貼り付け]

## 問題点と対応
1. [問題1]: [対応策]
2. [問題2]: [対応策]

## 結論
- [ ] 移行成功
- [ ] 追加対応が必要
- [ ] ロールバック実施
```
