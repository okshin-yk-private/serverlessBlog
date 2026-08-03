# 要件: KVS atomic deployment

## Requirement 1: 完全なリリース単位の公開

**Objective:** 運用者として、ビルド途中の混在したサイトを利用者に見せずに公開を切り替えたい。

### Acceptance Criteria

1. デプロイ処理は、公開ドキュメントを `releases/{revision}/` にアップロードすること。
2. デプロイ処理は、全オブジェクトのアップロードと存在・サイズ検証が成功するまで公開ポインタを変更しないこと。
3. 検証失敗時、デプロイ処理は既存の公開ポインタを維持すること。
4. デプロイ処理は公開バケットのルートを `sync --delete` で逐次更新しないこと。

## Requirement 2: KVSによる単一ポインタ切り替え

**Objective:** 運用者として、CloudFront設定全体を変更せず単一値でリリースを切り替えたい。

### Acceptance Criteria

1. Terraformは環境ごとにCloudFront KeyValueStoreを作成すること。
2. CloudFront Functionは `activeRevision` を読み、公開サイトのオリジンURIを `/releases/{revision}` で接頭すること。
3. KVSのキーが未設定または不正な場合、Functionは移行前のS3ルートへフォールバックすること。
4. KVS更新はETagによる条件付き更新とし、競合時は最新状態を再取得すること。
5. デプロイ処理は現在値より小さいCodeBuildビルド番号を持つリリースへの自動切り替えを拒否すること。

## Requirement 3: 伝播中の整合性と境界保護

**Objective:** 利用者として、KVSの伝播中も旧版・新版のどちらか一方として完全なページを閲覧したい。

### Acceptance Criteria

1. Astroのハッシュ付きアセットは共有 `/_astro/` に先にアップロードし、リリース切り替え時に削除しないこと。
2. `/api`、`/admin`、`/images`、`/_astro` はリリース接頭辞の対象外とすること。
3. 拡張子なしの公開URLは既存仕様どおり `index.html` へ正規化してからリリース接頭辞を付与すること。
4. リリース切り替えはCloudFrontの全パスinvalidationを必要としないこと。

## Requirement 4: 運用・権限・ロールバック

**Objective:** 運用者として、最小権限でデプロイし、一定期間は旧版へ戻せるようにしたい。

### Acceptance Criteria

1. CodeBuildは対象バケットへのPut/Get/Listと対象KVSのDescribe/Get/Updateだけを付与されること。
2. devとprdのTerraform outputはリリースKVS ARNを公開すること。
3. `releases/` は30日保持し、その期間はKVSポインタを旧revisionへ戻せること。
4. 共有 `/_astro/` はリリース保持期限の削除対象外とすること。
