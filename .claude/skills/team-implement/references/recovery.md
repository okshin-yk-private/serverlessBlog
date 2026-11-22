# Post-Spawn 自動リカバリ（3 体目の Executor がタイムアウトした場合）

Phase 4 の逐次起動で 3 体目の Executor から 90 秒以内に idle 通知が届かない場合、以下の順で段階的に復旧する。

## Layer 2: SendMessage による起動確認

```
# Step 1: Executor 3 に作業指示を再送
SendMessage(
  type="message",
  recipient="executor-3",
  content="作業を開始してください。タスクリストを確認し、自分に割り当てられたタスクを実装してください。",
  summary="Executor 3 に起動リマインドを送信"
)
# Step 2: 60 秒待機
Bash(command="sleep 60")
# Step 3: TaskList で Executor 3 のタスク状態を確認
TaskList()
# → タスクが in_progress になっていれば成功（Phase 5 へ進む）
# → pending のままなら Layer 3 へ進む
```

## Layer 3: 対象ペインを特定できない場合は手動復旧

Agent Teams のメッセージ送信とタスク状態の再確認で復旧しない場合は、対象 Executor 名と状態を報告してユーザーに手動介入を依頼する。

- 最大 pane index 等から対象ペインを推測して `tmux send-keys` を自動実行しない。`Enter` 送信が入力途中のコマンド実行や確認プロンプトの誤承認につながる恐れがあるため。
- 自動復旧のための tmux 操作権限を新たに追加しない。他の Executor の進行を妨げずに次で確認する。

```
AskUserQuestion(
  questions=[{
    question="Executor 3 が起動していません。対象ペインと入力内容を確認して手動で再開してください。",
    header="手動介入",
    options=[
      {label: "実行済み", description: "Ctrl+J Enter を手動で実行した"},
      {label: "キャンセル", description: "Executor 3 の起動を諦める"}
    ],
    multiSelect: false
  }]
)
```
