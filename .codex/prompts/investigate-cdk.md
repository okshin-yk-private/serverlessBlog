---
description: Research AWS CDK constructs, patterns, and best practices (runs in separate context)
allowed-tools: Task
argument-hint: <research-topic>
---

# CDK Investigation Command

<instructions>

## Purpose
Execute AWS CDK research in a separate context using awslabs_aws-iac-mcp-server tools.
This reduces context accumulation in the main conversation.

## Execution

Use the Task tool to spawn a research agent:

```
Task tool parameters:
- subagent_type: "general-purpose"
- description: "CDK research: $ARGUMENTS"
- prompt: See below
```

**Prompt to send to Task tool:**

```
You are an AWS CDK specialist. Research the following topic using awslabs_aws-iac-mcp-server tools.

## Research Topic
$ARGUMENTS

## Instructions
1. Use awslabs_aws-iac-mcp-server documentation and construct search tools for CDK constructs and AWS Solutions Constructs (L3)
2. Consult CDK best practices and security/nag rule guidance from the server
3. Synthesize findings into actionable recommendations

## Output Format
Provide a concise summary with:
- **Overview**: What the construct/pattern does
- **Key Findings**: Most relevant constructs for the use case
- **Code Examples**: CDK code snippets (TypeScript preferred)
- **L3 Constructs**: Available AWS Solutions Constructs if applicable
- **Considerations**: Best practices and security aspects
- **Recommendations**: Clear implementation guidance
- **References**: Documentation links
```

## Important
- Always use the Task tool to execute this research
- The research happens in a separate context
- Only the summary is returned to the main conversation

</instructions>
