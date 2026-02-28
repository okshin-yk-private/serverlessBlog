# Lambda Module Outputs
# Requirements: 4.1

# ======================
# Function ARNs Map
# ======================

output "function_arns" {
  value = {
    create_post                  = aws_lambda_function.create_post.arn
    get_post                     = aws_lambda_function.get_post.arn
    get_public_post              = aws_lambda_function.get_public_post.arn
    list_posts                   = aws_lambda_function.list_posts.arn
    update_post                  = aws_lambda_function.update_post.arn
    delete_post                  = aws_lambda_function.delete_post.arn
    login                        = aws_lambda_function.login.arn
    logout                       = aws_lambda_function.logout.arn
    refresh                      = aws_lambda_function.refresh.arn
    get_upload_url               = aws_lambda_function.get_upload_url.arn
    delete_image                 = aws_lambda_function.delete_image.arn
    list_categories              = aws_lambda_function.list_categories.arn
    create_category              = aws_lambda_function.create_category.arn
    update_category              = aws_lambda_function.update_category.arn
    update_categories_sort_order = aws_lambda_function.update_categories_sort_order.arn
    delete_category              = aws_lambda_function.delete_category.arn
    create_mindmap               = aws_lambda_function.create_mindmap.arn
    get_mindmap                  = aws_lambda_function.get_mindmap.arn
    list_mindmaps                = aws_lambda_function.list_mindmaps.arn
    update_mindmap               = aws_lambda_function.update_mindmap.arn
    delete_mindmap               = aws_lambda_function.delete_mindmap.arn
    get_public_mindmap           = aws_lambda_function.get_public_mindmap.arn
    list_public_mindmaps         = aws_lambda_function.list_public_mindmaps.arn
  }
  description = "Map of Lambda function ARNs"
}

# ======================
# Function Invoke ARNs Map
# ======================

output "function_invoke_arns" {
  value = {
    create_post                  = aws_lambda_function.create_post.invoke_arn
    get_post                     = aws_lambda_function.get_post.invoke_arn
    get_public_post              = aws_lambda_function.get_public_post.invoke_arn
    list_posts                   = aws_lambda_function.list_posts.invoke_arn
    update_post                  = aws_lambda_function.update_post.invoke_arn
    delete_post                  = aws_lambda_function.delete_post.invoke_arn
    login                        = aws_lambda_function.login.invoke_arn
    logout                       = aws_lambda_function.logout.invoke_arn
    refresh                      = aws_lambda_function.refresh.invoke_arn
    get_upload_url               = aws_lambda_function.get_upload_url.invoke_arn
    delete_image                 = aws_lambda_function.delete_image.invoke_arn
    list_categories              = aws_lambda_function.list_categories.invoke_arn
    create_category              = aws_lambda_function.create_category.invoke_arn
    update_category              = aws_lambda_function.update_category.invoke_arn
    update_categories_sort_order = aws_lambda_function.update_categories_sort_order.invoke_arn
    delete_category              = aws_lambda_function.delete_category.invoke_arn
    create_mindmap               = aws_lambda_function.create_mindmap.invoke_arn
    get_mindmap                  = aws_lambda_function.get_mindmap.invoke_arn
    list_mindmaps                = aws_lambda_function.list_mindmaps.invoke_arn
    update_mindmap               = aws_lambda_function.update_mindmap.invoke_arn
    delete_mindmap               = aws_lambda_function.delete_mindmap.invoke_arn
    get_public_mindmap           = aws_lambda_function.get_public_mindmap.invoke_arn
    list_public_mindmaps         = aws_lambda_function.list_public_mindmaps.invoke_arn
  }
  description = "Map of Lambda function Invoke ARNs for API Gateway integrations"
}

# ======================
# Function Names List
# ======================

output "function_names" {
  value = [
    aws_lambda_function.create_post.function_name,
    aws_lambda_function.get_post.function_name,
    aws_lambda_function.get_public_post.function_name,
    aws_lambda_function.list_posts.function_name,
    aws_lambda_function.update_post.function_name,
    aws_lambda_function.delete_post.function_name,
    aws_lambda_function.login.function_name,
    aws_lambda_function.logout.function_name,
    aws_lambda_function.refresh.function_name,
    aws_lambda_function.get_upload_url.function_name,
    aws_lambda_function.delete_image.function_name,
    aws_lambda_function.list_categories.function_name,
    aws_lambda_function.create_category.function_name,
    aws_lambda_function.update_category.function_name,
    aws_lambda_function.update_categories_sort_order.function_name,
    aws_lambda_function.delete_category.function_name,
    aws_lambda_function.create_mindmap.function_name,
    aws_lambda_function.get_mindmap.function_name,
    aws_lambda_function.list_mindmaps.function_name,
    aws_lambda_function.update_mindmap.function_name,
    aws_lambda_function.delete_mindmap.function_name,
    aws_lambda_function.get_public_mindmap.function_name,
    aws_lambda_function.list_public_mindmaps.function_name,
  ]
  description = "List of all Lambda function names"
}

# ======================
# IAM Role Outputs (Function Group-Specific)
# ======================

# Posts Domain Role
output "posts_role_arn" {
  value       = aws_iam_role.lambda_posts.arn
  description = "Posts domain Lambda execution role ARN"
}

output "posts_role_name" {
  value       = aws_iam_role.lambda_posts.name
  description = "Posts domain Lambda execution role name"
}

# Auth Domain Role
output "auth_role_arn" {
  value       = aws_iam_role.lambda_auth.arn
  description = "Auth domain Lambda execution role ARN"
}

output "auth_role_name" {
  value       = aws_iam_role.lambda_auth.name
  description = "Auth domain Lambda execution role name"
}

# Images Domain Role
output "images_role_arn" {
  value       = aws_iam_role.lambda_images.arn
  description = "Images domain Lambda execution role ARN"
}

output "images_role_name" {
  value       = aws_iam_role.lambda_images.name
  description = "Images domain Lambda execution role name"
}

# Legacy alias for backward compatibility
output "execution_role_arn" {
  value       = aws_iam_role.lambda_posts.arn
  description = "Lambda execution role ARN (deprecated, use posts_role_arn)"
}

output "execution_role_name" {
  value       = aws_iam_role.lambda_posts.name
  description = "Lambda execution role name (deprecated, use posts_role_name)"
}

# ======================
# Individual Function Outputs (for API Gateway integration)
# ======================

# Posts domain
output "create_post_function_arn" {
  value       = aws_lambda_function.create_post.arn
  description = "Create Post Lambda function ARN"
}

output "create_post_function_name" {
  value       = aws_lambda_function.create_post.function_name
  description = "Create Post Lambda function name"
}

output "get_post_function_arn" {
  value       = aws_lambda_function.get_post.arn
  description = "Get Post Lambda function ARN"
}

output "get_post_function_name" {
  value       = aws_lambda_function.get_post.function_name
  description = "Get Post Lambda function name"
}

output "get_public_post_function_arn" {
  value       = aws_lambda_function.get_public_post.arn
  description = "Get Public Post Lambda function ARN"
}

output "get_public_post_function_name" {
  value       = aws_lambda_function.get_public_post.function_name
  description = "Get Public Post Lambda function name"
}

output "list_posts_function_arn" {
  value       = aws_lambda_function.list_posts.arn
  description = "List Posts Lambda function ARN"
}

output "list_posts_function_name" {
  value       = aws_lambda_function.list_posts.function_name
  description = "List Posts Lambda function name"
}

output "update_post_function_arn" {
  value       = aws_lambda_function.update_post.arn
  description = "Update Post Lambda function ARN"
}

output "update_post_function_name" {
  value       = aws_lambda_function.update_post.function_name
  description = "Update Post Lambda function name"
}

output "delete_post_function_arn" {
  value       = aws_lambda_function.delete_post.arn
  description = "Delete Post Lambda function ARN"
}

output "delete_post_function_name" {
  value       = aws_lambda_function.delete_post.function_name
  description = "Delete Post Lambda function name"
}

# Auth domain
output "login_function_arn" {
  value       = aws_lambda_function.login.arn
  description = "Login Lambda function ARN"
}

output "login_function_name" {
  value       = aws_lambda_function.login.function_name
  description = "Login Lambda function name"
}

output "logout_function_arn" {
  value       = aws_lambda_function.logout.arn
  description = "Logout Lambda function ARN"
}

output "logout_function_name" {
  value       = aws_lambda_function.logout.function_name
  description = "Logout Lambda function name"
}

output "refresh_function_arn" {
  value       = aws_lambda_function.refresh.arn
  description = "Refresh Lambda function ARN"
}

output "refresh_function_name" {
  value       = aws_lambda_function.refresh.function_name
  description = "Refresh Lambda function name"
}

# Images domain
output "get_upload_url_function_arn" {
  value       = aws_lambda_function.get_upload_url.arn
  description = "Get Upload URL Lambda function ARN"
}

output "get_upload_url_function_name" {
  value       = aws_lambda_function.get_upload_url.function_name
  description = "Get Upload URL Lambda function name"
}

output "delete_image_function_arn" {
  value       = aws_lambda_function.delete_image.arn
  description = "Delete Image Lambda function ARN"
}

output "delete_image_function_name" {
  value       = aws_lambda_function.delete_image.function_name
  description = "Delete Image Lambda function name"
}

# ======================
# Categories Domain Outputs
# ======================

# Categories Domain Role
output "categories_role_arn" {
  value       = aws_iam_role.lambda_categories.arn
  description = "Categories domain Lambda execution role ARN"
}

output "categories_role_name" {
  value       = aws_iam_role.lambda_categories.name
  description = "Categories domain Lambda execution role name"
}

output "list_categories_function_arn" {
  value       = aws_lambda_function.list_categories.arn
  description = "List Categories Lambda function ARN"
}

output "list_categories_function_name" {
  value       = aws_lambda_function.list_categories.function_name
  description = "List Categories Lambda function name"
}

output "list_categories_invoke_arn" {
  value       = aws_lambda_function.list_categories.invoke_arn
  description = "List Categories Lambda function invoke ARN for API Gateway integration"
}

output "create_category_function_arn" {
  value       = aws_lambda_function.create_category.arn
  description = "Create Category Lambda function ARN"
}

output "create_category_function_name" {
  value       = aws_lambda_function.create_category.function_name
  description = "Create Category Lambda function name"
}

output "create_category_invoke_arn" {
  value       = aws_lambda_function.create_category.invoke_arn
  description = "Create Category Lambda function invoke ARN for API Gateway integration"
}

output "update_category_function_arn" {
  value       = aws_lambda_function.update_category.arn
  description = "Update Category Lambda function ARN"
}

output "update_category_function_name" {
  value       = aws_lambda_function.update_category.function_name
  description = "Update Category Lambda function name"
}

output "update_category_invoke_arn" {
  value       = aws_lambda_function.update_category.invoke_arn
  description = "Update Category Lambda function invoke ARN for API Gateway integration"
}

output "update_categories_sort_order_function_arn" {
  value       = aws_lambda_function.update_categories_sort_order.arn
  description = "Update Categories Sort Order Lambda function ARN"
}

output "update_categories_sort_order_function_name" {
  value       = aws_lambda_function.update_categories_sort_order.function_name
  description = "Update Categories Sort Order Lambda function name"
}

output "update_categories_sort_order_invoke_arn" {
  value       = aws_lambda_function.update_categories_sort_order.invoke_arn
  description = "Update Categories Sort Order Lambda function invoke ARN for API Gateway integration"
}

output "delete_category_function_arn" {
  value       = aws_lambda_function.delete_category.arn
  description = "Delete Category Lambda function ARN"
}

output "delete_category_function_name" {
  value       = aws_lambda_function.delete_category.function_name
  description = "Delete Category Lambda function name"
}

output "delete_category_invoke_arn" {
  value       = aws_lambda_function.delete_category.invoke_arn
  description = "Delete Category Lambda function invoke ARN for API Gateway integration"
}

# ======================
# Mindmaps Domain Outputs
# ======================

# Mindmaps Domain Role
output "mindmaps_role_arn" {
  value       = aws_iam_role.lambda_mindmaps.arn
  description = "Mindmaps domain Lambda execution role ARN"
}

output "mindmaps_role_name" {
  value       = aws_iam_role.lambda_mindmaps.name
  description = "Mindmaps domain Lambda execution role name"
}

# Mindmaps Public Domain Role (read-only)
output "mindmaps_public_role_arn" {
  value       = aws_iam_role.lambda_mindmaps_public.arn
  description = "Mindmaps public domain Lambda execution role ARN (read-only)"
}

output "mindmaps_public_role_name" {
  value       = aws_iam_role.lambda_mindmaps_public.name
  description = "Mindmaps public domain Lambda execution role name (read-only)"
}

output "create_mindmap_function_arn" {
  value       = aws_lambda_function.create_mindmap.arn
  description = "Create Mindmap Lambda function ARN"
}

output "create_mindmap_function_name" {
  value       = aws_lambda_function.create_mindmap.function_name
  description = "Create Mindmap Lambda function name"
}

output "create_mindmap_invoke_arn" {
  value       = aws_lambda_function.create_mindmap.invoke_arn
  description = "Create Mindmap Lambda function invoke ARN for API Gateway integration"
}

output "get_mindmap_function_arn" {
  value       = aws_lambda_function.get_mindmap.arn
  description = "Get Mindmap Lambda function ARN"
}

output "get_mindmap_function_name" {
  value       = aws_lambda_function.get_mindmap.function_name
  description = "Get Mindmap Lambda function name"
}

output "get_mindmap_invoke_arn" {
  value       = aws_lambda_function.get_mindmap.invoke_arn
  description = "Get Mindmap Lambda function invoke ARN for API Gateway integration"
}

output "list_mindmaps_function_arn" {
  value       = aws_lambda_function.list_mindmaps.arn
  description = "List Mindmaps Lambda function ARN"
}

output "list_mindmaps_function_name" {
  value       = aws_lambda_function.list_mindmaps.function_name
  description = "List Mindmaps Lambda function name"
}

output "list_mindmaps_invoke_arn" {
  value       = aws_lambda_function.list_mindmaps.invoke_arn
  description = "List Mindmaps Lambda function invoke ARN for API Gateway integration"
}

output "update_mindmap_function_arn" {
  value       = aws_lambda_function.update_mindmap.arn
  description = "Update Mindmap Lambda function ARN"
}

output "update_mindmap_function_name" {
  value       = aws_lambda_function.update_mindmap.function_name
  description = "Update Mindmap Lambda function name"
}

output "update_mindmap_invoke_arn" {
  value       = aws_lambda_function.update_mindmap.invoke_arn
  description = "Update Mindmap Lambda function invoke ARN for API Gateway integration"
}

output "delete_mindmap_function_arn" {
  value       = aws_lambda_function.delete_mindmap.arn
  description = "Delete Mindmap Lambda function ARN"
}

output "delete_mindmap_function_name" {
  value       = aws_lambda_function.delete_mindmap.function_name
  description = "Delete Mindmap Lambda function name"
}

output "delete_mindmap_invoke_arn" {
  value       = aws_lambda_function.delete_mindmap.invoke_arn
  description = "Delete Mindmap Lambda function invoke ARN for API Gateway integration"
}

output "get_public_mindmap_function_arn" {
  value       = aws_lambda_function.get_public_mindmap.arn
  description = "Get Public Mindmap Lambda function ARN"
}

output "get_public_mindmap_function_name" {
  value       = aws_lambda_function.get_public_mindmap.function_name
  description = "Get Public Mindmap Lambda function name"
}

output "get_public_mindmap_invoke_arn" {
  value       = aws_lambda_function.get_public_mindmap.invoke_arn
  description = "Get Public Mindmap Lambda function invoke ARN for API Gateway integration"
}

output "list_public_mindmaps_function_arn" {
  value       = aws_lambda_function.list_public_mindmaps.arn
  description = "List Public Mindmaps Lambda function ARN"
}

output "list_public_mindmaps_function_name" {
  value       = aws_lambda_function.list_public_mindmaps.function_name
  description = "List Public Mindmaps Lambda function name"
}

output "list_public_mindmaps_invoke_arn" {
  value       = aws_lambda_function.list_public_mindmaps.invoke_arn
  description = "List Public Mindmaps Lambda function invoke ARN for API Gateway integration"
}
