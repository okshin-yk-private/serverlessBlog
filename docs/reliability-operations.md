# バックアップ・公開処理の監視と復元検証

この手順のローカル検証はAWSを使用しない。DEV検証・アラーム有効化・本番反映は、それぞれ対象と副作用を確認して別途承認を得る。#835の復元修正はdevelopにあるため、その修正を含むリリースで適用する。

## 復元手順の継続検証

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/docs -v` をCIの必須lintジョブで実行する。Python標準ライブラリ、bash、jqを使用し、[復元手順](content-backup.md)の実際のコードブロックを偽AWS CLIに対して実行する。削除マーカー・上書き後の元バージョン回収、内容破損、ファイル欠落、削除マーカー選択を検査する。実データやAWS認証情報は使用しない。

この成功はIAM、Object Lock、リージョン障害、実際の復元速度を保証しない。

## DEV合成データ復元演習（別承認）

1. 事前に対象AWSアカウント・DEV・リージョン・作業者・実施時間・予算上限を確認する。PRDのテーブル／バケットを使わない。承認対象を、専用の合成データ用テーブル・バックアップ領域の準備、エクスポート実行、上書き・削除マーカー生成、バージョン読み出し、合成復元先への書込み、後片付けまで具体化する。既存DEVの通常記事も対象外とする。
2. 公開記事・下書き・日本語/Unicode本文・カテゴリ・画像参照を持つ架空データを準備し、期待する件数・SHA-256・原稿をローカル保存する。本文内の画像は参照のみで、画像バイナリはこのバックアップに含まれない。
3. 実際のエクスポータで専用入力から出力し、manifestを最後に作成する動作とユニークprefixを確認する。同秒重複起動を行う場合も対象を合成領域に限定する。各実行のprefix、manifestと各ファイルのVersionId、保持期限を記録する。
4. 合成スナップショットの一部を同じキーに上書きし、別の一部とmanifestに削除マーカーを作る。GOVERNANCE保持の解除や強制削除で保護を迂回しない。
5. [復元手順](content-backup.md)で記録した非削除VersionIdを選ぶ。manifestとすべての参照ファイルを取り出し、ハッシュと件数を照合する。誤ったVersionId・破損内容で処理が止まることも確認する。
6. 取得したMarkdown/JSONを検査し、必要なら別の空の合成復元先へ手動で再投入する。現手順はファイルの回収であり、元テーブルへの自動リストアではない。タイトル・本文・公開状態・カテゴリ・画像参照を期待値と比較する。
7. 開始、回収完了、検証完了、利用可能になった時刻を記録し、RTOと実際のバックアップ間隔からのRPOを評価する。権限失敗や手作業も記録する。
8. 保持中のオブジェクトは期限まで残る。期限後の後片付け担当と日付を決める。VersionIdを含む検証記録を残すが、認証情報や実記事を記録しない。

## 監視の判定と初回導入

| 信号                 | 条件                                                                                                                     | 通知と限界                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 公開ビルド失敗       | `AWS/CodeBuild FailedBuilds`、5分Sum >= 1                                                                                | 既存SNS。クライアント起因の失敗/タイムアウト。`FAULT`と意図的な`STOPPED`はこの標準メトリクスの対象外 |
| 完了イベントDLQ      | Visible >= 1が5分区間で2回連続                                                                                           | 既存SNS。瞬間的滞留を抑制。処理中メッセージは含まず、5分周期の照合が既に復旧している場合もある       |
| バックアップ失敗     | 既存Lambda Errors                                                                                                        | 変更せず維持                                                                                         |
| バックアップ完了途絶 | `content backup completed`のJSONログを固定名のCountメトリクスへ変換し、`FILL(completed,0)`が26個の1時間区間すべてで1未満 | 毎時評価。正確に最終成功26時間後を保証しない。S3可読性・復元可能性の証明ではない                     |

CodeBuildとDLQはアイドル時の欠測を正常扱いにする。ALARMへの遷移でのみ通知し、OK通知は追加しない。同じ障害が既存Lambda Errorsにも出る場合、build ID / revision / 時刻で関連付ける。失敗が継続してALARMのままならビルドごとのメールは来ない。

完了ログフィルターは過去に遡ってメトリクスを作らない。初回導入ではfreshnessアラームを作成するが、**通知は既定で無効**（`backup_freshness_alarm_actions_enabled=false`）。他の失敗アラームは有効なまま。

初回適用の担当者は、次の日次バックアップ完了、Countの到着、アラームOK、SNS購読確認を読み取りで確認する。確認後、別途承認した設定変更で `backup_freshness_alarm_actions_enabled=true` にする。完了しなければ導入未完了として調査し、無効状態を放置しない。設定反映でALARM状態からの新しい通知が必ず来るとは限らないため、切替時も状態を確認する。日次以外へスケジュール変更する場合は26時間の窓も見直す。

追加資源はPRDで標準メトリクスアラーム2個、成功ログメトリクス1個、freshnessアラーム1個。料金は実際のリージョン・契約で確認する。DEVの既定では追加監視資源を作らない。新規Lambda、SNS、IAMポリシー、ダッシュボードは追加しない。

## 通知時の確認

- CodeBuild: build ID、状態、失敗工程、ログを確認し、desired/deployed revisionと公開`release-manifest.json`を照合する。失敗したビルドがあっても旧サイトは配信されうる。再実行は承認範囲を確認する。
- DLQ: 可視件数と送信時刻、EventBridge/対象Lambdaの失敗、定期照合の結果を確認する。状態復旧済みか調べてから再配信を判断する。確認せずpurge/redriveしない。
- 完了途絶: Scheduler、Lambda Invocations/Errors/ログ、直近manifestの存在を調べる。ログ遅延や日程変更と実際の未実行を区別する。リトライや実データ復元は別途承認する。

参考: [CloudWatch評価](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarm-evaluation.html)、[ログメトリクス](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html)、[FILL](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/using-metric-math.html)、[CodeBuildメトリクス](https://docs.aws.amazon.com/codebuild/latest/userguide/cloudwatch_metrics-codebuild.html)。
