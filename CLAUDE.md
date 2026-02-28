# AI-DLC and Spec-Driven Development

Kiro-style Spec Driven Development implementation on AI-DLC (AI Development Life Cycle)

## Project Context

### Paths
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/`

### Steering vs Specification

**Steering** (`.kiro/steering/`) - Guide AI with project-wide rules and context
**Specs** (`.kiro/specs/`) - Formalize development process for individual features

### Active Specifications
- Check `.kiro/specs/` for active specifications
- Use `/kiro:spec-status [feature-name]` to check progress

## Development Guidelines
- Think in English, generate responses in English. All Markdown content written to project files (e.g., requirements.md, design.md, tasks.md, research.md, validation reports) MUST be written in the target language configured for this specification (see spec.json.language).
- Use `bun` instead of `npx` for running Node.js packages and scripts.

## Minimal Workflow
- Phase 0 (optional): `/kiro:steering`, `/kiro:steering-custom`
- Phase 1 (Specification):
  - `/kiro:spec-init "description"`
  - `/kiro:spec-requirements {feature}`
  - `/kiro:validate-gap {feature}` (optional: for existing codebase)
  - `/kiro:spec-design {feature} [-y]`
  - `/kiro:validate-design {feature}` (optional: design review)
  - `/kiro:spec-tasks {feature} [-y]`
- Phase 2 (Implementation): `/kiro:spec-impl {feature} [tasks]`
  - `/kiro:validate-impl {feature}` (optional: after implementation)
- Progress check: `/kiro:spec-status {feature}` (use anytime)

## Development Rules
- 3-phase approval workflow: Requirements → Design → Tasks → Implementation
- Human review required each phase; use `-y` only for intentional fast-track
- Keep steering current and verify alignment with `/kiro:spec-status`
- Follow the user's instructions precisely, and within that scope act autonomously: gather the necessary context and complete the requested work end-to-end in this run, asking questions only when essential information is missing or the instructions are critically ambiguous.

## Steering Configuration
- Load entire `.kiro/steering/` as project memory
- Default files: `product.md`, `tech.md`, `structure.md`
- Custom files are supported (managed via `/kiro:steering-custom`)

## Context-Optimized Investigation (MANDATORY)

To reduce context accumulation, **ALL research tasks MUST be delegated** to a separate context using the Task tool.

### Automatic Delegation Rules

**CRITICAL**: When encountering ANY of the following, you MUST use the Task tool (NOT direct MCP calls):

| Trigger | Action |
|---------|--------|
| Terraform error from `terraform plan/apply/validate` | Task tool → research error cause and solution |
| Need to look up AWS service documentation | Task tool → research AWS docs |
| Need to look up Terraform resource/module docs | Task tool → research Terraform docs |
| Need to look up CDK construct/pattern | Task tool → research CDK docs |
| Comparing AWS services or architecture decisions | Task tool → research comparison |
| Any "調査して" / "research" / "investigate" request | Task tool → delegate research |

### How to Delegate

**Step 1**: Identify the research topic

**Step 2**: Use Task tool with these parameters:
```
Task(
  subagent_type="general-purpose",
  description="[Brief description of research]",
  prompt="[Detailed research instructions including which MCP tools to use]"
)
```

**Step 3**: The agent returns only a summary to this conversation

### Example: Terraform Error

When you see an error like:
```
Error: Invalid resource type "aws_lambda_function"
```

**DO NOT** call Terraform MCP tools directly. Instead:
```
Task(
  subagent_type="general-purpose",
  description="Terraform error investigation",
  prompt="Research this Terraform error using mcp__awslabs_terraform-mcp-server tools: [error]. Find cause and solution."
)
```

### Custom Commands Available

Users can also invoke directly:
- `/investigate-aws <topic>` - AWS research
- `/investigate-terraform <topic>` - Terraform research
- `/investigate-cdk <topic>` - CDK research

### WHY This Matters

- Direct MCP calls accumulate in this conversation's context
- Task tool runs in separate context, returning only summary
- This significantly reduces token usage for long conversations

### Language
- 英語で考え出力は日本語

## Agent Teams (Parallel Issue Implementation)

### Usage
```
/team-implement <issue1> <issue2> [issue3] ... [-y]
```

### Architecture
- **Commander** (lead session): Issue取得、コンフリクト分析、TaskList管理、PR作成
- **Executor** (teammate): 各Issueを独立したGit worktreeでTDD実装

### Conflict Detection (Two-Layer)
1. **Structured**: Issue本文の「対象ファイル」セクションからファイルパス抽出
2. **AI Analysis**: 修正方針から影響を受ける追加ファイルを推測

### Conflict Resolution Rules
- 同一ファイルを複数Issueが編集 → 逐次実行（blockedBy依存）
- 同一ディレクトリ、別ファイル → 並列実行
- 完全独立 → 完全並列

### Worktree Convention
- 場所: `.claude/worktrees/` （.gitignore済み）
- ブランチ: `fix/issue-<N>` or `feat/issue-<N>`
- ベース: 常に `origin/develop`

### Constraints
- 最大同時Executor: 3
- Teammateモード: auto（tmux検出時はsplit-pane、それ以外はin-process）
- 環境変数: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`（settings.jsonで設定済み）

### Model Selection
- **デフォルト**: Sonnet（コスト効率重視）
- **動的選択**: Commander が Issue 複雑度を自動評価し Opus/Sonnet を選択
- **手動オーバーライド**: Issue番号に `:opus` / `:sonnet` サフィックスを付与
- **判定基準**: クロスドメイン変更、ファイル数、アーキテクチャキーワード、`complexity:high` ラベル