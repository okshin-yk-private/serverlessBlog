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

# Check which components have changes
for file in $STAGED_FILES; do
  case "$file" in
    go-functions/*.go)
      HAS_GO=true
      ;;
    frontend/admin/*)
      HAS_FRONTEND_ADMIN=true
      ;;
    frontend/public-astro/*)
      HAS_FRONTEND_PUBLIC_ASTRO=true
      ;;
  esac
done

# Track what will be checked
echo -e "${BLUE}Detected changes in:${NC}"
[ "$HAS_GO" = true ] && echo "  - go-functions/ (Go Lambda)"
[ "$HAS_FRONTEND_ADMIN" = true ] && echo "  - frontend/admin/ (Admin App)"
[ "$HAS_FRONTEND_PUBLIC_ASTRO" = true ] && echo "  - frontend/public-astro/ (Public Site / Astro SSG)"

# If nothing to check, exit early
if [ "$HAS_GO" = false ] && \
   [ "$HAS_FRONTEND_ADMIN" = false ] && \
   [ "$HAS_FRONTEND_PUBLIC_ASTRO" = false ]; then
  echo -e "${GREEN}No testable components changed. Skipping tests.${NC}"
  exit 0
fi

echo ""
FAILED=false

# =========================================
# Go Lambda Tests
# =========================================
if [ "$HAS_GO" = true ]; then
  echo -e "${BLUE}[1/3] Running Go tests...${NC}"

  if (cd go-functions && make lint test); then
    echo -e "${GREEN}  ✓ Go lint and tests passed${NC}"
  else
    echo -e "${RED}  ✗ Go lint or tests failed${NC}"
    FAILED=true
  fi

  # Check Go coverage threshold (90% minimum, matching CI)
  if [ "$FAILED" = false ] && [ -f go-functions/coverage.out ]; then
    COVERAGE=$(cd go-functions && go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')
    if [ -n "$COVERAGE" ] && [ "$(echo "$COVERAGE < 90" | bc -l)" -eq 1 ]; then
      echo -e "${RED}  ✗ Go coverage ${COVERAGE}% is below 90% threshold${NC}"
      FAILED=true
    else
      echo -e "${GREEN}  ✓ Go coverage ${COVERAGE}% meets 90% threshold${NC}"
    fi
  fi
else
  echo -e "${YELLOW}[1/3] Go Lambda: No changes, skipping${NC}"
fi

# =========================================
# Frontend Admin Tests
# =========================================
if [ "$HAS_FRONTEND_ADMIN" = true ]; then
  echo -e "${BLUE}[2/3] Running Frontend Admin lint + tests...${NC}"

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
  echo -e "${YELLOW}[2/3] Frontend Admin: No changes, skipping${NC}"
fi

# =========================================
# Frontend Public (Astro SSG) Tests
# =========================================
if [ "$HAS_FRONTEND_PUBLIC_ASTRO" = true ]; then
  echo -e "${BLUE}[3/3] Running Frontend Public (Astro) tests...${NC}"

  # Astro プロジェクトは bun 管理。統合テストはビルド済み dist/ を前提とするため
  # ここではユニットテストのみ実行する。
  if (cd frontend/public-astro && bun run test -- --run); then
    echo -e "${GREEN}  ✓ Frontend Public (Astro) tests passed${NC}"
  else
    echo -e "${RED}  ✗ Frontend Public (Astro) tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[3/3] Frontend Public (Astro): No changes, skipping${NC}"
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
