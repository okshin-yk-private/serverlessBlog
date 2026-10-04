terraform {
  required_version = ">= 1.14"

  required_providers {
    cloudflare = {
      # Temporary cap: DNS modified_on regression introduced in 5.26.0 (upstream #7387).
      # https://github.com/cloudflare/terraform-provider-cloudflare/issues/7387
      source  = "cloudflare/cloudflare"
      version = "~> 5.0, < 5.26.0"
    }
  }
}
