
# CDK Investigation Command

<instructions>

## Purpose
Execute AWS CDK research in a separate context using awslabs.cdk-mcp-server tools.
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
You are an AWS CDK specialist. Research the following topic using awslabs.cdk-mcp-server tools.

## Research Topic
$ARGUMENTS

## Instructions
1. Use mcp__awslabs_cdk-mcp-server__SearchGenAICDKConstructs for GenAI-related constructs
2. Use mcp__awslabs_cdk-mcp-server__GetAwsSolutionsConstructPattern for AWS Solutions Constructs (L3)
3. Use mcp__awslabs_cdk-mcp-server__CDKGeneralGuidance for CDK best practices
4. Use mcp__awslabs_cdk-mcp-server__ExplainCDKNagRule for security rule explanations
5. Synthesize findings into actionable recommendations

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
