// Package sanitizer provides HTML content sanitization for XSS prevention.
//
// Requirement 16.1: HTML content shall be sanitized with an allowlist of safe tags and attributes.
// Requirement 16.2: Allowed tags: <p>, <br>, <strong>, <em>, <a>, <ul>, <ol>, <li>, <h1>-<h6>, <blockquote>, <code>, <pre>, <img>
// Requirement 16.3: <a> href shall only allow http://, https://, or relative URLs
// Requirement 16.4: <img> shall only allow src, alt, width, height attributes with validated URL patterns
// Requirement 16.5: All <script>, <iframe>, <object>, <embed>, onclick, onerror, and event handler attributes shall be stripped
// Requirement 16.6: When rendering content in Astro templates using set:html, the content shall already be sanitized
// Requirement 16.7: The sanitization logic shall be implemented in the Go Lambda post handlers (create/update)
package sanitizer

import (
	"sync"

	"github.com/microcosm-cc/bluemonday"
)

// policy is the custom bluemonday policy with strict allowlist for safe HTML.
var (
	policy     *bluemonday.Policy
	policyOnce sync.Once
)

// getPolicy returns the lazily initialized bluemonday policy
func getPolicy() *bluemonday.Policy {
	policyOnce.Do(func() {
		// Create a strict policy that only allows specific tags and attributes
		policy = bluemonday.NewPolicy()

		// Requirement 16.2: Allowed tags with no attributes
		// Also allow hr, del for Markdown compatibility (GFM extensions)
		policy.AllowElements("p", "br", "strong", "em", "ul", "ol", "li",
			"h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre",
			"hr", "del", "table", "thead", "tbody", "tr", "th", "td")

		// Allow id attribute on headings for anchor links (goldmark auto-heading-id feature)
		policy.AllowAttrs("id").OnElements("h1", "h2", "h3", "h4", "h5", "h6")

		// Requirement 16.3: <a> tag with href validation
		// Only allow http, https, and relative URLs
		policy.AllowAttrs("href").OnElements("a")
		policy.AllowRelativeURLs(true)
		policy.AllowURLSchemes("http", "https")
		policy.RequireNoFollowOnLinks(true)
		policy.RequireNoReferrerOnLinks(true)
		policy.AddTargetBlankToFullyQualifiedLinks(false)

		// Requirement 16.4: <img> tag with allowed attributes and URL validation
		policy.AllowAttrs("src", "alt", "width", "height").OnElements("img")
	})
	return policy
}

// Sanitize removes dangerous HTML elements and attributes while preserving safe content.
// It uses a strict allowlist approach following OWASP recommendations.
//
// Safe elements: p, br, strong, em, a, ul, ol, li, h1-h6, blockquote, code, pre, img
// Safe attributes:
//   - a: href (http, https, relative URLs only)
//   - img: src (http, https, relative URLs only), alt, width, height
//
// Removed elements: script, iframe, object, embed, style, link, meta, base, form, svg, math
// Removed attributes: onclick, onerror, onload, onmouseover, and all other event handlers
func Sanitize(html string) string {
	if html == "" {
		return ""
	}
	return getPolicy().Sanitize(html)
}

// SanitizeHTML is an alias for Sanitize for API consistency with other sanitization functions.
func SanitizeHTML(html string) string {
	return Sanitize(html)
}
