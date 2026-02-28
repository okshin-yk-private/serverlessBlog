# Research & Design Decisions

---
**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.
---

## Summary
- **Feature**: `lambda-golang-migration`
- **Discovery Scope**: Complex Integration (Node.js + Rust → Go migration)
- **Key Findings**:
  1. AWS Lambda `provided.al2023` runtime with ARM64 offers optimal cold start (<50ms) and cost savings
  2. AWS SDK Go v2 requires singleton pattern with `sync.Once` for client initialization
  3. AWS X-Ray SDK entering maintenance mode (Feb 2026); consider OpenTelemetry for future-proofing

## Research Log

### Lambda Go Runtime Selection

- **Context**: Need to choose optimal runtime for Go Lambda functions
- **Sources Consulted**:
  - [AWS Lambda Go Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-golang.html)
  - [Building Lambda functions with Go](https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html)
  - [Lambda Cold Start Benchmark](https://maxday.github.io/lambda-perf/)
- **Findings**:
  - `provided.al2023` is recommended over deprecated `go1.x` runtime
  - ARM64 (Graviton2) offers ~20% cost reduction and better performance
  - Binary must be named `bootstrap` for custom runtime
  - Use `lambda.norpc` build tag for smaller binaries (~10-15% reduction)
  - Cold start typically 10-30ms for optimized Go binaries
- **Implications**:
  - Build flags: `CGO_ENABLED=0 GOOS=linux GOARCH=arm64`
  - Output binary: `bootstrap`
  - CDK: Use `Runtime.PROVIDED_AL2023` with `Architecture.ARM_64`

### AWS SDK Go v2 Client Pattern

- **Context**: Determine optimal client initialization pattern for Lambda
- **Sources Consulted**:
  - [AWS SDK for Go v2 GitHub](https://github.com/aws/aws-sdk-go-v2)
  - [DynamoDB Go v2 Package](https://pkg.go.dev/github.com/aws/aws-sdk-go-v2/service/dynamodb)
  - [Using DynamoDB With Golang](https://thomasstep.com/blog/using-dynamodb-with-golang)
- **Findings**:
  - SDK v2 clients are thread-safe and should be reused
  - Singleton pattern using `sync.Once` prevents multiple initializations
  - AWS SDK v1 reaches end-of-support July 31, 2025
  - `config.LoadDefaultConfig(context.TODO())` for environment-aware configuration
- **Implications**:
  - Create `internal/clients` package with singleton getters
  - Initialize clients once during Lambda cold start
  - Reuse across invocations for warm starts

### Markdown Processing and XSS Prevention

- **Context**: Convert Markdown to HTML with security guarantees
- **Sources Consulted**:
  - [goldmark GitHub](https://github.com/yuin/goldmark)
  - [bluemonday GitHub](https://github.com/microcosm-cc/bluemonday)
  - [bluemonday Go Package](https://pkg.go.dev/github.com/microcosm-cc/bluemonday)
- **Findings**:
  - goldmark: CommonMark compliant, extensible, does not render raw HTML by default
  - bluemonday: OWASP-inspired HTML sanitizer, prevents XSS
  - `bluemonday.UGCPolicy()` suitable for blog content (allows tables, images, formatting)
  - Order matters: Convert Markdown → HTML → Sanitize with bluemonday
  - CVE-2021-42576 patched; style/script elements suppressed by default
- **Implications**:
  - Create `internal/markdown` package
  - Function: `ConvertAndSanitize(markdown string) string`
  - Pipeline: goldmark.Convert() → bluemonday.UGCPolicy().Sanitize()

### Observability Strategy

- **Context**: Choose tracing and logging approach for Go Lambda
- **Sources Consulted**:
  - [AWS X-Ray SDK for Go](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-go.html)
  - [Instrumenting Go code in Lambda](https://docs.aws.amazon.com/lambda/latest/dg/golang-tracing.html)
  - [aws-xray-sdk-go GitHub](https://github.com/aws/aws-xray-sdk-go)
- **Findings**:
  - Lambda automatically creates X-Ray segments (no SDK required for basic tracing)
  - X-Ray SDK needed for subsegments and AWS SDK call tracing
  - X-Ray SDK entering maintenance mode Feb 25, 2026; EOL Feb 25, 2027
  - AWS recommends migration to OpenTelemetry (ADOT)
  - Go 1.21+ has `log/slog` for structured logging
- **Implications**:
  - Short-term: Use AWS X-Ray SDK for consistency with existing patterns
  - Long-term: Plan migration to ADOT/OpenTelemetry
  - Logging: Use `log/slog` with JSON handler for CloudWatch compatibility
  - Consider AWS Lambda Powertools for Go (community version)

### Project Structure Pattern

- **Context**: Define Go project layout for Lambda monorepo
- **Sources Consulted**:
  - [Standard Go Project Layout](https://github.com/golang-standards/project-layout)
  - [Go AWS Lambda Project Structure](https://medium.com/dm03514-tech-blog/go-aws-lambda-project-structure-using-golang-98b6c0a5339d)
  - [Golang AWS Lambda Project Structure](https://how.wtf/golang-aws-lambda-project-structure.html)
- **Findings**:
  - `cmd/` for executable entry points (one per Lambda function)
  - `internal/` for private shared code (cannot be imported externally)
  - Each Lambda function: `cmd/{domain}/{function}/main.go`
  - Shared code: `internal/{package}/`
  - Single `go.mod` at `go-functions/` root for monorepo
- **Implications**:
  - Structure: `go-functions/cmd/posts/create/main.go`
  - Shared: `go-functions/internal/types/`, `internal/clients/`, etc.
  - Build: Loop over `cmd/` directories to produce binaries

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Flat Structure | Single directory per function | Simple, minimal | Code duplication, no reuse | Not suitable for 11 functions |
| Standard Layout | cmd/ + internal/ | Industry standard, clear boundaries, testable | Slightly more complex | **Selected** - aligns with Go conventions |
| Hexagonal | Ports & adapters | Maximum flexibility | Overkill for Lambda functions | Unnecessary abstraction layer |

## Design Decisions

### Decision: Use Standard Go Project Layout

- **Context**: Need consistent structure for 11 Lambda functions with shared code
- **Alternatives Considered**:
  1. Flat structure with one directory per function
  2. Standard layout with cmd/ + internal/
  3. Hexagonal architecture with ports/adapters
- **Selected Approach**: Standard Go layout with `cmd/` for handlers and `internal/` for shared code
- **Rationale**: Industry standard, enforces encapsulation, allows code reuse, familiar to Go developers
- **Trade-offs**: Slightly deeper directory structure vs maximum code reuse
- **Follow-up**: Validate build times with 11 functions

### Decision: Singleton Pattern for AWS Clients

- **Context**: AWS SDK clients should be reused across Lambda invocations
- **Alternatives Considered**:
  1. Create new client per invocation
  2. Global variables initialized in init()
  3. Singleton with sync.Once
- **Selected Approach**: Singleton pattern using `sync.Once` for thread-safe lazy initialization
- **Rationale**: Thread-safe, lazy initialization, avoids global variable anti-pattern
- **Trade-offs**: Slightly more code vs guaranteed single initialization
- **Follow-up**: Verify performance impact in cold start benchmarks

### Decision: X-Ray SDK with Future ADOT Migration Path

- **Context**: Need distributed tracing for AWS service calls
- **Alternatives Considered**:
  1. No tracing (rely on Lambda automatic segments)
  2. AWS X-Ray SDK for Go
  3. OpenTelemetry / ADOT from start
- **Selected Approach**: AWS X-Ray SDK for initial implementation with documented migration path to ADOT
- **Rationale**: Consistency with existing Node.js/Rust patterns, simpler initial implementation
- **Trade-offs**: Technical debt (migration needed by 2027) vs faster initial delivery
- **Follow-up**: Create ADOT migration task before X-Ray EOL (Feb 2027)

### Decision: Use log/slog for Structured Logging

- **Context**: Need structured JSON logs for CloudWatch Logs Insights
- **Alternatives Considered**:
  1. Standard library log package
  2. Third-party (zerolog, zap)
  3. Go 1.21+ log/slog
- **Selected Approach**: Go 1.21+ `log/slog` with JSON handler
- **Rationale**: Standard library, no external dependencies, native JSON support, sufficient performance
- **Trade-offs**: Slightly less performant than zerolog/zap vs zero external dependencies
- **Follow-up**: Configure slog with Lambda request ID correlation

## Risks & Mitigations

- **API Parity Regression** — Comprehensive parity tests comparing Go vs Node.js/Rust responses
- **Cold Start Performance Miss** — Benchmark each function, optimize binary size with ldflags
- **X-Ray SDK Deprecation** — Document ADOT migration path, schedule migration before EOL
- **Type Mapping Errors** — Use JSON tag validation and integration tests with real DynamoDB

## References

- [AWS Lambda Go Documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-golang.html) — Official Lambda Go guide
- [AWS SDK for Go v2](https://github.com/aws/aws-sdk-go-v2) — Official SDK repository
- [goldmark Markdown Parser](https://github.com/yuin/goldmark) — CommonMark compliant parser
- [bluemonday HTML Sanitizer](https://github.com/microcosm-cc/bluemonday) — XSS prevention
- [AWS X-Ray SDK for Go](https://github.com/aws/aws-xray-sdk-go) — Tracing SDK (maintenance mode Feb 2026)
- [Standard Go Project Layout](https://github.com/golang-standards/project-layout) — Project structure conventions
