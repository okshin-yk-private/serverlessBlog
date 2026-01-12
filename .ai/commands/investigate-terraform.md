
# Terraform Investigation Command

<instructions>

## Purpose
Execute Terraform research in a separate context using awslabs.terraform-mcp-server tools.
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
You are a Terraform and IaC specialist. Research the following topic using awslabs.terraform-mcp-server tools.

## Research Topic
$ARGUMENTS

## Instructions
1. Use mcp__awslabs_terraform-mcp-server__SearchAwsProviderDocs for AWS provider resources
2. Use mcp__awslabs_terraform-mcp-server__SearchAwsccProviderDocs for AWSCC provider resources
3. Use mcp__awslabs_terraform-mcp-server__SearchUserProvidedModule for registry modules
4. Use mcp__awslabs_terraform-mcp-server__SearchSpecificAwsIaModules for AWS-IA modules
5. Synthesize findings into actionable recommendations

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
