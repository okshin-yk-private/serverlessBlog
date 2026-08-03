#!/usr/bin/env bash
# Pre-commit test runner: Runs tests only for components with staged changes
# This script provides clear feedback and fails fast on any test failure

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)

if [ -z "$STAGED_FILES" ]; then
  echo -e "${YELLOW}No staged files to check${NC}"
  exit 0
fi

# Detection flags
HAS_GO=false
HAS_FRONTEND_ADMIN=false
HAS_FRONTEND_PUBLIC_ASTRO=false
HAS_DEPLOY_SCRIPTS=false

# Check which components have changes
for file in $STAGED_FILES; do
  case "$file" in
    go-functions/*)
      HAS_GO=true
      ;;
    frontend/admin/*)
      HAS_FRONTEND_ADMIN=true
      ;;
    frontend/public-astro/*)
      HAS_FRONTEND_PUBLIC_ASTRO=true
      ;;
    scripts/deploy/*)
      HAS_DEPLOY_SCRIPTS=true
      ;;
  esac
done

# Track what will be checked
echo -e "${BLUE}Detected changes in:${NC}"
[ "$HAS_GO" = true ] && echo "  - go-functions/ (Go Lambda)"
[ "$HAS_FRONTEND_ADMIN" = true ] && echo "  - frontend/admin/ (Admin App)"
[ "$HAS_FRONTEND_PUBLIC_ASTRO" = true ] && echo "  - frontend/public-astro/ (Public Site / Astro SSG)"
[ "$HAS_DEPLOY_SCRIPTS" = true ] && echo "  - scripts/deploy/ (Deploy Scripts)"

# If nothing to check, exit early
if [ "$HAS_GO" = false ] && \
   [ "$HAS_FRONTEND_ADMIN" = false ] && \
   [ "$HAS_FRONTEND_PUBLIC_ASTRO" = false ] && \
   [ "$HAS_DEPLOY_SCRIPTS" = false ]; then
  echo -e "${GREEN}No testable components changed. Skipping tests.${NC}"
  exit 0
fi

echo ""
FAILED=false

# =========================================
# Go Lambda Tests (fast path: vet + test, no -race/-coverprofile).
# The full lint + race + coverage gate runs in .husky/pre-push instead, so
# pre-commit stays fast.
# =========================================
if [ "$HAS_GO" = true ]; then
  echo -e "${BLUE}[1/4] Running Go vet + tests...${NC}"

  if (cd go-functions && go vet ./... && go test ./...); then
    echo -e "${GREEN}  ✓ Go vet and tests passed${NC}"
  else
    echo -e "${RED}  ✗ Go vet or tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[1/4] Go Lambda: No changes, skipping${NC}"
fi

# =========================================
# Frontend Admin Tests
# =========================================
if [ "$HAS_FRONTEND_ADMIN" = true ]; then
  echo -e "${BLUE}[2/4] Running Frontend Admin lint + tests...${NC}"

  # Run ESLint from frontend/admin using its own config (root config ignores frontend/)
  if (cd frontend/admin && bun run lint); then
    echo -e "${GREEN}  ✓ Frontend Admin lint passed${NC}"
  else
    echo -e "${RED}  ✗ Frontend Admin lint failed${NC}"
    FAILED=true
  fi

  if (cd frontend/admin && bun run test -- --run); then
    echo -e "${GREEN}  ✓ Frontend Admin tests passed${NC}"
  else
    echo -e "${RED}  ✗ Frontend Admin tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[2/4] Frontend Admin: No changes, skipping${NC}"
fi

# =========================================
# Frontend Public (Astro SSG) Tests
# =========================================
if [ "$HAS_FRONTEND_PUBLIC_ASTRO" = true ]; then
  echo -e "${BLUE}[3/4] Running Frontend Public (Astro) tests...${NC}"

  # Astro プロジェクトは bun 管理。統合テストはビルド済み dist/ を前提とするため
  # ここではユニットテストのみ実行する。
  if (cd frontend/public-astro && bun run test -- --run); then
    echo -e "${GREEN}  ✓ Frontend Public (Astro) tests passed${NC}"
  else
    echo -e "${RED}  ✗ Frontend Public (Astro) tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[3/4] Frontend Public (Astro): No changes, skipping${NC}"
fi

# =========================================
# Deploy Scripts Tests
# =========================================
if [ "$HAS_DEPLOY_SCRIPTS" = true ]; then
  echo -e "${BLUE}[4/4] Running Deploy Scripts tests...${NC}"

  if (cd scripts/deploy && bun run test -- --run); then
    echo -e "${GREEN}  ✓ Deploy Scripts tests passed${NC}"
  else
    echo -e "${RED}  ✗ Deploy Scripts tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[4/4] Deploy Scripts: No changes, skipping${NC}"
fi

# =========================================
# Final Result
# =========================================
echo ""
if [ "$FAILED" = true ]; then
  echo -e "${RED}============================================${NC}"
  echo -e "${RED}  Pre-commit checks FAILED${NC}"
  echo -e "${RED}  Fix the issues above before committing${NC}"
  echo -e "${RED}  Use 'git commit --no-verify' to skip${NC}"
  echo -e "${RED}============================================${NC}"
  exit 1
else
  echo -e "${GREEN}============================================${NC}"
  echo -e "${GREEN}  All pre-commit checks passed!${NC}"
  echo -e "${GREEN}============================================${NC}"
  exit 0
fi
