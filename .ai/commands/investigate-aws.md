
# AWS Investigation Command

<instructions>

## Purpose
Execute AWS research in a separate context using aws-mcp and aws-knowledge-mcp-server tools.
This reduces context accumulation in the main conversation.

## Execution

Use the Task tool to spawn a research agent:

```
Task tool parameters:
- subagent_type: "general-purpose"
- description: "AWS research: $ARGUMENTS"
- prompt: See below
```

**Prompt to send to Task tool:**

```
You are an AWS research specialist. Research the following topic using aws-mcp and aws-knowledge-mcp-server tools.

## Research Topic
$ARGUMENTS

## Instructions
1. Use mcp__aws-mcp__aws___search_documentation to find relevant AWS documentation
2. Use mcp__aws-mcp__aws___read_documentation to read specific documentation pages
3. Use mcp__aws-mcp__aws___call_aws for CLI command research if needed
4. Synthesize findings into actionable recommendations

## Output Format
Provide a concise summary with:
- **Overview**: What the service/feature does
- **Key Findings**: Most relevant information for the use case
- **Considerations**: Performance, cost, security aspects
- **Recommendations**: Clear guidance and next steps
- **References**: Documentation URLs for further reading
```

## Important
- Always use the Task tool to execute this research
- The research happens in a separate context
- Only the summary is returned to the main conversation

</instructions>
