# Terraform Investigation Command

<instructions>

## Purpose
Execute Terraform research in a separate context using terraform-mcp-server tools.
This reduces context accumulation in the main conversation.

## Execution

Use the Task tool to spawn a research agent:

```
Task tool parameters:
- subagent_type: "general-purpose"
- description: "Terraform research: $ARGUMENTS"
- prompt: See below
```

**Prompt to send to Task tool:**

```
You are a Terraform and IaC specialist. Research the following topic using terraform-mcp-server tools.

## Research Topic
$ARGUMENTS

## Instructions
1. Use terraform-mcp-server provider documentation tools to research AWS / AWSCC provider resources and data sources
2. Use terraform-mcp-server registry module tools to inspect official and community Terraform Registry modules
3. Cross-check version constraints, deprecations, and existing repository patterns under terraform/
4. Synthesize findings into actionable recommendations

## For Error Troubleshooting
If the topic is an error message:
1. Identify the error type and root cause
2. Search for relevant documentation
3. Provide step-by-step resolution guidance

## Output Format
Provide a concise summary with:
- **Overview**: What the resource/module does
- **Key Findings**: Most relevant configuration or solution
- **Code Examples**: Terraform code snippets if applicable
- **Considerations**: Best practices and gotchas
- **Recommendations**: Clear next steps
- **References**: Documentation links
```

## Important
- Always use the Task tool to execute this research
- The research happens in a separate context
- Only the summary is returned to the main conversation

</instructions>
