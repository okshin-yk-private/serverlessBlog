# Go Lambda Functions Build Configuration
# ARM64 cross-compilation for AWS Lambda (provided.al2023)

# Build settings
GOOS := linux
GOARCH := arm64
CGO_ENABLED := 0
# Reproducible build flags: -buildvcs=false removes git info, -buildid= removes build ID
BUILD_FLAGS := -trimpath -buildvcs=false
LDFLAGS := -s -w -buildid=
BUILD_TAGS := lambda.norpc
# Fixed timestamp for reproducible builds (2020-01-01 00:00:00)
FIXED_TIMESTAMP := 202001010000.00
GOLANGCI_LINT_VERSION := $(shell tr -d '[:space:]' < .golangci-version)

# Directories
BIN_DIR := bin
CMD_DIR := cmd

# All Lambda functions (domain/function format)
# Must stay in sync with the build matrices in .github/workflows/{ci,deploy}.yml
# and the archive_file sources in terraform/modules/lambda/main.tf.
# Intentionally excluded: categories/seed (one-off seeding tool, not deployed),
# scripts/backfill_post_slugs (CLI, see backfill-slugs target).
FUNCTIONS := \
	posts/create \
	posts/get \
	posts/get_public \
	posts/get_by_slug \
	posts/list \
	posts/update \
	posts/delete \
	posts/build_status \
	posts/reconcile_build \
	auth/login \
	auth/logout \
	auth/refresh \
	images/get_upload_url \
	images/delete \
	categories/list \
	categories/create \
	categories/update \
	categories/bulk_sort \
	categories/delete

.PHONY: all build clean test lint fmt verify-toolchain check-linter help

# Default target
all: build

# Build all Lambda functions
build:
	@echo "Building all Lambda functions for $(GOOS)/$(GOARCH)..."
	@for func in $(FUNCTIONS); do \
		name=$$(echo $$func | tr '/' '-'); \
		echo "  Building $$name..."; \
		mkdir -p $(BIN_DIR)/$$name; \
		CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) \
			go build $(BUILD_FLAGS) -ldflags="$(LDFLAGS)" -tags="$(BUILD_TAGS)" \
			-o $(BIN_DIR)/$$name/bootstrap ./$(CMD_DIR)/$$func || exit 1; \
		touch -t $(FIXED_TIMESTAMP) $(BIN_DIR)/$$name/bootstrap; \
	done
	@echo "Build complete!"

# Build a single function: make build-one FUNC=posts/create
build-one:
ifndef FUNC
	$(error FUNC is not set. Usage: make build-one FUNC=posts/create)
endif
	@name=$$(echo $(FUNC) | tr '/' '-'); \
	echo "Building $$name for $(GOOS)/$(GOARCH)..."; \
	mkdir -p $(BIN_DIR)/$$name; \
	CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) \
		go build $(BUILD_FLAGS) -ldflags="$(LDFLAGS)" -tags="$(BUILD_TAGS)" \
		-o $(BIN_DIR)/$$name/bootstrap ./$(CMD_DIR)/$(FUNC); \
	touch -t $(FIXED_TIMESTAMP) $(BIN_DIR)/$$name/bootstrap

# Run tests with race detector
test:
	@echo "Running tests..."
	# The benchmark package contains only test code. Go 1.26 removes the
	# coverage profile when it is included, so keep this aligned with CI.
	# -count=1 guarantees a fresh coverage.out for the pre-push coverage gate.
	go list ./... | grep -v '/tests/benchmark$$' | xargs go test -race -count=1 -p 2 -coverprofile=coverage.out -covermode=atomic
	@echo "Tests complete!"

# Run linter
lint: verify-toolchain check-linter
	@echo "Running linter..."
	golangci-lint run ./...

# Verify that CI, local deployment, and the linter use the repository-pinned versions.
verify-toolchain:
	@../scripts/ci/verify-go-toolchain.sh
	@expected_go=$$(awk '$$1 == "go" { print $$2; exit }' go.mod); \
	actual_go=$$(go env GOVERSION | sed 's/^go//'); \
	if [ "$$actual_go" != "$$expected_go" ]; then \
		echo "ERROR: Go $$expected_go is required, but Go $$actual_go is active." >&2; \
		echo "Install/select Go $$expected_go, then retry." >&2; \
		exit 1; \
	fi

# golangci-lint must support the active Go version. Older binaries panic while
# loading Go 1.26 type information, so fail with a direct remediation message.
check-linter:
	@if ! command -v golangci-lint >/dev/null 2>&1; then \
		echo "ERROR: golangci-lint $(GOLANGCI_LINT_VERSION) is required; see go-functions/README.md." >&2; \
		exit 1; \
	fi
	@version_output="$$(golangci-lint version)"; \
	if ! printf '%s\\n' "$$version_output" | grep -Fq "has version $(patsubst v%,%,$(GOLANGCI_LINT_VERSION))"; then \
		echo "ERROR: golangci-lint $(GOLANGCI_LINT_VERSION) is required to lint this repository." >&2; \
		printf '%s\\n' "$$version_output" >&2; \
		echo "Install the pinned version using the command in go-functions/README.md." >&2; \
		exit 1; \
	fi
	@if ! golangci-lint version | grep -Eq 'built with go1\.26(\.| )'; then \
		echo "ERROR: golangci-lint $(GOLANGCI_LINT_VERSION) must be built with Go 1.26 or later." >&2; \
		golangci-lint version >&2; \
		echo "Reinstall it using Go $$(awk '$$1 == "go" { print $$2; exit }' go.mod)." >&2; \
		exit 1; \
	fi

# Format code
fmt:
	@echo "Formatting code..."
	go fmt ./...

# Backfill slugs for legacy BlogPosts (PR7).
# Usage: AWS_PROFILE=dev TABLE_NAME=blog-posts-dev make backfill-slugs ARGS="--dry-run"
backfill-slugs:
	@echo "Running backfill-post-slugs..."
	go run ./cmd/scripts/backfill_post_slugs $(ARGS)

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(BIN_DIR)
	rm -f coverage.out
	@echo "Clean complete!"

# Show help
help:
	@echo "Available targets:"
	@echo "  all        - Build all Lambda functions (default)"
	@echo "  build      - Build all Lambda functions"
	@echo "  build-one  - Build single function (FUNC=posts/create)"
	@echo "  test       - Run tests with race detector"
	@echo "  lint       - Verify the pinned toolchain and run golangci-lint"
	@echo "  verify-toolchain - Check version declarations and the active Go version"
	@echo "  fmt        - Format code"
	@echo "  clean          - Remove build artifacts"
	@echo "  backfill-slugs - Backfill slugs for legacy BlogPosts (use ARGS='--dry-run' for preview)"
	@echo "  help           - Show this help message"
