# Public Astro site

公開記事は `src/content.config.ts` の `posts` collection に集約する。
`src/loaders/posts.ts` が公開APIを全ページ取得し、`src/lib/postSchema.ts` のschemaで検証する。
トップ・記事一覧・記事詳細・RSSは同じビルド時点のcollectionを参照する。

## 記事取得とキャッシュ

- `API_URL` は `astro build` / `astro dev` で必須。認証情報は使用しない。
- ビルドごとに全件取得・検証し、成功後にstoreを置換する。削除・下書き化した記事は残さない。
- API取得・schema検証・重複ID・ページング循環のエラーはビルドを失敗させる。古いキャッシュへのフォールバックは行わない。
- `contentHtml` と日付文字列を維持する。公開日不明・未来日の扱いは既存の `publicationCalendar` に従う。
- `astro check` / `astro sync` は**型生成・検査専用**。APIへアクセスせずstoreをクリアする。記事を取得するにはbuildまたはdevを実行する。
- `bun run build` はcheck→buildを順次実行する。check/syncとbuild/devを同じcheckoutで並行実行しない。独立したビルドテストではキャッシュと出力先を分離する。
- `.astro/` は生成物であり、Gitに含めない。

## ローカル検証

```sh
bun run check
bun run test:coverage --run
bash tests/build-with-mock.sh
bun run test:integration --run
```

`tests/content-collections-build.test.ts` はローカルAPIと分離したキャッシュ・出力先を使用し、取得回数、再ビルド時の削除、障害時の停止、API不要の型検査を検証する。

設計の参照元: [Astro Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/)、[Astro integration hooks](https://docs.astro.build/en/reference/integrations-reference/#astroconfigsetup)。実際の動作はlockfileに固定したAstroで上記のビルドテストにより確認する。
