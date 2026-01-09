# CDN Module Tests
# TDD: RED -> GREEN -> REFACTOR
# Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6

# Mock provider for testing without AWS credentials
mock_provider "aws" {}

# Test 1: Verify CloudFront distribution is created with OAC for S3 origins
# Requirement 7.1: Create distribution with OAC for S3 origin
run "distribution_created" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.enabled == true
    error_message = "CloudFront distribution must be enabled"
  }
}

# Test 2: Verify Origin Access Control (OAC) is created
# Requirement 7.1: Create distribution with OAC for S3 origin
run "oac_created" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition     = aws_cloudfront_origin_access_control.s3_oac.signing_behavior == "always"
    error_message = "OAC must have signing_behavior set to 'always'"
  }

  assert {
    condition     = aws_cloudfront_origin_access_control.s3_oac.signing_protocol == "sigv4"
    error_message = "OAC must use sigv4 signing protocol"
  }
}

# Test 3: Verify HTTPS redirect is configured
# Requirement 7.2: Configure HTTPS redirect for all viewers
run "https_redirect" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "Default cache behavior must redirect to HTTPS"
  }
}

# Test 4: Verify Gzip and Brotli compression is enabled
# Requirement 7.3: Enable Gzip and Brotli compression
run "compression_enabled" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.default_cache_behavior[0].compress == true
    error_message = "Compression must be enabled on default cache behavior"
  }
}

# Test 5: Verify cache behavior TTL settings
# Requirement 7.4: Configure cache behavior with appropriate TTL settings
run "cache_ttl_settings" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify default TTL (24 hours = 86400 seconds) for image cache policy
  assert {
    condition     = aws_cloudfront_cache_policy.images.default_ttl == 86400
    error_message = "Image cache policy must have default TTL of 24 hours (86400 seconds)"
  }
}

# Test 6: Verify PRICE_CLASS_100 is used
# Requirement 7.5: Use PRICE_CLASS_100 for cost optimization
run "price_class_100" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.price_class == "PriceClass_100"
    error_message = "Distribution must use PriceClass_100 for cost optimization"
  }
}

# Test 7: Verify API Gateway origin is configured for /api/* path
# Requirement 7.6: Configure API Gateway as additional origin for /api/* path
run "api_gateway_origin" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify API Gateway origin exists
  assert {
    condition = anytrue([
      for origin in aws_cloudfront_distribution.main.origin :
      can(regex("execute-api", origin.domain_name))
    ])
    error_message = "Distribution must have an API Gateway origin"
  }
}

# Test 8: Verify /api/* cache behavior exists
# Requirement 7.6: Configure API Gateway as additional origin for /api/* path
run "api_cache_behavior" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify /api/* ordered cache behavior exists
  assert {
    condition = anytrue([
      for behavior in aws_cloudfront_distribution.main.ordered_cache_behavior :
      behavior.path_pattern == "/api/*"
    ])
    error_message = "Distribution must have ordered cache behavior for /api/* path"
  }
}

# Test 9: Verify /admin/* cache behavior exists
run "admin_cache_behavior" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition = anytrue([
      for behavior in aws_cloudfront_distribution.main.ordered_cache_behavior :
      behavior.path_pattern == "/admin/*"
    ])
    error_message = "Distribution must have ordered cache behavior for /admin/* path"
  }
}

# Test 10: Verify /images/* cache behavior exists
run "images_cache_behavior" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition = anytrue([
      for behavior in aws_cloudfront_distribution.main.ordered_cache_behavior :
      behavior.path_pattern == "/images/*"
    ])
    error_message = "Distribution must have ordered cache behavior for /images/* path"
  }
}

# Test 11: Verify environment variable validation
run "environment_validation" {
  command = plan

  variables {
    environment                             = "staging" # Invalid environment - should fail
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  expect_failures = [
    var.environment
  ]
}

# Test 12: Verify price class validation
run "price_class_validation" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
    price_class                             = "InvalidPriceClass" # Invalid - should fail
  }

  expect_failures = [
    var.price_class
  ]
}

# Test 13: Verify outputs are defined
# Note: Output values are computed after apply in plan phase, so we verify
# that the module can be planned successfully (outputs are defined in outputs.tf)
run "outputs_defined" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify the distribution resource is planned (outputs derive from this)
  assert {
    condition     = aws_cloudfront_distribution.main.enabled == true
    error_message = "Distribution must be enabled"
  }

  # Verify OAC resource is planned
  assert {
    condition     = aws_cloudfront_origin_access_control.s3_oac.signing_behavior == "always"
    error_message = "OAC must be configured"
  }
}

# Test 14: Verify minimum TLS version is TLS 1.2
run "tls_minimum_version" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.viewer_certificate[0].minimum_protocol_version == "TLSv1.2_2021"
    error_message = "Distribution must use TLSv1.2_2021 minimum protocol version"
  }
}

# Test 15: Verify default root object is index.html
run "default_root_object" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.default_root_object == "index.html"
    error_message = "Distribution must have default_root_object set to index.html"
  }
}

# Test 16: Verify SPA error responses (403 -> 200 /index.html)
run "spa_error_responses" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify 403 error response is configured for SPA
  assert {
    condition = anytrue([
      for err in aws_cloudfront_distribution.main.custom_error_response :
      err.error_code == 403 && err.response_code == 200 && err.response_page_path == "/index.html"
    ])
    error_message = "Distribution must have custom error response for 403 -> 200 /index.html"
  }

  # Verify 404 error response is configured for SPA
  assert {
    condition = anytrue([
      for err in aws_cloudfront_distribution.main.custom_error_response :
      err.error_code == 404 && err.response_code == 200 && err.response_page_path == "/index.html"
    ])
    error_message = "Distribution must have custom error response for 404 -> 200 /index.html"
  }
}

# Test 17: Verify tags are applied
run "tags_applied" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
    tags = {
      Project = "serverless-blog"
      Owner   = "devops"
    }
  }

  assert {
    condition     = aws_cloudfront_distribution.main.tags["Environment"] == "dev"
    error_message = "Environment tag must be applied to distribution"
  }

  assert {
    condition     = aws_cloudfront_distribution.main.tags["Project"] == "serverless-blog"
    error_message = "Custom Project tag must be applied"
  }
}

# Test 18: Verify CloudFront functions are created for path rewriting
run "cloudfront_functions_created" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify image path function exists
  assert {
    condition     = aws_cloudfront_function.image_path.runtime == "cloudfront-js-2.0"
    error_message = "Image path CloudFront function must use cloudfront-js-2.0 runtime"
  }

  # Verify admin SPA function exists
  assert {
    condition     = aws_cloudfront_function.admin_spa.runtime == "cloudfront-js-2.0"
    error_message = "Admin SPA CloudFront function must use cloudfront-js-2.0 runtime"
  }

  # Verify API path function exists
  assert {
    condition     = aws_cloudfront_function.api_path.runtime == "cloudfront-js-2.0"
    error_message = "API path CloudFront function must use cloudfront-js-2.0 runtime"
  }
}

# Test 19: Verify S3 origins have OAC configured
# Note: origin_access_control_id is computed after apply, so we verify
# that OAC resource exists and is properly configured
run "s3_origins_have_oac" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify OAC is configured for S3 origins
  assert {
    condition     = aws_cloudfront_origin_access_control.s3_oac.origin_access_control_origin_type == "s3"
    error_message = "OAC must be configured for S3 origin type"
  }

  # Verify signing protocol is sigv4
  assert {
    condition     = aws_cloudfront_origin_access_control.s3_oac.signing_protocol == "sigv4"
    error_message = "OAC must use sigv4 signing protocol for S3 origins"
  }
}

# Test 20: Verify API origin uses HTTPS only
run "api_origin_https_only" {
  command = plan

  variables {
    environment                             = "dev"
    image_bucket_name                       = "test-images-bucket"
    image_bucket_regional_domain_name       = "test-images-bucket.s3.ap-northeast-1.amazonaws.com"
    public_site_bucket_name                 = "test-public-site-bucket"
    public_site_bucket_regional_domain_name = "test-public-site-bucket.s3.ap-northeast-1.amazonaws.com"
    admin_site_bucket_name                  = "test-admin-site-bucket"
    admin_site_bucket_regional_domain_name  = "test-admin-site-bucket.s3.ap-northeast-1.amazonaws.com"
    rest_api_id                             = "abc123xyz"
    api_stage_name                          = "dev"
    aws_region                              = "ap-northeast-1"
  }

  # Verify API Gateway origin uses HTTPS only
  assert {
    condition = anytrue([
      for origin in aws_cloudfront_distribution.main.origin :
      can(regex("execute-api", origin.domain_name)) && origin.custom_origin_config[0].origin_protocol_policy == "https-only"
    ])
    error_message = "API Gateway origin must use https-only protocol policy"
  }
}
