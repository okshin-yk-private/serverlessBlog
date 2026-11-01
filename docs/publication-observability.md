# CloudWatchで公開・API・バックアップを確認する

既存の `BlogPlatform-Monitoring` を拡張する。Omni、外部転送、新しいトレース基盤、メトリクス送信用IAMは追加しない。PRDのみ有効で、実環境への適用とクエリの実行確認は別承認。

## 計測の意味

| 表示                                     | 元データ                                         | 意味と限界                                                                                                        |
| ---------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Save request to verified public manifest | `site-build-accepted` と `site-public-confirmed` | 同じbuild ID / contentRevisionを結び、最初のconfirmedAtMsからrequestedAtMsを引く                                  |
| CodeBuild phase durations                | 標準の `AWS/CodeBuild`                           | `Duration`は全体、他は各工程。積み上げ表示にしない。平均を表示し、個別ビルドは既存build-status APIで調べる        |
| Admin API                                | 既存API Gatewayアクセスログ                      | `/admin/`のルートテンプレート別p50/p95/最大応答時間と4xx/5xx件数。OPTIONSを除く。記事ID、ユーザー、IPは表示しない |
| Latest backup completion                 | 既存JSON完了ログ                                 | 選択期間内で最後の完了時刻・件数。復元可能性の証明ではない                                                        |

`requestedAtMs` は記事保存と同じトランザクションで記録する**保存要求時刻**であり、コミット完了時刻ではない。起動ロックでrevisionを確認した時点の値を既存Lambdaログへ残す。複数保存がまとめられた場合、ビルド対象の最新保存を代表する。すべての保存や公開されない下書きのレイテンシ分布ではない。

`contentRevision` はDynamoDBの単調増加番号、`releaseRevision` はデプロイ識別子で、同じものではない。CodeBuildが元から持つ `CONTENT_REVISION` と `CODEBUILD_BUILD_ID` を利用して結び付ける。どちらもログの項目にとどめ、カスタムメトリクスのdimensionにはしない。

`site-public-confirmed` は既存の独立確認処理がHTTP 200、manifestスキーマ、期待するreleaseRevision一致を確認した後だけ出力する。CodeBuild成功イベントから生成しない。確認失敗時は `site-public-unconfirmed` を記録し、confirmedAtMsは出さない。これは観測した配信経路のmanifest確認であり、全エッジへの伝播や全記事本文の一致までは証明しない。

古い開始処理の復旧で、保存状態が既に新しいrevisionへ進んでいる場合、その新しい保存時刻を古いビルドへ結び付けない。元の開始ログが残っていればそこから結合できる。ログ欠落、期間外、手動ビルド、旧実装のビルドでは時間が空欄になる。空欄を0秒や成功として補完しない。計測欠損がデプロイを止めたり、ビルド調整の状態を変更したりしない。

## 表示範囲と費用

既定は直近30時間。日次バックアップを通常表示できる範囲に限定する。最後の成功が期間より古い場合、表は空になるため、既存の途絶アラームを確認し、調査時だけ期間を延ばす。

ログクエリは4個。保存→公開は作成・更新・削除・照合Lambdaの4ロググループと該当CodeBuildの1グループ、APIはそのAPIのアクセスログ1グループ、バックアップはそのLambdaの1グループを明示指定する。アカウント全体や名前prefixの探索はしない。行数limitは表示件数のみで、スキャン料金の上限ではない。

コンソールの更新は**手動、または15分**とする。DashboardBody JSONに更新間隔の設定項目はないため、Terraformで強制したとは扱わない。表示・更新のたびにログクエリが再実行される。調査では時間をさらに短くし、不要なダッシュボードタブを閉じる。

4の変更ではダッシュボードを1個更新するだけで、新規CloudWatch資源やカスタムメトリクスは増やさない。標準メトリクスを再利用するが、ダッシュボード、追加ログ保存、Logs Insightsスキャンには料金・使用枠の影響がある。実トラフィックと契約を確認して予算を見積もる。1〜3のバックアップ成功メトリクス/アラームの費用は別。

## 適用後の受入確認（別承認）

- DEV/PRDのplanで既存ダッシュボード変更と必要なLambdaコード更新以外の想定外差分がないことを確認する。CSP昇格フラグと途絶通知の初期条件は変えない。
- 承認した合成記事の保存要求から公開manifest確認まで、contentRevision、build ID、releaseRevision、時刻を照合する。連続保存、後続ビルド、確認失敗/タイムアウト、開始復旧では誤った保存時刻を結合しないことを確認する。
- ログクエリの実行、APIの数値型集計、CloudWatchの表示を確認する。Terraformのmockテストは実際のLogs Insights構文実行や取り込み形式を検証しない。
- 公開ログの確認失敗だけを解決するためにCSPやIAMを緩和しない。ログには本文、URLの認証情報、ヘッダー、環境変数全体を出力しない。
- 1週間程度の実際のログ量・クエリスキャン量と、画面で必要な時間範囲を見て調整する。

参考: [ダッシュボード構文](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/CloudWatch-Dashboard-Body-Structure.html)、[更新間隔](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/change_dashboard_refresh_interval.html)、[CodeBuildメトリクス](https://docs.aws.amazon.com/codebuild/latest/userguide/cloudwatch_metrics-codebuild.html)、[Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)。
