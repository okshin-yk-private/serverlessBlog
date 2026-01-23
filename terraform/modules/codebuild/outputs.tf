# CodeBuild Module Outputs
# Requirements: 8.5, 10.1

output "codebuild_project_name" {
  value       = aws_codebuild_project.astro_build.name
  description = "CodeBuild project name"
}

output "codebuild_project_arn" {
  value       = aws_codebuild_project.astro_build.arn
  description = "CodeBuild project ARN"
}

output "codebuild_project_id" {
  value       = aws_codebuild_project.astro_build.id
  description = "CodeBuild project ID"
}

output "codebuild_role_arn" {
  value       = aws_iam_role.codebuild.arn
  description = "CodeBuild IAM role ARN"
}

output "codebuild_role_name" {
  value       = aws_iam_role.codebuild.name
  description = "CodeBuild IAM role name"
}

output "codebuild_log_group_name" {
  value       = aws_cloudwatch_log_group.codebuild.name
  description = "CloudWatch log group name for CodeBuild logs"
}

output "codebuild_log_group_arn" {
  value       = aws_cloudwatch_log_group.codebuild.arn
  description = "CloudWatch log group ARN for CodeBuild logs"
}

output "ssm_parameter_name" {
  value       = aws_ssm_parameter.codebuild_project_name.name
  description = "SSM parameter name storing CodeBuild project name"
}
