# AgentCore Module Variables
# Author Personality Diagnosis Feature - Phase 1 & 2

#------------------------------------------------------------------------------
# Common Variables
#------------------------------------------------------------------------------

variable "project_name" {
  type        = string
  description = "Project name (used as prefix for resource names)"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region for the resources"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}

#------------------------------------------------------------------------------
# S3 Vectors Configuration
#------------------------------------------------------------------------------

variable "vector_dimension" {
  type        = number
  default     = 1024
  description = "Dimension of the embedding vectors (Titan Embed v2 default: 1024)"
}

variable "vector_distance_metric" {
  type        = string
  default     = "cosine"
  description = "Distance metric for vector similarity search (cosine or euclidean)"
  validation {
    condition     = contains(["cosine", "euclidean"], var.vector_distance_metric)
    error_message = "Distance metric must be 'cosine' or 'euclidean'"
  }
}

#------------------------------------------------------------------------------
# Knowledge Base Configuration
#------------------------------------------------------------------------------

variable "embedding_model_id" {
  type        = string
  default     = "amazon.titan-embed-text-v2:0"
  description = "Embedding model ID for Knowledge Base"
}

#------------------------------------------------------------------------------
# AgentCore Runtime Configuration
#------------------------------------------------------------------------------

variable "agent_model_id" {
  type        = string
  default     = "anthropic.claude-sonnet-4-5-v2:0"
  description = "Foundation model ID for the diagnostic agent"
}

variable "agent_runtime_python_version" {
  type        = string
  default     = "PYTHON_3_13"
  description = "Python runtime version for the agent"
  validation {
    condition     = contains(["PYTHON_3_10", "PYTHON_3_11", "PYTHON_3_12", "PYTHON_3_13"], var.agent_runtime_python_version)
    error_message = "Python runtime must be one of: PYTHON_3_10, PYTHON_3_11, PYTHON_3_12, PYTHON_3_13"
  }
}

variable "agent_code_s3_bucket" {
  type        = string
  default     = ""
  description = "S3 bucket for agent code (if using S3-based deployment)"
}

variable "agent_code_s3_key" {
  type        = string
  default     = ""
  description = "S3 key for agent code zip file"
}

variable "use_container_runtime" {
  type        = bool
  default     = false
  description = "Use container-based runtime instead of code-based runtime"
}

variable "agent_container_uri" {
  type        = string
  default     = ""
  description = "ECR container URI for agent (if using container-based deployment)"
}

#------------------------------------------------------------------------------
# AgentCore Memory Configuration
#------------------------------------------------------------------------------

variable "memory_event_expiry_days" {
  type        = number
  default     = 365
  description = "Number of days after which memory events expire (7-365)"
  validation {
    condition     = var.memory_event_expiry_days >= 7 && var.memory_event_expiry_days <= 365
    error_message = "Memory event expiry must be between 7 and 365 days"
  }
}

#------------------------------------------------------------------------------
# Semantic Scholar API Configuration
#------------------------------------------------------------------------------

variable "semantic_scholar_api_key" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Optional API key for Semantic Scholar (increases rate limits)"
}

#------------------------------------------------------------------------------
# DynamoDB Configuration
#------------------------------------------------------------------------------

variable "enable_pitr" {
  type        = bool
  default     = true
  description = "Enable Point-in-Time Recovery for DynamoDB table"
}

#------------------------------------------------------------------------------
# Lambda Configuration (for Gateway Target)
#------------------------------------------------------------------------------

variable "paper_search_lambda_arn" {
  type        = string
  default     = ""
  description = "ARN of the paper search Lambda function (created in lambda module)"
}

variable "paper_search_lambda_invoke_arn" {
  type        = string
  default     = ""
  description = "Invoke ARN of the paper search Lambda function"
}
