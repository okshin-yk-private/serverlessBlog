# Research & Design Decisions

## Summary
- **Feature**: `add-mindmap`
- **Discovery Scope**: New Feature（新規ドメイン追加 + 既存パターン拡張のハイブリッド）
- **Key Findings**:
  - ReactFlow（管理画面エディタ）+ D3.js（公開ビューア）の2ライブラリ構成が最適
  - DynamoDB単一アイテム格納は500ノード以下で実用的（350KB制限で安全マージン確保）
  - Astro Islands Architecture の `client:load` ディレクティブでD3ビューアをハイドレーション

## Research Log

### マインドマップ描画ライブラリ選定
- **Context**: 管理画面（React SPA）でのエディタと公開サイト（Astro SSG）でのビューアに最適なライブラリを調査
- **Sources Consulted**: npm registry, GitHub repos, ReactFlow公式チュートリアル, D3.js公式ドキュメント
- **Findings**:
  - **ReactFlow (@xyflow/react)**: MIT, ~35k stars, 2.9M weekly DL, ネイティブTS, Reactノード描画対応。公式マインドマップチュートリアルあり。ズーム/パン内蔵。dagre/elkjsでツリーレイアウト
  - **D3.js (d3-hierarchy + d3-zoom)**: ISC, ~110k stars, d3-hierarchy ~8KB + d3-zoom ~8KB + d3-selection ~5KB = ~21KB gzipped。vanilla JSで動作、React不要
  - **markmap**: read-only（Markdown→マインドマップ変換のみ）。エディタ用途に不適
  - **simple-mind-map**: 機能豊富だが26.2MB unpacked、TypeScript未対応、単一メンテナ
  - **jsMind**: 軽量だがTypeScript未対応、カスタマイズ限定的
  - **GoJS**: 商用ライセンス、不適
- **Implications**: 管理画面にReactFlow、公開ビューアにD3.jsの2ライブラリ構成を採用。共通JSONデータフォーマットで変換

### Astro SSGでのクライアントサイドJS統合
- **Context**: 公開サイト（Astro SSG）でマインドマップをインタラクティブに描画する方式
- **Sources Consulted**: Astro公式ドキュメント（Islands Architecture, Framework Components）
- **Findings**:
  - `client:load` - ページロード時に即座にハイドレーション（メインコンテンツ向き）
  - `client:visible` - ビューポート進入時にハイドレーション（下部コンテンツ向き）
  - `client:only="react"` - SSRなしのクライアントオンリー
  - D3.jsはvanilla JSのため、Astroの `<script>` タグで直接利用可能。Reactランタイム不要
- **Implications**: 公開ビューアはD3.jsベースのvanilla JSスクリプトとして実装し、Astroの `<script>` タグで読み込む。React不要で軽量

### DynamoDB 400KBアイテムサイズ制限
- **Context**: マインドマップノードデータをDynamoDB単一アイテムに格納する妥当性
- **Sources Consulted**: AWS DynamoDB公式ドキュメント, DynamoDB Item Size Calculator
- **Findings**:
  - ノード1件あたりサイズ: minimal ~150B, typical ~300B, rich ~700B
  - 100ノード: ~15-70KB, 200ノード: ~30-140KB, 500ノード: ~75-350KB
  - 500ノード × richメタデータで ~350KB → 400KB制限に対する安全マージンが薄い
- **Implications**: ノード数500上限 + シリアライズサイズ350KB上限の二重バリデーションで運用。ノートのテキスト長制限（1000文字）も設ける

### 記事へのマインドマップ埋め込み方式
- **Context**: ブログ記事内に `{{mindmap:ID}}` マーカーでマインドマップを埋め込む方式
- **Sources Consulted**: 既存コードベース（Go markdown処理、Astro SSGビルド）
- **Findings**:
  - 既存Go側markdown処理: `goldmark` でMarkdown→HTML変換。カスタムマーカーの処理は未実装
  - 方式A: Go側でHTML変換時にマーカーを `<div data-mindmap-id="ID">` に変換
  - 方式B: フロントエンド側でHTML内のマーカーテキストをJSで検出・置換
- **Implications**: 方式Aを採用。Go側で `{{mindmap:ID}}` を `<div class="mindmap-embed" data-mindmap-id="ID"></div>` に変換し、Astro SSGビルド時に該当マインドマップデータをJSON埋め込み。クライアントサイドJSで描画

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| ReactFlow + D3 2ライブラリ | 管理画面にReactFlow、公開ビューアにD3.js | 各用途に最適、公開サイト軽量 | 2つの描画実装の保守 | 推奨 |
| ReactFlow単一 | 管理画面・公開ビューア共にReactFlow | 実装統一、保守容易 | 公開サイトにReactランタイム必要（~200KB gzipped） | 開発速度優先なら許容 |
| D3.js単一 | 全てD3.jsで自前実装 | 最軽量、依存最小 | エディタ構築に膨大な工数 | 非推奨 |

## Design Decisions

### Decision: 2ライブラリ構成（ReactFlow + D3.js）
- **Context**: 管理画面と公開サイトで異なるUX要件（エディタ vs 軽量ビューア）
- **Alternatives Considered**:
  1. ReactFlow単一 — 保守容易だが公開サイトが重い
  2. D3.js単一 — 最軽量だがエディタ構築工数が過大
  3. simple-mind-map — 機能豊富だがTS未対応・巨大パッケージ
- **Selected Approach**: ReactFlow（管理画面）+ D3.js（公開ビューア）
- **Rationale**: 管理画面はReact SPAなのでReactFlowが自然。公開サイトはSSGでページ軽量化が重要なのでvanilla JS D3.jsが最適。共通JSONデータフォーマットで変換コスト最小
- **Trade-offs**: 2つの描画実装の保守コスト vs 最適なUXとパフォーマンス
- **Follow-up**: ReactFlowのdagreレイアウト統合の実装パターンを確認

### Decision: DynamoDB単一アイテム格納
- **Context**: マインドマップノードデータの永続化方式
- **Alternatives Considered**:
  1. DynamoDB単一アイテム（JSON格納）— シンプル、原子的更新
  2. DynamoDB複数アイテム（ノード毎）— 大規模対応だがクエリ複雑
  3. S3にJSON格納 + DynamoDBにメタデータ — 無制限サイズだが整合性管理が複雑
- **Selected Approach**: DynamoDB単一アイテム + サイズ/ノード数バリデーション
- **Rationale**: 500ノード以下のマインドマップは350KB以内に収まる。単一アイテムなら原子的な読み書きが保証され、実装がシンプル
- **Trade-offs**: サイズ制限あり vs 実装・運用のシンプルさ
- **Follow-up**: 将来的に大規模マインドマップが必要になった場合、S3格納への移行パスを検討

### Decision: マーカー変換方式（Go側HTML変換）
- **Context**: 記事内 `{{mindmap:ID}}` マーカーの処理方式
- **Alternatives Considered**:
  1. Go側でMarkdown→HTML変換時にdiv要素に変換
  2. フロントエンドJSでテキストマーカーを検出・置換
- **Selected Approach**: Go側でHTML変換時に `<div class="mindmap-embed" data-mindmap-id="ID"></div>` に変換
- **Rationale**: SSGビルド時にHTMLが確定するため、Go側で変換しておけばAstroがdata属性を読み取ってデータ埋め込み可能。フロントエンドでのDOM操作を最小化
- **Trade-offs**: Go側のmarkdown処理への依存 vs クリーンなHTML出力

## Risks & Mitigations
- ReactFlowのメジャーバージョンアップによるAPI変更 — package.jsonでバージョン固定、定期的な更新確認
- D3.jsビューアとReactFlowエディタ間のレイアウト差異 — 共通レイアウトアルゴリズム（dagre）を両方で使用
- DynamoDB 400KB制限への接近 — サイズ/ノード数の二重バリデーション + ノートテキスト長制限
- Astro SSGビルド時のAPI依存 — ビルド時APIエラーハンドリング、フォールバック表示

## References
- [ReactFlow公式](https://reactflow.dev/) — マインドマップチュートリアル含む
- [D3.js d3-hierarchy](https://d3js.org/d3-hierarchy) — ツリーレイアウトアルゴリズム
- [Astro Islands Architecture](https://docs.astro.build/en/concepts/islands/) — クライアントサイドハイドレーション
- [DynamoDB Item Size Limits](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html) — 400KB制限
