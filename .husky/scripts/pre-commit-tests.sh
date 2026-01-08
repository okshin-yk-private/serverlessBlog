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
HAS_INFRASTRUCTURE=false
HAS_GO=false
HAS_FRONTEND_ADMIN=false
HAS_FRONTEND_PUBLIC=false

# Check which components have changes
for file in $STAGED_FILES; do
  case "$file" in
    infrastructure/*)
      HAS_INFRASTRUCTURE=true
      ;;
    go-functions/*.go)
      HAS_GO=true
      ;;
    frontend/admin/*)
      HAS_FRONTEND_ADMIN=true
      ;;
    frontend/public/*)
      HAS_FRONTEND_PUBLIC=true
      ;;
  esac
done

# Track what will be checked
echo -e "${BLUE}Detected changes in:${NC}"
[ "$HAS_INFRASTRUCTURE" = true ] && echo "  - infrastructure/ (CDK)"
[ "$HAS_GO" = true ] && echo "  - go-functions/ (Go Lambda)"
[ "$HAS_FRONTEND_ADMIN" = true ] && echo "  - frontend/admin/ (Admin App)"
[ "$HAS_FRONTEND_PUBLIC" = true ] && echo "  - frontend/public/ (Public Site)"

# If nothing to check, exit early
if [ "$HAS_INFRASTRUCTURE" = false ] && \
   [ "$HAS_GO" = false ] && \
   [ "$HAS_FRONTEND_ADMIN" = false ] && \
   [ "$HAS_FRONTEND_PUBLIC" = false ]; then
  echo -e "${GREEN}No testable components changed. Skipping tests.${NC}"
  exit 0
fi

echo ""
FAILED=false

# =========================================
# Infrastructure Tests (CDK)
# =========================================
if [ "$HAS_INFRASTRUCTURE" = true ]; then
  echo -e "${BLUE}[1/4] Running Infrastructure tests...${NC}"

  # Run Jest tests
  if (cd infrastructure && npm test -- --passWithNoTests); then
    echo -e "${GREEN}  ✓ Infrastructure unit tests passed${NC}"
  else
    echo -e "${RED}  ✗ Infrastructure unit tests failed${NC}"
    FAILED=true
  fi

  # Run CDK diff (non-blocking - informational only)
  if [ "$FAILED" = false ]; then
    echo -e "${YELLOW}  Running cdk diff (informational)...${NC}"
    if (cd infrastructure && npx cdk diff --all --context stage=dev 2>/dev/null); then
      echo -e "${GREEN}  ✓ CDK diff completed${NC}"
    else
      echo -e "${YELLOW}  ⚠ CDK diff skipped (requires AWS credentials or failed)${NC}"
    fi
  fi
else
  echo -e "${YELLOW}[1/4] Infrastructure: No changes, skipping${NC}"
fi

# =========================================
# Go Lambda Tests
# =========================================
if [ "$HAS_GO" = true ]; then
  echo -e "${BLUE}[2/4] Running Go tests...${NC}"

  if (cd go-functions && make lint test); then
    echo -e "${GREEN}  ✓ Go lint and tests passed${NC}"
  else
    echo -e "${RED}  ✗ Go lint or tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[2/4] Go Lambda: No changes, skipping${NC}"
fi

# =========================================
# Frontend Admin Tests
# =========================================
if [ "$HAS_FRONTEND_ADMIN" = true ]; then
  echo -e "${BLUE}[3/4] Running Frontend Admin tests...${NC}"

  if (cd frontend/admin && npm run test -- --run); then
    echo -e "${GREEN}  ✓ Frontend Admin tests passed${NC}"
  else
    echo -e "${RED}  ✗ Frontend Admin tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[3/4] Frontend Admin: No changes, skipping${NC}"
fi

# =========================================
# Frontend Public Tests
# =========================================
if [ "$HAS_FRONTEND_PUBLIC" = true ]; then
  echo -e "${BLUE}[4/4] Running Frontend Public tests...${NC}"

  if (cd frontend/public && npm run test -- --run); then
    echo -e "${GREEN}  ✓ Frontend Public tests passed${NC}"
  else
    echo -e "${RED}  ✗ Frontend Public tests failed${NC}"
    FAILED=true
  fi
else
  echo -e "${YELLOW}[4/4] Frontend Public: No changes, skipping${NC}"
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
