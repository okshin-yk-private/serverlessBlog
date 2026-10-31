# 記事のリージョン外バックアップ

記事（下書きを含む）とカテゴリを毎日 Markdown / JSON に書き出し、大阪リージョン（`ap-northeast-3`）の
S3 バケットへ Object Lock 付きで保存する。実装は `terraform/modules/content-backup/` と
`go-functions/cmd/posts/export_backup/`、`go-functions/internal/contentbackup/`。

## 何を守り、何を守らないか

| 事象 | DynamoDB PITR（既存） | このバックアップ |
| --- | --- | --- |
| 誤削除・誤更新（35 日以内） | 復元できる | 復元できる（保持期間内） |
| 東京リージョンの障害 | 守れない | 守れる |
| 管理者権限の漏えいによる削除 | テーブルごと消され得る | PRD は COMPLIANCE のため保持期間中は root でも消せない |
| AWS アカウントの停止・閉鎖 | 守れない | **守れない**（同じアカウント内） |
| 画像（images バケット） | 対象外 | **対象外**（images バケットのバージョニングで非最新版を 90 日保持） |
| `contentHtml` | 含む | 含まない（保存時に `contentMarkdown` から生成されるため） |

## 環境ごとの設定

| 項目 | PRD | DEV |
| --- | --- | --- |
| Object Lock モード | COMPLIANCE | GOVERNANCE |
| 保持期間 | 30 日 | 1 日 |
| オブジェクトの失効 | 31 日後 | 2 日後 |
| `force_destroy` | false | true |
| 失敗アラーム | あり（monitoring の SNS へ通知） | なし |
| 実行時刻 | 毎日 03:00 JST | 同左 |

### COMPLIANCE モードの注意

- 保持期間中のオブジェクトは、root ユーザーを含め誰も削除できず、保持期間の短縮もできない。
  バケットも全バージョンが消えるまで削除できない。PRD で `terraform destroy` すると、
  最後のスナップショットから 31 日経つまでバケットの削除に失敗する。
- 保持期間を延ばす変更は既存のバージョンに影響しない（新しく書いたものから適用される）。
  長くしすぎると取り消せないため、変数 `retention_days` は 1〜90 日に制限している。
- バケットポリシーで `s3:PutObjectRetention` と `s3:PutObjectLegalHold` を全員に拒否している。
  漏えいした認証情報で保持期間を延ばされ、削除できないオブジェクトを作られるのを防ぐため。
  ただしバケットポリシー自体を書き換えられる権限があれば外せるので、多層防御の一つにすぎない。

## 保存形式

1 回の実行ごとに新しいプレフィックスへ書き出す。

```
snapshots/<UTC 時刻 例: 2026-10-31T180005Z>/
  posts/<記事 ID>.md
  categories.json
  manifest.json
```

- `manifest.json` は最後に書く。**`manifest.json` がないプレフィックスは途中で失敗した実行**であり、
  復元に使わない（Lambda の自動再試行では、試行ごとに別のプレフィックスへ書く）。
- `manifest.json` には記事数・下書き数・カテゴリ数と、各ファイルの SHA-256 を記録する。
- 記事ファイルは YAML front matter + 本文の Markdown。front matter の値は JSON でエンコードしており
  （JSON は YAML として有効）、改行や引用符を含むタイトルもそのまま往復できる。

```markdown
---
id: "..."
version: 3
title: "..."
slug: "..."
publishStatus: "draft"
category: "tech"
tags: ["go", "aws"]
imageUrls: []
authorId: "..."
createdAt: "..."
updatedAt: "..."
---
本文
```

## 復元

自動の復元ツールはない。手順は次のとおり。

1. 完全なスナップショットを選ぶ。

   ```bash
   aws s3 ls s3://<bucket>/snapshots/ --region ap-northeast-3
   aws s3 cp s3://<bucket>/snapshots/<prefix>/manifest.json - --region ap-northeast-3
   ```

2. 取得して、`manifest.json` の SHA-256 と照合する。

   ```bash
   aws s3 cp --recursive s3://<bucket>/snapshots/<prefix>/ ./restore/ --region ap-northeast-3
   ```

3. 記事を戻す。front matter の各キーが DynamoDB の属性名と同じなので、`contentMarkdown` に本文を入れて
   `PutItem` する。`contentHtml` は管理画面から一度保存し直すと再生成される。
   カテゴリは `categories.json` の各要素をそのままカテゴリテーブルへ `PutItem` する。
4. 公開サイトを再ビルドする（`aws codebuild start-build --project-name <project>`）。

東京リージョン内の誤操作なら、まず PITR での復元を検討する（属性をそのまま戻せる）。

## 監視

- PRD のアラーム `<project>-content-backup-prd-errors` は、エクスポート Lambda の `Errors` が 1 時間に 1 件以上で通知する。
  全関数合計のアラーム（5 分で 5 件超）では、1 日 1 回の失敗は検知できないため、別に用意している。
- **実行されなかったこと**（スケジュールの停止など）は検知しない。Scheduler は Terraform で管理しているので、
  ドリフトがなければ止まらない前提にしている。

## 初回デプロイ前の確認

- デプロイ用ロール（GitHub Actions の `AWS_ROLE_ARN`。Terraform 管理外）が、`ap-northeast-3` で
  S3 バケットの作成・Object Lock 設定・ライフサイクル・バケットポリシーを操作できること。
  リージョンを制限するポリシーや SCP があると、PRD の apply がこのモジュールで失敗する。
- DEV で 1 回以上の実行と `manifest.json` の生成を確認してから PRD に出す（DEV は GOVERNANCE・1 日なので後始末できる）。

## 費用

数十件の記事なら 1 回数 MB 未満で、30 日分を保存しても 1 GB に届かない。
S3 の保存料・PUT 料金・東京→大阪のデータ転送料を合わせて月数セント程度の見込み（未計測）。
