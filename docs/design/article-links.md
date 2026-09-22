# 記事内リンク

リンクツールバーから表示テキストとURLを入力し、「本文中のリンク」または
「枠付きのリンクボタン」を選ぶ。未選択ならキャレット位置へ挿入する。
既存リンクの途中にキャレットを置いて開くと、そのリンク全体を編集できる。
解除時は表示テキストを残す。URLのみの変更では太字などの書式を保持する。

URLはHTTP/HTTPS、`/posts/example`、`./next`、`../about`、`#見出し`を入力できる。
プロトコル相対URL、バックスラッシュ、空白・制御文字、認証情報付きURLは
ダイアログで拒否する。クエリパラメーターは書き換えない。

## 保存形式

通常のリンクは標準Markdown。ボタンはリンク直後に専用マーカーを付ける。

```markdown
[Amazonで商品を見る](https://www.amazon.co.jp/dp/example)

[価格.comで価格を比較する](https://kakaku.com/item/example/){.link-button}
```

`{.link-button}`のみを認識し、任意のclassやHTML属性は受け付けない。
通常の文章として記述する場合は`\{.link-button}`とエスケープする。
コード内や、リンクとの間に空白がある場合はマーカーとして解釈しない。
エディタは表示方法の選択からこの形式を生成するので、著者の手入力は不要。

管理画面はTipTapでプレビューを生成し、保存時のGo処理はgoldmarkの
ASTでマーカーをclassに変換してサニタイズする。CSSは両画面で共用する。
`tests/fixtures/article-links.json`を双方のテストで読み、リンク先・文字・
表示方法・属性の整合を検証する。HTML全体の完全一致は保証しない。

既存のリンクはボタンに自動変換しない。従来の公開側と同様、同じタブで
遷移し、`rel="nofollow noreferrer"`を維持する。画像・価格取得、
アフィリエイト判定、バックフィル、外部API、クラウド設定変更は含まない。

## 検証

- `bun run verify`
- `bun run lint:frontend`
- `make -C go-functions lint`
- `bun run test:e2e:admin tests/e2e/specs/admin-link-dialog.spec.ts tests/e2e/specs/admin-preview-parity.spec.ts`
- Astroのローカルビルドと、公開記事上のボタン表示・スマートフォン幅の確認

E2EはローカルMSWモックのみで実行する。公開先への反映には通常の
バックエンド・管理画面のデプロイと、対象記事を含む静的サイトのビルドが必要。
