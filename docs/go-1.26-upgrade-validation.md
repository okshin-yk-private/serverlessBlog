# Go 1.26.5 更新の検証記録

更新日: 2026-08-02

## 採用バージョンと根拠

- Go: `1.26.5`。Go公式の[Release History](https://go.dev/doc/devel/release)および
  [Downloads](https://go.dev/dl/)で確認した1.26系の最新安定パッチ。
- golangci-lint: `v2.12.2`。公式
  [v2.12.2 release](https://github.com/golangci/golangci-lint/releases/tag/v2.12.2)を固定し、
  Go 1.26対応がv2.9.0から導入されたことを
  [公式PR #6271](https://github.com/golangci/golangci-lint/pull/6271)で確認した。

Goの完全なパッチバージョンは`go-functions/go.mod`を唯一の参照元とする。
`scripts/ci/verify-go-toolchain.sh`はCI、deploy、security scan、nightly、および
local deployとの不一致を検出する。

## ローカル検証結果

| 項目 | 結果 | 信頼性・制約 |
| --- | --- | --- |
| `go mod tidy -diff` | 差分なし | Go 1.26.5で実行 |
| `go vet ./...` | 成功 | Go 1.26.5で実行 |
| golangci-lint v2.12.2 | 0 issues、panicなし | 公式配布バイナリはGo 1.26.2でビルド |
| unit + coverage | 成功、90.9% | CI閾値90%以上 |
| `go test -race ./...` | 全32パッケージ成功 | Go 1.26.5で実行 |
| 全Lambda cross-build | 19成果物、`linux/arm64` ELF | `CGO_ENABLED=0`、`-trimpath`、`-buildid=` |
| 再現性 | 2回のSHA-256一覧が一致 | 同一ソース・同一ツールチェーンで実施 |

### バイナリサイズ比較

| Go | 成果物数 | 合計サイズ | 差分 |
| --- | ---: | ---: | ---: |
| 1.25.12 | 19 | 201,067,260 bytes | 基準 |
| 1.26.5 | 19 | 207,882,586 bytes | +6,815,326 bytes（+3.39%） |

10%の警戒基準を下回る。ただし、比較用の1.25.12成果物は更新前develop、1.26.5は
lint互換性のための定数化を含む本ブランチから作成した。この差は小さいと考えられるが、
コンパイラだけの純粋な差分ではない。

## dev段階リリースで必須の確認

Go 1.26ではGC実装が変更されているため、上記のローカル検証だけで性能回帰なしとは
結論付けない。通常のdeploy workflowでdevへ反映した後、変更前と同じ観測期間・同じ
トラフィック条件で以下を比較する。

1. `posts-create`、`posts-update`、`posts-delete`、`posts-list`、`posts-build_status`の
   CloudWatch `Errors`、`Throttles`、`Duration`、`Max Memory Used`、`Init Duration`。
2. 記事作成、更新、公開、下書き化、一覧取得、ビルド状態確認のスモークテスト。
3. バイナリサイズ、コールドスタート、メモリのいずれかが10%以上悪化した場合は、
   prdへ進めず、直前のGo 1.25.12成果物またはコミットへロールバックする。

このdev観測はAWS環境への変更とCloudWatch実測を伴うため、本PRのローカル検証とは
分離する。結果はPRまたはIssue #507に追記してからprdデプロイを承認する。
