# CDN Module - CloudFront Distribution
# Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6

# AWS managed cache policy IDs (hardcoded to avoid Terraform provider bug)
# See: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
# See: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
locals {
  cache_policy_caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_policy_caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  # AllViewerExceptHostHeader - Forwards all viewer headers except Host (recommended for API Gateway)
  origin_request_policy_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}

# Origin Access Control for S3 buckets
# Requirement 7.1: Create distribution with OAC for S3 origin
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "blog-s3-oac-${var.environment}"
  description                       = "Origin Access Control for S3 buckets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Cache Policy for images with 24-hour default TTL
# Requirement 7.4: Configure cache behavior with appropriate TTL settings
resource "aws_cloudfront_cache_policy" "images" {
  name        = "BlogImageCachePolicy-${var.environment}"
  comment     = "Cache policy for blog images with 24 hour TTL"
  default_ttl = 86400    # 24 hours
  min_ttl     = 3600     # 1 hour
  max_ttl     = 31536000 # 365 days

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Cache Policy for Astro static assets (/_astro/*) with 1-year TTL
# Requirement 7.7: Cache static assets with content-based hash for 1 year
resource "aws_cloudfront_cache_policy" "astro_assets" {
  name        = "BlogAstroAssetsCachePolicy-${var.environment}"
  comment     = "Cache policy for Astro static assets with 1-year TTL (immutable)"
  default_ttl = 31536000 # 1 year
  min_ttl     = 31536000 # 1 year (immutable - content hash in filename)
  max_ttl     = 31536000 # 1 year

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Cache Policy for HTML/XML pages with 1-hour default TTL
# Requirement 7.6: Default TTL 1 hour, max TTL 24 hours for HTML pages
resource "aws_cloudfront_cache_policy" "html_pages" {
  name        = "BlogHtmlPagesCachePolicy-${var.environment}"
  comment     = "Cache policy for HTML/XML pages with 1-hour default TTL"
  default_ttl = 3600  # 1 hour
  min_ttl     = 0     # Respect Cache-Control: no-cache
  max_ttl     = 86400 # 24 hours

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Origin Request Policy for API Gateway
resource "aws_cloudfront_origin_request_policy" "api" {
  name    = "BlogApiOriginRequestPolicy-${var.environment}"
  comment = "Origin request policy for API Gateway"

  cookies_config {
    cookie_behavior = "none"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["Accept", "Accept-Language", "Content-Type", "Origin", "Referer"]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# CloudFront Function for Basic Authentication (dev environment only)
# Matches CDK's BasicAuthFunction-dev
resource "aws_cloudfront_function" "basic_auth" {
  count   = var.enable_basic_auth ? 1 : 0
  name    = "BasicAuthFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Basic Authentication for ${var.environment} environment"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // Expected credentials (embedded at deployment time)
  var authString = 'Basic ' + btoa('${var.basic_auth_username}:${var.basic_auth_password}');

  // Check if Authorization header exists
  if (
    typeof headers.authorization === 'undefined' ||
    headers.authorization.value !== authString
  ) {
    // Return 401 Unauthorized with WWW-Authenticate header
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'www-authenticate': { value: 'Basic realm="DEV Environment"' },
      },
    };
  }

  // Authentication successful - forward request to origin
  return request;
}
EOF

  lifecycle {
    create_before_destroy = true
  }
}

# CloudFront Function for Public Site SPA routing (production - no auth)
resource "aws_cloudfront_function" "public_spa" {
  count   = var.enable_basic_auth ? 0 : 1
  name    = "PublicSpaFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "SPA routing for Public site (${var.environment})"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // SPA routing: For paths without file extension, serve /index.html
  if (uri === '/' || uri === '') {
    request.uri = '/index.html';
  } else if (!uri.includes('.')) {
    // SPA route (e.g., /about, /posts/123) -> serve /index.html
    request.uri = '/index.html';
  }
  // Paths with extensions (e.g., /assets/foo.js) pass through unchanged

  return request;
}
EOF

  lifecycle {
    create_before_destroy = true
  }
}

# CloudFront Function for Public Site - Combined Basic Auth + SPA routing
# NOTE: This SPA function is DEPRECATED - SSG version (public_combined below) is used instead
# Keeping only as reference - do not use
# resource "aws_cloudfront_function" "public_combined_spa_deprecated" { ... }

# CloudFront Function for Image path rewriting
# Strips /images prefix for origin request
resource "aws_cloudfront_function" "image_path" {
  name    = "ImagePathFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Strips /images prefix for origin request"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Strip /images prefix for origin request
  if (uri.startsWith('/images')) {
    uri = uri.substring(7); // Remove '/images'
    if (uri === '') {
      uri = '/';
    }
  }

  request.uri = uri;
  return request;
}
EOF
}

# CloudFront Function for Admin - Combined Basic Auth + SPA routing
# Matches CDK's AdminCombinedFunction-dev for dev environment
resource "aws_cloudfront_function" "admin_combined" {
  count   = var.enable_basic_auth ? 1 : 0
  name    = "AdminCombinedFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Combined Basic Auth and SPA routing for Admin site (${var.environment})"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var uri = request.uri;

  // Basic Authentication check
  var authString = 'Basic ' + btoa('${var.basic_auth_username}:${var.basic_auth_password}');
  if (
    typeof headers.authorization === 'undefined' ||
    headers.authorization.value !== authString
  ) {
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'www-authenticate': { value: 'Basic realm="DEV Environment"' },
      },
    };
  }

  // SPA routing: Keep /admin prefix to avoid cache key collision with public site
  // Admin files are stored in S3 under /admin/ prefix
  if (uri.startsWith('/admin')) {
    // For paths without file extension, serve /admin/index.html
    if (uri === '/admin' || uri === '/admin/') {
      uri = '/admin/index.html';
    } else if (!uri.substring(6).includes('.')) {
      // SPA route (e.g., /admin/dashboard) -> serve /admin/index.html
      uri = '/admin/index.html';
    }
    // Paths with extensions (e.g., /admin/assets/foo.js) pass through unchanged
  }

  request.uri = uri;
  return request;
}
EOF

  lifecycle {
    create_before_destroy = true
  }
}

# CloudFront Function for Admin SPA routing (production - no auth)
resource "aws_cloudfront_function" "admin_spa" {
  count   = var.enable_basic_auth ? 0 : 1
  name    = "AdminSpaFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "SPA routing for Admin site - strips /admin prefix and handles SPA routes"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // SPA routing: Keep /admin prefix to avoid cache key collision with public site
  // Admin files are stored in S3 under /admin/ prefix
  if (uri.startsWith('/admin')) {
    // For paths without file extension, serve /admin/index.html
    if (uri === '/admin' || uri === '/admin/') {
      uri = '/admin/index.html';
    } else if (!uri.substring(6).includes('.')) {
      // SPA route (e.g., /admin/dashboard) -> serve /admin/index.html
      uri = '/admin/index.html';
    }
    // Paths with extensions (e.g., /admin/assets/foo.js) pass through unchanged
  }

  request.uri = uri;
  return request;
}
EOF

  lifecycle {
    create_before_destroy = true
  }
}

# CloudFront Function for API path rewriting
# Strips /api prefix for origin request
resource "aws_cloudfront_function" "api_path" {
  name    = "ApiPathFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Strips /api prefix for API Gateway origin request"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Strip /api prefix for origin request
  if (uri.startsWith('/api')) {
    uri = uri.substring(4); // Remove '/api'
    if (uri === '') {
      uri = '/';
    }
  }

  request.uri = uri;
  return request;
}
EOF
}

# CloudFront Function for Public Site SSG routing
# Requirements: 7.8, 7.9, 5.6
# Rewrites extensionless URLs to {path}/index.html for Astro static pages
resource "aws_cloudfront_function" "public_ssg" {
  name    = "PublicSsgFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "SSG routing for public site - rewrites extensionless URLs to index.html"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Known file extensions for web assets
  var knownExtensions = ['html','htm','js','mjs','cjs','css','json','xml','txt','jpg','jpeg','png','gif','webp','svg','ico','avif','woff','woff2','ttf','eot','otf','pdf','mp3','mp4','webm','ogg','map','wasm'];

  // Check for file extension in last segment
  var segments = uri.split('/');
  var lastSegment = segments[segments.length - 1];

  if (lastSegment !== '') {
    var lastDotIndex = lastSegment.lastIndexOf('.');
    if (lastDotIndex > 0) {
      var ext = lastSegment.substring(lastDotIndex + 1).toLowerCase();
      for (var i = 0; i < knownExtensions.length; i++) {
        if (knownExtensions[i] === ext) {
          return request;
        }
      }
    }
  }

  // Check for excluded paths
  if (uri.indexOf('/_astro/') === 0 ||
      uri.indexOf('/api/') === 0 ||
      uri === '/admin' ||
      uri.indexOf('/admin/') === 0 ||
      uri.indexOf('/images/') === 0 ||
      (uri.indexOf('/sitemap') === 0 && uri.indexOf('.xml') > -1) ||
      uri === '/rss.xml' ||
      uri === '/robots.txt') {
    return request;
  }

  // Rewrite to index.html
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else {
    request.uri = uri + '/index.html';
  }

  return request;
}
EOF
}

# CloudFront Function for Public Site - Combined Basic Auth + SSG routing (dev environment)
# Requirements: 7.8, 7.9, 5.6
resource "aws_cloudfront_function" "public_combined" {
  count   = var.enable_basic_auth ? 1 : 0
  name    = "PublicCombinedFunction-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Combined Basic Auth and SSG routing for public site (${var.environment})"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var uri = request.uri;

  // Basic Authentication check
  var authString = 'Basic ' + btoa('${var.basic_auth_username}:${var.basic_auth_password}');
  if (
    typeof headers.authorization === 'undefined' ||
    headers.authorization.value !== authString
  ) {
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'www-authenticate': { value: 'Basic realm="DEV Environment"' },
      },
    };
  }

  // Known file extensions for web assets
  var knownExtensions = ['html','htm','js','mjs','cjs','css','json','xml','txt','jpg','jpeg','png','gif','webp','svg','ico','avif','woff','woff2','ttf','eot','otf','pdf','mp3','mp4','webm','ogg','map','wasm'];

  // Check for file extension in last segment
  var segments = uri.split('/');
  var lastSegment = segments[segments.length - 1];

  if (lastSegment !== '') {
    var lastDotIndex = lastSegment.lastIndexOf('.');
    if (lastDotIndex > 0) {
      var ext = lastSegment.substring(lastDotIndex + 1).toLowerCase();
      for (var i = 0; i < knownExtensions.length; i++) {
        if (knownExtensions[i] === ext) {
          return request;
        }
      }
    }
  }

  // Check for excluded paths
  if (uri.indexOf('/_astro/') === 0 ||
      uri.indexOf('/api/') === 0 ||
      uri === '/admin' ||
      uri.indexOf('/admin/') === 0 ||
      uri.indexOf('/images/') === 0 ||
      (uri.indexOf('/sitemap') === 0 && uri.indexOf('.xml') > -1) ||
      uri === '/rss.xml' ||
      uri === '/robots.txt') {
    return request;
  }

  // Rewrite to index.html
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else {
    request.uri = uri + '/index.html';
  }

  return request;
}
EOF

  lifecycle {
    create_before_destroy = true
  }
}

# Unified CloudFront Distribution
# Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
#trivy:ignore:AVD-AWS-0045 WAF is not cost-effective for a personal blog
#trivy:ignore:AVD-AWS-0011 Access logging managed separately via S3 bucket logging
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Unified CDN for blog (public site, admin dashboard, images)"
  default_root_object = "index.html"
  price_class         = var.price_class

  # Custom domain names (CNAMEs) - only when custom domain is enabled
  aliases = var.use_custom_domain ? var.domain_names : []

  # Default behavior: Public Site (S3 origin with OAC)
  # Requirements: 7.1, 7.2, 7.3, 7.6, 7.8, 7.9
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "public-site"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.html_pages.id

    # Use combined function (auth + SSG) for dev, SSG-only for production
    function_association {
      event_type   = "viewer-request"
      function_arn = var.enable_basic_auth ? aws_cloudfront_function.public_combined[0].arn : aws_cloudfront_function.public_ssg.arn
    }
  }

  # S3 Origin: Public Site
  origin {
    domain_name              = var.public_site_bucket_regional_domain_name
    origin_id                = "public-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # S3 Origin: Admin Site
  origin {
    domain_name              = var.admin_site_bucket_regional_domain_name
    origin_id                = "admin-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # S3 Origin: Images
  origin {
    domain_name              = var.image_bucket_regional_domain_name
    origin_id                = "images"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # API Gateway Origin
  # Requirement 7.6: Configure API Gateway as additional origin for /api/* path
  origin {
    domain_name = "${var.rest_api_id}.execute-api.${var.aws_region}.amazonaws.com"
    origin_id   = "api-gateway"
    origin_path = "/${var.api_stage_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # /_astro/* behavior - Astro static assets with 1-year TTL
  # Requirement 7.7: Cache static assets with content-based hash for 1 year
  ordered_cache_behavior {
    path_pattern           = "/_astro/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "public-site"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.astro_assets.id
    # No function association - static assets don't need URL rewriting
  }

  # /admin/* behavior
  ordered_cache_behavior {
    path_pattern           = "/admin/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "admin-site"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = local.cache_policy_caching_optimized

    # Use combined function (auth + SPA) for dev, SPA-only for production
    function_association {
      event_type   = "viewer-request"
      function_arn = var.enable_basic_auth ? aws_cloudfront_function.admin_combined[0].arn : aws_cloudfront_function.admin_spa[0].arn
    }
  }

  # /images/* behavior
  # Requirement 7.4: Cache behavior with appropriate TTL settings
  ordered_cache_behavior {
    path_pattern           = "/images/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "images"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.images.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.image_path.arn
    }
  }

  # /api/* behavior
  # Requirement 7.6: API Gateway proxy
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "api-gateway"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = local.cache_policy_caching_disabled
    # Use AWS managed policy: AllViewerExceptHostHeader (forwards Authorization header)
    origin_request_policy_id = local.origin_request_policy_all_viewer_except_host

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.api_path.arn
    }
  }

  # Custom error response for SSG 404 page
  # Requirement 7.10, 15.3: Serve custom 404.html for S3 404 responses
  # Note: CloudFront Function rewrites paths to index.html, but if the file
  # doesn't exist in S3, this error response serves the custom 404 page.
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  # Restrictions (no geo restrictions)
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Viewer certificate with TLS 1.2
  # Requirement 7.2: HTTPS enforcement
  # When custom domain is enabled, use ACM certificate; otherwise use CloudFront default
  viewer_certificate {
    acm_certificate_arn            = var.use_custom_domain ? var.acm_certificate_arn : null
    cloudfront_default_certificate = var.use_custom_domain ? false : true
    minimum_protocol_version       = "TLSv1.2_2021"
    ssl_support_method             = var.use_custom_domain ? "sni-only" : null
  }

  tags = merge(
    {
      Name        = "blog-cdn-${var.environment}"
      Environment = var.environment
      Module      = "cdn"
    },
    var.tags
  )
}

#------------------------------------------------------------------------------
# SSM Parameters for CDN configuration (used by CI/CD)
#------------------------------------------------------------------------------
resource "aws_ssm_parameter" "api_endpoint" {
  name        = "/serverless-blog/${var.environment}/api/endpoint"
  description = "API endpoint URL for ${var.environment} environment (via CloudFront)"
  type        = "String"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}/api"

  tags = merge(
    {
      Name        = "api-endpoint-${var.environment}"
      Environment = var.environment
      Module      = "cdn"
    },
    var.tags
  )
}

resource "aws_ssm_parameter" "distribution_id" {
  name        = "/serverless-blog/${var.environment}/cdn/distribution-id"
  description = "CloudFront distribution ID for ${var.environment} environment"
  type        = "String"
  value       = aws_cloudfront_distribution.main.id

  tags = merge(
    {
      Name        = "cdn-distribution-id-${var.environment}"
      Environment = var.environment
      Module      = "cdn"
    },
    var.tags
  )
}

