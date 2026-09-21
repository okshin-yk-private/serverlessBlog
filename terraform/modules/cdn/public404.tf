# Origin-response is required: CloudFront's internal custom error page fetch does
# not reliably follow the viewer-request KVS rewrite. Use the failed request's
# already selected release, without another pointer read.
data "aws_caller_identity" "edge" {}

resource "aws_iam_role" "public_404" {
  name = "blog-public-404-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"]
      }
      Action = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "public_404" {
  name = "read-release-404-and-write-logs"
  role = aws_iam_role.public_404.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${var.public_site_bucket_name}/releases/*/404.html"
      },
      {
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        # Edge execution and its log groups can be in any AWS region.
        Resource = "arn:aws:logs:*:${data.aws_caller_identity.edge.account_id}:log-group:/aws/lambda/us-east-1.blog-public-404-${var.environment}:*"
      }
    ]
  })
}

data "archive_file" "public_404" {
  type        = "zip"
  output_path = "${path.root}/.terraform/public-404-${var.environment}.zip"
  source {
    filename = "index.mjs"
    content = templatefile("${path.module}/functions/public404.mjs.tftpl", {
      bucket_json = jsonencode(var.public_site_bucket_name)
      region_json = jsonencode(var.aws_region)
    })
  }
}

resource "aws_lambda_function" "public_404" {
  #checkov:skip=CKV_AWS_50:Lambda@Edge does not support AWS X-Ray. See https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html#lambda-at-edge-lambda-function-support
  # AWS provider 6 supports per-resource region overrides; no second provider
  # configuration is needed in every caller of the CDN module.
  region           = "us-east-1"
  function_name    = "blog-public-404-${var.environment}"
  description      = "Serve the failed public request's release-specific 404 page"
  role             = aws_iam_role.public_404.arn
  runtime          = "nodejs22.x"
  architectures    = ["x86_64"]
  handler          = "index.handler"
  filename         = data.archive_file.public_404.output_path
  source_code_hash = data.archive_file.public_404.output_base64sha256
  publish          = true
  timeout          = 10
  memory_size      = 128
  tags             = var.tags

  depends_on = [aws_iam_role_policy.public_404]
}
