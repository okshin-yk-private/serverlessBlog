# 記事公開ビルドの構成と進捗表示

実装の正本は `terraform/modules/codebuild/main.tf`、
`go-functions/internal/sitebuild/sitebuild.go`、`scripts/deploy/atomicDeploy.ts`。

## 保存から配信まで

1. 記事の公開状態に影響する保存・削除と同じDynamoDBトランザクションで、サイト全体の `desiredRevision` を進める。
2. Coordinatorが空いているビルド枠を取得し、CodeBuildを開始する。実行中の追加保存は保持し、完了後に最新の要求をまとめて次のビルドへ送る。
3. CodeBuildが設定されたブランチ（DEV: `develop`、PRD: `main`）を取得する。
4. Bun、Astroと配置スクリプトの依存を準備し、`astro check && astro build` を実行する。Bunはバージョンを固定したGitHub Releasesのアセットを、モジュールに固定したSHA256で検証してから導入する。検証に失敗するとビルドは失敗する（Issue #675）。バージョンを上げる時は `.github/actions/setup-bun-deps/action.yml` の既定値と、`terraform/modules/codebuild/main.tf` のバージョン・SHA256を同時に更新する。
5. 全共有アセットを配置・検証してから、リリース固有のページを配置・検証する。
6. 全ファイルの検証が成功した場合だけ、CloudFront KeyValueStoreの `activeRevision` を条件付き更新する。
7. CodeBuildの状態変更イベントでCoordinatorが完了状態を記録し、後続要求を処理する。EventBridge Schedulerの5分周期の照合は、通知を逃した場合などの復旧経路である。

旧資料の「常に1分の最小間隔」「S3 sync --delete」「CloudFront invalidation」「所要時間は約1〜2分」は現在の経路を表さない。旧 `BuildTrigger` の最小間隔を現在のCoordinatorへ適用して解釈しない。

## 配置の並列化と安全性

- `_astro/` 以下はリリース間で共有するハッシュ付きアセット。
- その他は `releases/<revision>/` 以下に配置する。
- ファイル単位で最大8並列。共有アセットのグループ完了後にページのグループを処理する。
- 既存オブジェクトはサイズを確認し、未配置のものだけ `IfNoneMatch: '*'` で作成する。作成後もサイズを確認する。これはサイズ検証であり、内容全体のチェックサム検証ではない。
- 最初の失敗以降は新しいファイルを開始せず、実行中の処理を待ってから失敗を返す。配置・検証に失敗したリリースへ配信先を切り替えない。
- KVSのETagによる競合検出と、古いリリースの昇格拒否を維持する。

`site-deploy-phase` のJSONログに `upload-and-verify` と `promote` の `durationMs`、`status`、`revision` を記録する。ログの時間は当該スクリプト区間であり、CodeBuildの環境起動、依存準備、KVSの全エッジ伝播時間は含まない。

## 管理画面の進捗API

`GET /admin/posts/{id}/build-status?targetRevision=<保存時のrevision>` はCognito認証を要求する。

- `status`、`targetRevision`、`desiredRevision`、`deployedRevision` はDynamoDBの状態から算出する。CodeBuildが終了していてもCoordinatorの照合が未完了ならポーリングを継続する。
- 対応する実行中ビルドに限り `BatchGetBuilds` で実際の工程・時刻を取得する。待機中の保存に、前のビルドの工程や時刻を流用しない。
- 完了時は `lastBuildId` と `lastBuildRevision` を保持する。成功した保存の時刻はそのrevisionと一致する場合だけ取得し、別の後続ビルドの時刻を表示しない。これらの属性がない既存レコードも状態表示は継続できる。
- 追加フィールドは `phase`、`phases[]`（工程名・状態・開始／終了・秒数）、`failedPhase`、`startTime`、`endTime`、`progressUnavailable`。
- 詳細取得には2秒のタイムアウトを設定する。失敗・履歴なしの場合も状態API自体は成功し、`progressUnavailable: true` として状態表示を維持する。生ログ・環境変数は返さない。
- 状態取得Lambdaの追加権限は対象project ARNの `codebuild:BatchGetBuilds` のみ。CodeBuildの開始権限やDynamoDB書込み権限は追加しない。

## 表示する工程

| 表示 | CodeBuild工程 |
| --- | --- |
| 順番待ち | SUBMITTED、QUEUED、Coordinatorでの後続待ち |
| 準備 | PROVISIONING、DOWNLOAD_SOURCE、INSTALL、PRE_BUILD |
| ページ生成 | BUILD |
| 公開処理 | POST_BUILDと終了処理 |

S3配置とKVS切替は **POST_BUILD** 内で実施する。`UPLOAD_ARTIFACTS` をサイト公開と読み替えない（このプロジェクトは `NO_ARTIFACTS`）。

管理画面は約5秒間隔で取得し、工程、ビルド開始からの経過時間、工程別の時間、失敗した工程を表示する。成功・失敗で取得を停止し、新しい保存では前の工程・時計をリセットする。割合や残り時間は推測しない。狭い画面では工程を2列に折り返す。

「ビルド完了」は配置・配信先切替の完了であり、全閲覧地点での反映を確認した意味ではない。公開URLで期待する記事の版を確認する処理は、現在は含まない。

## 計測と次の最適化

実測では、保存から反映までと画面の完了表示までを分け、次を記録する。

- 対象環境、期間、成功・失敗の件数、記事数、生成ファイル数。
- QUEUED、PROVISIONING、DOWNLOAD_SOURCE、INSTALL、PRE_BUILD、BUILD、POST_BUILDの時間。
- 配置スクリプトの区間時間、キャッシュの有無、連続保存による後続待ち。
- 中央値とp95。ただし少数サンプルや異なるソースSHAの結果を混ぜた比較には限界がある。

2026-09-16の変更前ローカル参考計測は、モック公開記事2件・依存導入済み・Mac arm64／Bun 1.3.11／Node 24.11.1／Astro 7.3.2で、型検査3.03秒、生成1.12秒。出力1,242ファイル中、共有アセット1,218件。各1回のみで、AWS通信・環境起動を含まない。この値から本番の短縮秒数を断定しない。

キャッシュ変更、型検査のCIへの分離、増分ビルド、compute変更は今回の実装に含めない。実測結果で支配的な工程を確認してから判断する。

## 一次資料

- [AWS CodeBuild Build API](https://docs.aws.amazon.com/codebuild/latest/APIReference/API_Build.html)
- [AWS CodeBuild BuildPhase](https://docs.aws.amazon.com/codebuild/latest/APIReference/API_BuildPhase.html)
- [CodeBuild IAM permissions](https://docs.aws.amazon.com/codebuild/latest/userguide/auth-and-access-control-permissions-reference.html)
- [CodeBuild events: best effort delivery](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-codebuild.html)
- [CloudFront KeyValueStoreの伝播](https://aws.amazon.com/blogs/aws/introducing-amazon-cloudfront-keyvaluestore-a-low-latency-datastore-for-cloudfront-functions/)
