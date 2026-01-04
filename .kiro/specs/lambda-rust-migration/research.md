# Research & Design Decisions

## Summary
- **Feature**: `lambda-rust-migration`
- **Discovery Scope**: Complex Integration (runtime migration with full functional parity)
- **Key Findings**:
  - AWS Lambda Rust support is GA (November 2025) with full AWS Support and SLA coverage
  - `tracing` + `tracing-subscriber` provides Lambda Powertools-equivalent structured logging
  - `pulldown-cmark` + `ammonia` directly replaces `marked` + `DOMPurify` for Markdown/XSS

## Research Log

### AWS Lambda Rust Runtime GA Status
- **Context**: Verify production readiness of Rust Lambda support
- **Sources Consulted**:
  - [AWS Lambda adds support for Rust](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-lambda-rust/)
  - [Building Lambda functions with Rust](https://docs.aws.amazon.com/lambda/latest/dg/lambda-rust.html)
  - [Building serverless applications with Rust on AWS Lambda](https://aws.amazon.com/blogs/compute/building-serverless-applications-with-rust-on-aws-lambda/)
- **Findings**:
  - GA announced November 14, 2025
  - Backed by AWS Support and Lambda SLA
  - Available in all AWS Regions (including GovCloud and China)
  - Uses `provided.al2023` OS-only runtime
- **Implications**: Production deployment is fully supported; no experimental caveats

### Rust Lambda Runtime and Tooling
- **Context**: Identify official tools for Lambda development
- **Sources Consulted**:
  - [aws-lambda-rust-runtime GitHub](https://github.com/aws/aws-lambda-rust-runtime)
  - [Cargo Lambda](https://www.cargo-lambda.info/guide/what-is-cargo-lambda.html)
- **Findings**:
  - `lambda_runtime` crate provides Runtime Interface Client (RIC)
  - `lambda_http` crate provides API Gateway event handling with builder pattern
  - `aws_lambda_events` crate provides type definitions for event sources
  - Cargo Lambda simplifies build (`cargo lambda build --arm64`) and local testing (`cargo lambda watch`)
- **Implications**: Mature toolchain; can replicate Node.js development workflow

### AWS SDK for Rust Compatibility
- **Context**: Verify SDK support for DynamoDB, S3, Cognito operations
- **Sources Consulted**:
  - [AWS SDK for Rust documentation](https://docs.aws.amazon.com/sdk-for-rust/latest/dg/make-request.html)
  - [DynamoDB examples using SDK for Rust](https://docs.aws.amazon.com/code-library/latest/ug/rust_1_dynamodb_code_examples.html)
  - [S3 examples using SDK for Rust](https://docs.aws.amazon.com/code-library/latest/ug/rust_1_s3_code_examples.html)
- **Findings**:
  - All required operations supported: PutItem, GetItem, Query, DeleteItem, DeleteObjects
  - S3 presigning via `PresigningConfig` for Pre-signed URLs
  - Cognito InitiateAuth, GlobalSignOut fully supported
  - Fluent builder pattern matches Node.js SDK v3 ergonomics
- **Implications**: 1:1 mapping of all current AWS SDK operations

### Structured Logging and Tracing
- **Context**: Replace Lambda Powertools Logger/Tracer/Metrics
- **Sources Consulted**:
  - [Log and monitor Rust Lambda functions](https://docs.aws.amazon.com/lambda/latest/dg/rust-logging.html)
  - [How to set up Rust logging in AWS Lambda](https://forgestream.idverse.com/blog/20250902-cloudwatch-rust-logging/)
- **Findings**:
  - `tracing` crate with `tracing-subscriber` provides structured JSON logging
  - Native integration with Lambda runtime via `#[tracing::instrument]` annotation
  - Configuration: `.json()`, `.with_current_span(false)`, `.with_ansi(false)`, `.without_time()`
  - Request ID injection via `fields(req_id = %event.context.request_id)`
  - CloudWatch Logs Insights compatible output format
- **Implications**: Equivalent observability; different API but same capabilities

### Markdown Processing and XSS Prevention
- **Context**: Replace `marked` + `DOMPurify` with Rust equivalents
- **Sources Consulted**:
  - [pulldown-cmark GitHub](https://github.com/pulldown-cmark/pulldown-cmark)
  - [ammonia GitHub](https://github.com/rust-ammonia/ammonia)
  - [Rust XSS Guide](https://www.stackhawk.com/blog/rust-xss-guide-examples-and-prevention/)
- **Findings**:
  - `pulldown-cmark`: CommonMark-compliant parser, pull-based (memory efficient)
  - `ammonia`: HTML5-spec sanitizer, strips dangerous attributes (e.g., `onerror`)
  - Recommended pattern: `pulldown_cmark::html::push_html()` → `ammonia::clean()`
  - 15x faster than Python bleach; comparable to DOMPurify performance
  - Configurable allowed tags/attributes matches current DOMPurify config
- **Implications**: Direct replacement; same security guarantees

### CloudWatch Metrics in Rust
- **Context**: Replace Lambda Powertools Metrics
- **Sources Consulted**:
  - AWS SDK for Rust CloudWatch documentation
- **Findings**:
  - `aws-sdk-cloudwatch` crate provides `put_metric_data` operation
  - Custom metrics to `BlogPlatform` namespace supported
  - Alternative: Embedded Metric Format (EMF) via structured logging
- **Implications**: Requires explicit CloudWatch client calls or EMF pattern

### Cargo Workspace Structure
- **Context**: Organize 12 Lambda functions in single project
- **Sources Consulted**:
  - Cargo documentation, Rust Lambda examples
- **Findings**:
  - Workspace with `members` for each function crate
  - Shared `common` crate for types, utilities, constants
  - Each function produces separate binary (`bootstrap`)
  - `cargo lambda build` handles workspace correctly
- **Implications**: Clean separation; shared code via workspace dependencies

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Cargo Workspace | Monorepo with multiple binary crates | Shared types, single build, atomic deploys | Longer build times for all functions | Matches current Node.js project structure |
| Separate Repos | Individual repo per function | Independent deployments | Code duplication, sync overhead | Overkill for 12 functions |
| Lambda Layers | Shared code in Rust Layer | Runtime code sharing | Complex Layer management in Rust | Not recommended for Rust |

**Selected**: Cargo Workspace - maintains monorepo benefits, enables shared `common` crate

## Design Decisions

### Decision: Cargo Workspace Organization
- **Context**: Need to organize 12 Lambda functions with shared code
- **Alternatives Considered**:
  1. Flat structure with all handlers in one crate
  2. Separate repositories per function
- **Selected Approach**: Cargo workspace with domain-based grouping
  - `rust-functions/posts/` - 6 post handlers
  - `rust-functions/auth/` - 3 auth handlers
  - `rust-functions/images/` - 2 image handlers
  - `rust-functions/common/` - shared types, utilities
- **Rationale**: Matches existing Node.js structure; enables incremental migration
- **Trade-offs**: Single build command builds all; larger CI scope
- **Follow-up**: Evaluate parallel build with `cargo lambda build` flags

### Decision: Tracing-based Observability
- **Context**: Replace Lambda Powertools Logger/Tracer/Metrics
- **Alternatives Considered**:
  1. Custom logging facade
  2. Third-party observability crate (e.g., opentelemetry-rust)
- **Selected Approach**: `tracing` + `tracing-subscriber` with JSON output
- **Rationale**:
  - Official AWS documentation recommends this approach
  - Native integration with Lambda runtime
  - Structured JSON compatible with CloudWatch Logs Insights
- **Trade-offs**: Different API than Powertools; learning curve for team
- **Follow-up**: Document logging patterns in developer guide

### Decision: Error Handling with thiserror + anyhow
- **Context**: Implement type-safe error handling matching Node.js patterns
- **Alternatives Considered**:
  1. Custom error enum only
  2. Box<dyn Error> everywhere
- **Selected Approach**: `thiserror` for domain errors, `anyhow` for handler-level
- **Rationale**: Ergonomic error propagation with `?`; maintains type safety
- **Trade-offs**: Two crates for error handling
- **Follow-up**: Define error enum per domain (posts, auth, images)

### Decision: Serde for JSON Serialization
- **Context**: Parse/serialize API Gateway events and responses
- **Alternatives Considered**: None (serde is de facto standard)
- **Selected Approach**: `serde` + `serde_json` with derive macros
- **Rationale**: Universal Rust standard; native Lambda runtime integration
- **Trade-offs**: None significant
- **Follow-up**: Define request/response structs matching Node.js types

### Decision: CDK Integration Strategy
- **Context**: Deploy Rust binaries alongside existing Node.js infrastructure
- **Alternatives Considered**:
  1. Separate CDK app for Rust functions
  2. Complete migration in single deployment
- **Selected Approach**: Extend existing LambdaFunctionsStack with Rust functions
  - Use `lambda.Function` with `Runtime.PROVIDED_AL2023`
  - `Code.fromAsset()` pointing to Cargo Lambda output
  - Parallel deployment during transition
- **Rationale**: Gradual migration; rollback via CDK deploy
- **Trade-offs**: Temporary duplication of function definitions
- **Follow-up**: Feature flags for traffic routing

## Risks & Mitigations

- **Risk 1**: Build time increase with all functions in workspace
  - **Mitigation**: Use `cargo lambda build --package <name>` for targeted builds; enable incremental compilation

- **Risk 2**: Team unfamiliarity with Rust idioms
  - **Mitigation**: Create Rust style guide; pair programming; code review focus on patterns

- **Risk 3**: Integration test compatibility
  - **Mitigation**: Maintain API contract; run existing 46 integration tests against Rust handlers

- **Risk 4**: Cold start regression
  - **Mitigation**: Target <100ms cold start; benchmark before production; optimize binary size

- **Risk 5**: LocalStack compatibility for Rust SDK
  - **Mitigation**: Verify endpoint override support; update integration test setup

## References
- [AWS Lambda Rust GA Announcement](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-lambda-rust/) — Official GA announcement
- [Building Lambda functions with Rust](https://docs.aws.amazon.com/lambda/latest/dg/lambda-rust.html) — AWS documentation
- [aws-lambda-rust-runtime](https://github.com/aws/aws-lambda-rust-runtime) — Official runtime client
- [Cargo Lambda](https://www.cargo-lambda.info/) — Build and deploy tool
- [tracing crate](https://crates.io/crates/tracing) — Structured diagnostics
- [pulldown-cmark](https://github.com/pulldown-cmark/pulldown-cmark) — Markdown parser
- [ammonia](https://github.com/rust-ammonia/ammonia) — HTML sanitizer
