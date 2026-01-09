# CDN Module - CloudFront Distribution
# Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6

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

  // SPA routing: Strip /admin prefix and handle SPA routes
  if (uri.startsWith('/admin')) {
    uri = uri.substring(6);
    if (uri === '' || uri === '/') {
      uri = '/index.html';
    } else if (!uri.includes('.')) {
      uri = '/index.html';
    }
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

  // Strip /admin prefix for origin request
  if (uri.startsWith('/admin')) {
    uri = uri.substring(6); // Remove '/admin'
    if (uri === '' || uri === '/') {
      uri = '/index.html';
    } else if (!uri.includes('.')) {
      // SPA routing: paths without extension should serve index.html
      uri = '/index.html';
    }
  }

  request.uri = uri;
  return request;
}
EOF
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

# Unified CloudFront Distribution
# Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Unified CDN for blog (public site, admin dashboard, images)"
  default_root_object = "index.html"
  price_class         = var.price_class

  # Default behavior: Public Site (S3 origin with OAC)
  # Requirement 7.1, 7.2, 7.3
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "public-site"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    # Basic Auth function for dev environment protection
    dynamic "function_association" {
      for_each = var.enable_basic_auth ? [1] : []
      content {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.basic_auth[0].arn
      }
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

  # /admin/* behavior
  ordered_cache_behavior {
    path_pattern           = "/admin/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "admin-site"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

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
    path_pattern             = "/api/*"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "api-gateway"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.api_path.arn
    }
  }

  # SPA error responses
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 300
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 300
  }

  # Restrictions (no geo restrictions)
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Viewer certificate with TLS 1.2
  # Requirement 7.2: HTTPS enforcement
  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
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

# Data sources for managed cache policies
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}
