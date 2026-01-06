# Go Lambda Functions Build Configuration
# ARM64 cross-compilation for AWS Lambda (provided.al2023)

# Build settings
GOOS := linux
GOARCH := arm64
CGO_ENABLED := 0
LDFLAGS := -s -w
BUILD_TAGS := lambda.norpc

# Directories
BIN_DIR := bin
CMD_DIR := cmd

# All Lambda functions (domain/function format)
FUNCTIONS := \
	posts/create \
	posts/get \
	posts/get_public \
	posts/list \
	posts/update \
	posts/delete \
	auth/login \
	auth/logout \
	auth/refresh \
	images/get_upload_url \
	images/delete

.PHONY: all build clean test lint fmt help

# Default target
all: build

# Build all Lambda functions
build:
	@echo "Building all Lambda functions for $(GOOS)/$(GOARCH)..."
	@for func in $(FUNCTIONS); do \
		name=$$(echo $$func | tr '/' '-'); \
		echo "  Building $$name..."; \
		CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) \
			go build -ldflags="$(LDFLAGS)" -tags="$(BUILD_TAGS)" \
			-o $(BIN_DIR)/$$name/bootstrap ./$(CMD_DIR)/$$func || exit 1; \
	done
	@echo "Build complete!"

# Build a single function: make build-one FUNC=posts/create
build-one:
ifndef FUNC
	$(error FUNC is not set. Usage: make build-one FUNC=posts/create)
endif
	@name=$$(echo $(FUNC) | tr '/' '-'); \
	echo "Building $$name for $(GOOS)/$(GOARCH)..."; \
	CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) \
		go build -ldflags="$(LDFLAGS)" -tags="$(BUILD_TAGS)" \
		-o $(BIN_DIR)/$$name/bootstrap ./$(CMD_DIR)/$(FUNC)

# Run tests with race detector
test:
	@echo "Running tests..."
	go test -race -coverprofile=coverage.out ./...
	@echo "Tests complete!"

# Run linter
lint:
	@echo "Running linter..."
	golangci-lint run ./...

# Format code
fmt:
	@echo "Formatting code..."
	go fmt ./...

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
	@echo "  lint       - Run golangci-lint"
	@echo "  fmt        - Format code"
	@echo "  clean      - Remove build artifacts"
	@echo "  help       - Show this help message"
