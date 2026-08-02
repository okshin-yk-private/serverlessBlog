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
    build_status_post            = aws_lambda_function.build_status_post.arn
    reconcile_build_post         = aws_lambda_function.reconcile_build_post.arn
    get_post_by_slug             = aws_lambda_function.get_post_by_slug.arn
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
    build_status_post            = aws_lambda_function.build_status_post.invoke_arn
    reconcile_build_post         = aws_lambda_function.reconcile_build_post.invoke_arn
    get_post_by_slug             = aws_lambda_function.get_post_by_slug.invoke_arn
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
    aws_lambda_function.build_status_post.function_name,
    aws_lambda_function.reconcile_build_post.function_name,
    aws_lambda_function.get_post_by_slug.function_name,
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
  ]
  description = "List of all Lambda function names"
}

# ======================
# IAM Role Outputs (Function Group-Specific)
# ======================

# Posts Domain Roles (split into read/write/build-status - see issue #493)
output "posts_read_role_arn" {
  value       = aws_iam_role.lambda_posts_read.arn
  description = "Posts domain read-only Lambda execution role ARN"
}

output "posts_read_role_name" {
  value       = aws_iam_role.lambda_posts_read.name
  description = "Posts domain read-only Lambda execution role name"
}

output "posts_write_role_arn" {
  value       = aws_iam_role.lambda_posts_write.arn
  description = "Posts domain write Lambda execution role ARN"
}

output "posts_write_role_name" {
  value       = aws_iam_role.lambda_posts_write.name
  description = "Posts domain write Lambda execution role name"
}

output "posts_build_status_role_arn" {
  value       = aws_iam_role.lambda_posts_build_status.arn
  description = "Posts domain build-status Lambda execution role ARN"
}

output "posts_build_status_role_name" {
  value       = aws_iam_role.lambda_posts_build_status.name
  description = "Posts domain build-status Lambda execution role name"
}

output "posts_build_reconciler_role_arn" {
  value       = aws_iam_role.lambda_posts_build_reconciler.arn
  description = "Posts domain build-reconciler Lambda execution role ARN"
}

output "posts_build_reconciler_role_name" {
  value       = aws_iam_role.lambda_posts_build_reconciler.name
  description = "Posts domain build-reconciler Lambda execution role name"
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
  value       = aws_iam_role.lambda_posts_write.arn
  description = "Lambda execution role ARN (deprecated, use posts_write_role_arn)"
}

output "execution_role_name" {
  value       = aws_iam_role.lambda_posts_write.name
  description = "Lambda execution role name (deprecated, use posts_write_role_name)"
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

output "build_status_post_function_arn" {
  value       = aws_lambda_function.build_status_post.arn
  description = "Build Status Post Lambda function ARN"
}

output "build_status_post_function_name" {
  value       = aws_lambda_function.build_status_post.function_name
  description = "Build Status Post Lambda function name"
}

output "build_status_post_invoke_arn" {
  value       = aws_lambda_function.build_status_post.invoke_arn
  description = "Build Status Post Lambda function invoke ARN for API Gateway integration"
}

output "get_post_by_slug_function_arn" {
  value       = aws_lambda_function.get_post_by_slug.arn
  description = "Get Post By Slug Lambda function ARN"
}

output "get_post_by_slug_function_name" {
  value       = aws_lambda_function.get_post_by_slug.function_name
  description = "Get Post By Slug Lambda function name"
}

output "get_post_by_slug_invoke_arn" {
  value       = aws_lambda_function.get_post_by_slug.invoke_arn
  description = "Get Post By Slug Lambda function invoke ARN for API Gateway integration"
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

# Categories Domain Roles (split into read/write - see issue #493)
output "categories_read_role_arn" {
  value       = aws_iam_role.lambda_categories_read.arn
  description = "Categories domain read-only Lambda execution role ARN"
}

output "categories_read_role_name" {
  value       = aws_iam_role.lambda_categories_read.name
  description = "Categories domain read-only Lambda execution role name"
}

output "categories_write_role_arn" {
  value       = aws_iam_role.lambda_categories_write.arn
  description = "Categories domain write Lambda execution role ARN"
}

output "categories_write_role_name" {
  value       = aws_iam_role.lambda_categories_write.name
  description = "Categories domain write Lambda execution role name"
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
