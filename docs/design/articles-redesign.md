# Home / Articles 分離の実装記録

更新日: 2026-09-20

## 実装状態

承認済みのデザイン方針を公開フロントエンドへ実装した。ベースは `origin/develop` (`cbde534`)。本記録はローカル検証結果を示す。PRのCI結果はGitHub上で別途確認する。AWS設定変更・デプロイは対象外。

| ページ | 実装内容 |
| --- | --- |
| `/` | Homeとして最新記事1件、サイト紹介、既存プロフィール・SNSリンク、全記事への導線を表示 |
| `/articles/` | 投稿カレンダー、検索、カテゴリー・公開日フィルター、全公開記事の一覧。本文にAbout情報は置かない |
| `/posts/[slug]/` | 既存URLを保持し、一覧への戻り先をArticlesへ変更。長いURL・表が狭い画面からはみ出さないよう調整 |
| `/about/` | 既存の紹介内容を保持 |
| `/404.html` | 記事を探す導線をArticlesへ変更 |

ロゴ・フォント・テーマ切替・Adminリンクを保持した。カレンダーはHTML/CSSと小さなクライアントスクリプトで描画し、新規ライブラリを追加していない。管理画面・共有本文CSS・バックエンドは変更していない。

## 日付と操作の定義

- 現在公開中の記事を `publishedAt` の日本時間の日付ごとに集計する。作成日・更新日では補完しない。
- 欠損・不正な公開日は「公開日不明」、ビルド時点より未来の公開日時は「公開日要確認」として集計から除外する。記事一覧には残す。
- 色の段階は0件／1件／2件／3件以上。未来の日は未集計として区別する。
- PCは選択年全体、幅899px以下は3か月ずつ表示する。年選択・前後の四半期移動を提供する。
- 日付・検索文字列・カテゴリーはAND条件。公開日だけの解除と全条件の解除を設ける。
- 年を切り替えると日付選択を解除する。表示年自体では記事一覧を絞り込まない。
- カレンダーでは矢印キー、Home/End、Enterで操作できる。日付入力からも同じ絞り込みを行える。
- JavaScript無効時も記事一覧とカレンダーは表示し、機能しない検索操作は隠す。読み込み中の領域を確保し、操作UIの初期化で一覧が移動する問題を防いだ。

この図は投稿行為の監査履歴ではない。削除・非公開化した記事は次のビルドで集計から外れる。集計は静的生成時点のスナップショットで、画面に基準日を表示する。実データの `publishedAt` 完全性は今回照合していない。

## 検証結果

すべてローカルのモックAPIで実施。AWSや本番データへの書き込みは行っていない。

| 検証 | 結果 |
| --- | --- |
| Astro型チェック | 0 errors / 0 warnings / 0 hints |
| 単体テスト | 385件成功、17ファイル |
| カバレッジ | Statements 97.47%、Branches 95.23%、Functions 99.32%、Lines 97.64%。既存95%基準を維持 |
| 静的ビルド・統合テスト | 通常モック6ページ生成、135件成功 |
| Chromium E2E | 19件成功 |
| 表示・操作 | 320/390/768/1440px、両テーマ、200%文字拡大、日付・カテゴリー・検索の組み合わせ、年・四半期移動、キーボード、JS無効 |
| データ状態 | 通常2件に加えて0/1/20件の別ビルド。長い日本語タイトル・タグ、長いURL・コード・表、公開日欠損を確認 |
| アクセシビリティ | Home/Articlesの両テーマでaxe違反なし。公開側の薄い文字色を調整。WCAG全体への適合を宣言するものではない |
| 読込時の安定性 | JSを保留し、CSS・フォント読込後と初期化後の記事一覧位置を390/1440pxで比較。差2px以内 |

実行コマンド（先頭以外は対応するディレクトリで実行）:

```sh
# リポジトリルート
bun run typecheck:astro

# frontend/public-astro
bash tests/build-with-mock.sh
bun tests/build-publication-states.ts
bun run test:coverage -- --run
bun run test:integration -- --run

# リポジトリルート。4321で最新distのpreviewを起動しておく
BASE_URL=http://127.0.0.1:4321 VITE_ENABLE_MSW_MOCK=true PUBLICATION_STATES=true bun run test:e2e -- tests/e2e/specs/editorial.spec.ts tests/e2e/specs/articles-accessibility.spec.ts tests/e2e/specs/publication-states.spec.ts tests/e2e/specs/home.spec.ts tests/e2e/specs/article.spec.ts --workers=2
git diff --check
```

fixture生成物は `test-results-publication-fixtures/` に隔離し、通常の `dist` は上書きしない。

## 性能測定と残る制約

同一ベース・同一モック記事・同一ローカル静的サーバーでLighthouseのモバイル模擬測定を実施した。圧縮やCDNを含む本番の測定ではない。

| ページ | Performance | LCP | CLS | 転送量 |
| --- | ---: | ---: | ---: | ---: |
| 変更前Home | 60 | 11.43秒 | 0.0005 | 1,870,844 bytes |
| 変更後Home | 67 | 7.96秒 | 0.0091 | 1,929,107 bytes |
| 新設Articles | 65 | 11.88秒 | 0.0093 | 1,964,534 bytes |

複数回の測定ではLCPに大きな揺れがあり、速度改善とは断定できない。既存の大きなロゴ・CSS・日本語フォントと非圧縮配信が転送量に影響する。Homeは約58KB、Articlesは変更前Home比で約94KB増えた。Articlesの初期実装にあったCLS約0.204は修正したが、総合的な性能改善完了とは扱わない。

今後の優先事項:

1. P1: 公開前のレビュー・CIと、配信環境でのURL・実データの日付確認。ローカル成功とデプロイ成功は別の状態として扱う。
2. P2: 実配信で性能を測定し、必要に応じて既存画像・CSS・フォントの配信量を最適化する。

## 根拠と信頼性

- ページ構成と操作: [Home](../../frontend/public-astro/src/pages/index.astro)、[Articles](../../frontend/public-astro/src/pages/articles.astro)、[検索処理](../../frontend/public-astro/src/lib/archiveSearch.ts)。今回の実装コードとローカル実行結果に基づく。
- 集計: [日付・カレンダーロジック](../../frontend/public-astro/src/lib/publicationCalendar.ts)と対応する単体テスト。JST境界・うるう年・不正日時・未来日時・重複・非公開記事を検証。
- 配信パス: [CDN定義](../../terraform/modules/cdn/main.tf)のdefault behaviorはSSG用Functionを使い、拡張子のないURIを `index.html` へ変換する。コード上では `/articles/` も対象。AWS実環境への適用状態は今回確認していない。
- SEO: Articlesのcanonical・sitemapを検証。既存の記事構造化データ・RSS等の方針は維持。既存SEO側には `createdAt` のフォールバックが残るため、公開日欠損時は画面表示と異なる場合がある。
- デザイン: 事前に承認されたImageGen案を参考にし、画像内の架空の日付・件数や不正確な曜日配置は実装データとして使っていない。

Firefox・Safariの実機、スクリーンリーダーの実機、本番配信の性能は未検証。

## 追加修正: 月名のある週だけマスが大きくなる問題

ユーザーの画面報告を受け、月名の文字幅が週内の暗黙のグリッド列を広げていることをブラウザーで実測した。週内の列を `minmax(0, 1fr)` で明示し、月名の幅が日付セルの幅を変えないように修正した。

回帰検証では、修正前の1440px表示でセル幅に2.125pxの差があり失敗することを確認。修正後は320/390/768/1440px・両テーマで幅と高さの差が0.1px未満となり、正方形であることも確認した。表示中のブラウザー（945px幅）でも全セルの幅・高さが11.940〜11.953pxに揃った。差は小数ピクセルへの丸めの範囲。

再検証は型チェック0 errors/warnings/hints、単体385件、統合135件、関連E2E 13件、変更ファイルの整形、`git diff --check` が成功。ローカルプレビューを更新済み。デプロイは未実施。
