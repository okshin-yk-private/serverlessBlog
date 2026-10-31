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
  バケットも全バージョンと削除マーカーが消えるまで削除できない。31 日後の失効は
  削除マーカーの追加であり、本体は非現行化からさらに 1 日後に削除対象になる。
  UTC 日付の丸めと非同期処理もあるため、PRD の `terraform destroy` は日数だけで判断せず、
  スケジュール停止後に全バージョンの削除完了を確認する。
- 保持期間を延ばす変更は既存のバージョンに影響しない（新しく書いたものから適用される）。
  長くしすぎると取り消せないため、変数 `retention_days` は 1〜90 日に制限している。
- バケットポリシーで `s3:PutObjectRetention` と `s3:PutObjectLegalHold` を全員に拒否している。
  漏えいした認証情報で保持期間を延ばされ、削除できないオブジェクトを作られるのを防ぐため。
  ただしバケットポリシー自体を書き換えられる権限があれば外せるので、多層防御の一つにすぎない。

## 保存形式

1 回の実行（再試行を含む）ごとにランダム UUID v4 を生成し、新しいプレフィックスへ書き出す。
同じ秒に開始した実行でも保存先を共有しない。時刻だけを使った既存のバックアップも引き続き復元できる。

```
snapshots/<UTC 時刻>-<ランダム UUID>/
  posts/<記事 ID>.md
  categories.json
  manifest.json
```

- `manifest.json` は最後に書く。**バージョン履歴にも完了時の `manifest.json` がないプレフィックスは途中で失敗した実行**であり、
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

自動の復元ツールはない。以下は **S3 の読み取りとローカルへの取得・検証** の手順であり、
DynamoDB への書き戻しや公開サイトの再ビルドは別途承認してから行う。
AWS CLI v2、Bash、jq、Python 3 を使用する。取得先には下書きも含まれるため、共有されない作業ディレクトリを使う。

### 1. バージョン一覧から信頼できる manifest を選ぶ

Object Lock は **各バージョン** を保護する。同じキーへの新しい書き込みや削除マーカーの追加は防がない。
そのため、通常の `aws s3 ls` / `aws s3 cp --recursive` や `IsLatest=true` だけでは復旧対象を選べない。
削除マーカーは削除せず、過去のバージョンを直接取得する。

復旧用の認証情報には対象バケットの `s3:ListBucketVersions` と対象オブジェクトの
`s3:GetObjectVersion` が必要（エクスポート Lambda の書き込み専用ロールとは別）。
以下の手順に S3 の書き込み・削除権限は不要で、権限付与自体もこの手順では行わない。

```bash
# 復旧を許可された読み取り専用プロファイルを指定する。
set -euo pipefail
export AWS_PROFILE='<recovery-read-only-profile>'
export AWS_PAGER=''
BACKUP_BUCKET='<backup-bucket>'
BACKUP_REGION='ap-northeast-3'
umask 077
mkdir backup-recovery
cd backup-recovery

# AWS CLI の自動ページングを有効のまま使う。--no-paginate / --max-items は付けない。
aws s3api list-object-versions \
  --bucket "$BACKUP_BUCKET" --prefix 'snapshots/' --region "$BACKUP_REGION" \
  --output json > versions.json
jq '[.Versions[]? | select(.Key | endswith("/manifest.json")) |
  {Key, VersionId, LastModified, IsLatest}]' versions.json
```

侵害が疑われる場合、侵害開始の可能性がある最も早い日時より前の S3 `LastModified` を持つ版を候補にし、
信頼できる実行ログや監査記録を照合して manifest の
**キーと VersionId** を選ぶ。`Versions` 内のデータ版を選び、`DeleteMarkers` 内の版は選ばない。
保持中の版であることや `LastModified` だけで真正性が証明されるわけではない。
manifest は署名されておらず、後述の SHA-256 も manifest 自身の真正性は証明しない。
信頼できる manifest を特定できない場合は、復元を進めず調査する。
CloudTrail を裏付けに使えるのは、事故前から対象 S3 のデータイベントを記録していた場合に限る。

```bash
MANIFEST_KEY='snapshots/<selected-prefix>/manifest.json'
MANIFEST_VERSION_ID='<selected-data-version-id>'
aws s3api get-object \
  --bucket "$BACKUP_BUCKET" --key "$MANIFEST_KEY" \
  --version-id "$MANIFEST_VERSION_ID" --region "$BACKUP_REGION" \
  manifest.json > manifest-download.json
printf '%s\t%s\n' "$MANIFEST_KEY" "$MANIFEST_VERSION_ID" > selected-manifest.tsv
jq '{formatVersion, prefix, generatedAt, postCount, categoryCount}' manifest.json
jq '[{key: .categoriesKey, sha256: .categoriesSha256}] +
  [.posts[] | {key, sha256}]' manifest.json > expected-files.json
mkdir verified
```

`formatVersion=1`、prefix と選択したキーの対応、件数、全ファイルキーがその prefix 内にあることを確認する。
manifest に含まれる文字列をシェルコマンドとして実行したり、ローカルパスとして直接使用したりしない。
新旧の prefix 形式どちらでも、この manifest のキー一覧を使う。

### 2. 各ファイルを版指定で取得し、ハッシュが一致するものだけ採用する

`expected-files.json` の **全記事と categories.json** に対して以下を繰り返す。
対象キーの `Versions` を一覧し、候補の VersionId を指定して取得する。
各ファイルの VersionId はそれぞれ異なるため、manifest の VersionId を流用しない。
元の実装で同じ秒の実行が重なっていた場合にも、同じ prefix の過去の版からハッシュで区別する。

```bash
OBJECT_KEY='snapshots/<selected-prefix>/posts/<post-id>.md'
jq --arg key "$OBJECT_KEY" \
  '[.Versions[]? | select(.Key == $key) | {VersionId, LastModified, IsLatest}]' versions.json
OBJECT_VERSION_ID='<candidate-data-version-id>'
aws s3api get-object \
  --bucket "$BACKUP_BUCKET" --key "$OBJECT_KEY" \
  --version-id "$OBJECT_VERSION_ID" --region "$BACKUP_REGION" \
  candidate.bin > candidate-download.json

# 不一致ならここで停止する。候補を変えて取得し直し、一致する版がなければ復元を止める。
python3 - "$OBJECT_KEY" <<'PYVERIFY'
import hashlib
import json
import sys
from pathlib import Path

entries = json.loads(Path("expected-files.json").read_text())
matches = [entry for entry in entries if entry["key"] == sys.argv[1]]
if len(matches) != 1:
    raise SystemExit("STOP: key must occur exactly once in the manifest")
actual = hashlib.sha256(Path("candidate.bin").read_bytes()).hexdigest()
if actual != matches[0]["sha256"]:
    raise SystemExit("STOP: SHA-256 mismatch; do not restore this version")
print("SHA-256 OK")
PYVERIFY

# 毎回別のローカル名を手で割り当て、キーや VersionId とともに記録する。
LOCAL_FILE='verified/0001.bin'
test ! -e "$LOCAL_FILE"
mv candidate.bin "$LOCAL_FILE"
printf '%s\t%s\t%s\n' "$OBJECT_KEY" "$OBJECT_VERSION_ID" "$LOCAL_FILE" >> selected-versions.tsv
```

全件を取得したら、欠落・重複と取得後の内容を再検証する。

```bash
python3 - <<'PYVERIFYALL'
import csv
import hashlib
import json
from pathlib import Path

entries = json.loads(Path("expected-files.json").read_text())
expected = {entry["key"]: entry["sha256"] for entry in entries}
if len(expected) != len(entries):
    raise SystemExit("STOP: duplicate manifest keys")
with Path("selected-versions.tsv").open() as selected:
    rows = list(csv.reader(selected, delimiter="\t"))
if any(len(row) != 3 for row in rows):
    raise SystemExit("STOP: malformed selection record")
if len(rows) != len(expected) or {row[0] for row in rows} != set(expected):
    raise SystemExit("STOP: missing or duplicate selected files")
for key, version_id, filename in rows:
    if not version_id or hashlib.sha256(Path(filename).read_bytes()).hexdigest() != expected[key]:
        raise SystemExit("STOP: selected file failed verification")
print(f"Verified all {len(rows)} files; no database writes performed")
PYVERIFYALL
```

照合済みの全ファイル、選択した manifest とその VersionId、`versions.json`、
`selected-versions.tsv` を一緒に保管する。元のバージョンが保持期限後に消去済みであれば、
この手順では復元できない。削除マーカーや不正な新しい版を削除する必要はない。

### 3. 書き戻しは別途確認してから実施する

全件のハッシュ照合だけでは、実際の DynamoDB 復元や公開サイトの正常動作は確認できない。
承認された復元先で、front matter を DynamoDB の属性へ変換し、本文を `contentMarkdown` に戻す。
`contentHtml` は Markdown から再生成する（管理画面を使うなら本文を含めて保存し直す）。
カテゴリも対応する属性型に変換する。必要な記事・カテゴリを検証してから公開サイトを再ビルドする。
読み取り検証の途中で `PutItem` や CodeBuild の起動を行わない。

参照: [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)、
[list-object-versions](https://docs.aws.amazon.com/cli/latest/reference/s3api/list-object-versions.html)、
[get-object](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-object.html)。

東京リージョン内の誤操作なら、まず PITR での復元を検討する（属性をそのまま戻せる）。

## 復元手順のローカル検証

`python3 -m unittest discover -s tests/docs -v` は、この文書の Bash / Python コードを
AWS CLI のローカル代替と合成データで実行する。上書き・削除マーカーがあっても旧版を取得できること、
ハッシュ不一致・欠落時に停止することを検証する。AWS には接続せず、実際の権限、Object Lock、
DynamoDB への復元成功を証明するものではない。実環境の検証は別途承認が必要。

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
