# Golang Migration Plan

Node.js + Rust Lambda関数のGolang統一移行計画

---

## 現状分析

### 現行アーキテクチャ（デュアル実装）

| ドメイン | Node.js (`functions/`) | Rust (`rust-functions/`) |
|---------|------------------------|--------------------------|
| Posts | createPost, getPost, getPublicPost, updatePost, deletePost, listPosts | create_post, get_post, get_public_post, list_posts, update_post, delete_post |
| Auth | login, logout, refresh | login, logout, refresh |
| Images | getUploadUrl, deleteImage | get_upload_url, delete_image |
| 共通 | `shared/` (types, constants, auth-utils) | `common/` (types, error, markdown, metrics, tracing, clients) |

### 技術スタック

**Node.js実装:**
- Runtime: Node.js 24.x (NODEJS_24_X)
- Architecture: ARM64 (Graviton2)
- Package Manager: Bun
- SDK: AWS SDK v3
- Observability: Lambda Powertools for TypeScript

**Rust実装:**
- Rust: 1.92
- Runtime: provided.al2023 (custom runtime)
- SDK: aws-sdk-rust v1
- Crates: lambda_runtime, lambda_http, serde_dynamo, pulldown-cmark, ammonia

### 課題

1. **二重メンテナンス**: 同一機能の2言語実装による保守コスト増大
2. **パリティテスト負荷**: API一貫性確保のための追加テスト必要
3. **ビルド複雑性**: Node.js + Rust両方のCI/CDパイプライン維持
4. **スキルセット分散**: チームに2言語の習熟が必要

---

## 移行ターゲット: Golang

### 選定理由

| 観点 | Node.js | Rust | Go | 判定 |
|------|---------|------|-----|------|
| コールドスタート | ~100-200ms | ~10-30ms | ~30-50ms | Go優位 |
| メモリ効率 | 中 | 高 | 高 | Go/Rust同等 |
| ビルド時間 | 速い | 遅い (2-5分) | 速い (~30秒) | Go優位 |
| 学習曲線 | 低 | 高 | 中 | Go優位 |
| AWS SDK成熟度 | 高 | 中 | 高 | Go/Node同等 |
| エラーハンドリング | Callback/Promise | Result型 | error型 | Go実用的 |
| 並行処理 | Event Loop | async/await | goroutine | Go直感的 |

### Golang採用のメリット

1. **シングルバイナリ**: デプロイ単純化、Lambda Layerの削減
2. **高速ビルド**: Rustの10倍以上高速
3. **低コールドスタート**: Node.jsより50-70%削減
4. **AWS公式サポート**: Lambda Go Runtime、SDK v2が成熟
5. **チーム統一**: 1言語への収束による学習・保守コスト削減

---

## 移行戦略

### アプローチ: Strangler Fig Pattern

既存システムを稼働させながら、段階的に新実装へ置き換え。

```
Phase 1: 共通ライブラリ移行
         common/ → go-common/

Phase 2: 低リスク関数から移行
         getPublicPost, listPosts (読み取り専用)

Phase 3: 認証系移行
         login, logout, refresh

Phase 4: CRUD操作移行
         createPost, updatePost, deletePost, getPost

Phase 5: 画像系移行
         getUploadUrl, deleteImage

Phase 6: 旧実装削除
         functions/, rust-functions/ 削除
```

### ディレクトリ構造（移行後）

```
go-functions/
├── cmd/
│   ├── posts/
│   │   ├── create/main.go
│   │   ├── get/main.go
│   │   ├── get_public/main.go
│   │   ├── list/main.go
│   │   ├── update/main.go
│   │   └── delete/main.go
│   ├── auth/
│   │   ├── login/main.go
│   │   ├── logout/main.go
│   │   └── refresh/main.go
│   └── images/
│       ├── get_upload_url/main.go
│       └── delete/main.go
├── internal/
│   ├── types/types.go
│   ├── errors/errors.go
│   ├── markdown/markdown.go
│   ├── clients/aws.go
│   └── middleware/
│       ├── logging.go
│       ├── tracing.go
│       └── metrics.go
├── go.mod
├── go.sum
└── Makefile
```

---

## 技術要件

### 依存ライブラリ

```go
// go.mod (想定)
require (
    github.com/aws/aws-lambda-go v1.47.0
    github.com/aws/aws-sdk-go-v2 v1.30.0
    github.com/aws/aws-sdk-go-v2/service/dynamodb v1.34.0
    github.com/aws/aws-sdk-go-v2/service/s3 v1.58.0
    github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider v1.43.0
    github.com/yuin/goldmark v1.7.0           // Markdown処理
    github.com/microcosm-cc/bluemonday v1.0.26 // XSS対策
)
```

### Observability

- **Logging**: AWS Lambda Powertools for Go (または標準log/slog)
- **Tracing**: AWS X-Ray SDK for Go
- **Metrics**: CloudWatch Embedded Metrics Format (EMF)

### ビルド設定

```makefile
# Makefile
GOOS=linux
GOARCH=arm64
CGO_ENABLED=0

build:
	@for dir in cmd/*/; do \
		func=$$(basename $$dir); \
		go build -ldflags="-s -w" -o bin/$$func/bootstrap ./$$dir; \
	done
```

---

## CI/CD更新計画

### 新規追加ワークフロー

```yaml
# .github/workflows/ci.yml への追加
go-lint:
  name: Go Lint (golangci-lint)
  runs-on: ubuntu-latest
  if: needs.setup-labels.outputs.has-go == 'true'
  steps:
    - uses: golangci/golangci-lint-action@v4

go-tests:
  name: Go Unit Tests
  runs-on: ubuntu-latest
  if: needs.setup-labels.outputs.has-go == 'true'
  steps:
    - run: go test -race -coverprofile=coverage.out ./...
```

### ラベル追加

```yaml
# .github/labeler.yml
go:
  - changed-files:
      - any-glob-to-any-file: 'go-functions/**/*'
```

---

## リスクと緩和策

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| API互換性の崩れ | 高 | パリティテスト継続、OpenAPI spec活用 |
| 移行中の障害 | 中 | フィーチャーフラグでの切り替え |
| チームの学習コスト | 中 | Go基礎研修、ペアプログラミング |
| デプロイメント複雑化 | 低 | CDKでの並列デプロイサポート |

---

## 成功指標

1. **パフォーマンス**: コールドスタート < 50ms (現Node.js比50%削減)
2. **ビルド時間**: CI全体 < 5分 (現Rust含む10分超から削減)
3. **コードベース**: 単一言語化による保守性向上
4. **テスト**: 100%カバレッジ維持

---

## タイムライン概要

| フェーズ | 内容 | 依存関係 |
|---------|------|----------|
| Phase 0 | Goプロジェクト初期化、共通ライブラリ移行 | なし |
| Phase 1 | 読み取り系関数移行 (getPublicPost, listPosts) | Phase 0 |
| Phase 2 | 認証系関数移行 (login, logout, refresh) | Phase 1 |
| Phase 3 | CRUD操作移行 (create, update, delete, get) | Phase 2 |
| Phase 4 | 画像系関数移行 (getUploadUrl, deleteImage) | Phase 3 |
| Phase 5 | 旧実装削除、CI/CD簡素化 | Phase 4 |

---

## 参考資料

- [AWS Lambda Go Runtime](https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html)
- [AWS SDK for Go v2](https://aws.github.io/aws-sdk-go-v2/docs/)
- [Strangler Fig Application Pattern](https://martinfowler.com/bliki/StranglerFigApplication.html)

---

*Last Updated: 2026-01-04 (Migration Planning)*
