# Go Lambda Functions

Goで実装されたLambda関数のコードとテストをまとめています。

## 構成
- `cmd/` : 各Lambda関数のエントリーポイント
- `internal/` : 共通ロジックやドメイン型
- `tests/` : テスト（パリティ/ベンチマークなど）
- `bin/` : ビルド済みバイナリ（生成物）

## 前提
- Go 1.25.x

## ビルド
```bash
cd go-functions
make build
```

## テスト
```bash
cd go-functions
go test -race -coverprofile=coverage.out ./...
```

## Lint
```bash
cd go-functions
golangci-lint run
```
