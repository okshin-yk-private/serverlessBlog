#!/usr/bin/env bash
# ビルドテスト用スクリプト
# モックAPIサーバーを起動してAstroビルドを実行

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MOCK_PORT="${MOCK_PORT:-3458}"
SITE_URL="${SITE_URL:-https://example.com}"

# 既存のモックサーバーをクリーンアップ
cleanup() {
  if [ ! -z "$MOCK_PID" ]; then
    kill "$MOCK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$PROJECT_DIR"

# モックAPIサーバーを起動
echo "Starting mock API server on port $MOCK_PORT..."
PORT="$MOCK_PORT" bun tests/mock-api-server.ts &
MOCK_PID=$!

# サーバーが起動するまで待つ
sleep 2

# APIが応答するか確認
echo "Checking mock API..."
curl -s "http://localhost:$MOCK_PORT/posts?publishStatus=published" > /dev/null

# dist をクリーンアップ
rm -rf dist

# Astroビルドを実行
echo "Running Astro build..."
SITE_URL="$SITE_URL" API_URL="http://localhost:$MOCK_PORT" bun run build

echo "Build completed successfully!"
