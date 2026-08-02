# Go Lambda Functions

Goで実装されたLambda関数のコードとテストをまとめています。

## 構成
- `cmd/` : 各Lambda関数のエントリーポイント
- `internal/` : 共通ロジックやドメイン型
- `tests/` : テスト（パリティ/ベンチマークなど）
- `bin/` : ビルド済みバイナリ（生成物）

## 前提
- Go 1.26.5（完全なパッチバージョンは`go.mod`が唯一の参照元）
- golangci-lint v2.12.2（Go 1.26以上でビルドしたもの）

### golangci-lintのインストール

Go 1.26.5を有効にしてから、固定版をインストールします。

```bash
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.12.2
golangci-lint version
```

出力に`has version 2.12.2`および`built with go1.26`が含まれることを確認してください。
`make lint`はGoまたはgolangci-lintが不一致の場合、解析panicの代わりに修正方法を示して停止します。

## ビルド
```bash
cd go-functions
make build
```

## テスト
```bash
cd go-functions
make test
```

## Lint
```bash
cd go-functions
make lint
```
