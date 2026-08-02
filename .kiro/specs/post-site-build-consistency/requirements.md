# 要件: 記事と公開サイトビルドの整合性

## Requirement 1: 公開状態の収束

**Objective:** 管理者として、記事の公開状態を変更した最終結果を公開サイトへ確実に反映したい。

### Acceptance Criteria

1. 新規公開、下書きから公開、公開から下書き、公開中記事の明示保存、公開記事削除はサイトビルド要求を作成すること。
2. 下書きの明示保存、下書き記事削除、自動保存はサイトビルド要求を作成しないこと。
3. 記事変更とビルド要求のrevision更新は同一DynamoDBトランザクションに含めること。
4. 実行中ビルドがある場合も最新のdesired revisionを保持し、完了後の後続ビルドで回収すること。
5. ビルド成功時だけdeployed revisionを進め、失敗時は直前の公開サイトを維持すること。

## Requirement 2: 相関可能なビルド状態

**Objective:** 管理者として、自分の保存操作に対応する公開反映状態を確認したい。

### Acceptance Criteria

1. ビルド要求を伴う保存レスポンスはtarget revisionと状態を返すこと。
2. 状態APIはtarget revisionを受け取り、過去の成功ビルドを新しい要求の成功と判定しないこと。
3. deployed revisionがtarget revision以上の場合だけ反映完了とすること。
4. queued、in-progress、succeeded、failedを区別すること。
5. 一覧再読み込み後も現在のサイトビルド状態を取得できること。

## Requirement 3: 完了通知と補償

**Objective:** 運用者として、CodeBuild完了イベントの欠落や重複があっても最終状態へ収束させたい。

### Acceptance Criteria

1. CodeBuild State ChangeのEventBridgeイベントで状態照合Lambdaを起動すること。
2. EventBridge targetに再試行とDLQを設定すること。
3. 定期スケジュールでも同じ照合Lambdaを起動すること。
4. 完了イベントはBuild IDとactive revisionを条件に冪等処理すること。
5. starting状態の中断を検出して再開できること。

## Requirement 4: 明示保存後の一覧表示

**Objective:** 管理者として、保存後に記事一覧へ戻り、公開反映状態を確認したい。

### Acceptance Criteria

1. 新規作成・編集の明示保存後は公開状態にかかわらず記事一覧へ遷移すること。
2. 公開状態変更と公開記事削除でも同じビルド状態UIを表示すること。
3. 状態は3〜5秒間隔でポーリングし、対象revisionの成功または失敗で停止すること。
4. API取得失敗とビルド失敗を区別して表示すること。

## Requirement 5: カテゴリ未設定の自動保存

**Objective:** 管理者として、カテゴリを選ぶ前でも編集中の下書きを失わずに保存したい。

### Acceptance Criteria

1. 自動保存payloadはpublishStatusを変更せず、saveMode=autosaveを明示すること。
2. 新規自動保存は常にdraftを作成すること。
3. カテゴリ未設定の自動保存はcategory属性をDynamoDBへ保存しないこと。
4. 既存公開記事の自動保存でカテゴリが未設定なら、永続化済みカテゴリを維持すること。
5. 明示保存と公開記事ではカテゴリ必須を維持すること。
