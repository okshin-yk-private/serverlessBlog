// Package markdown provides Markdown to HTML conversion with XSS sanitization.
package markdown

import (
	"bytes"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"

	"serverless-blog/go-functions/internal/sanitizer"
)

// md is the configured goldmark Markdown parser with GFM extensions.
var md = goldmark.New(
	goldmark.WithExtensions(
		extension.GFM, // GitHub Flavored Markdown: tables, strikethrough, autolinks, task lists
	),
	goldmark.WithParserOptions(
		parser.WithAutoHeadingID(),
	),
	goldmark.WithRendererOptions(
		html.WithHardWraps(),
		html.WithXHTML(),
	),
)

// ConvertToHTML converts Markdown content to sanitized HTML.
// The conversion pipeline is: Markdown → HTML (goldmark) → Sanitized HTML (sanitizer).
// Empty input returns an empty string.
//
// Requirement 16.6: Content is sanitized before storage, so Astro templates can safely use set:html.
// Requirement 16.7: Sanitization is applied in the Go Lambda handlers for create/update.
func ConvertToHTML(markdown string) (string, error) {
	if markdown == "" {
		return "", nil
	}

	// Convert Markdown to HTML using goldmark
	var buf bytes.Buffer
	if err := md.Convert([]byte(markdown), &buf); err != nil {
		return "", err
	}

	// Sanitize HTML output using the strict allowlist-based sanitizer
	// Requirement 16.1-16.5: Use strict sanitizer instead of UGCPolicy
	sanitized := sanitizer.Sanitize(buf.String())

	return sanitized, nil
}

// ExtractExcerpt extracts a text excerpt from Markdown content.
// If the content is longer than maxLength runes, it truncates and adds "...".
// Uses rune count instead of byte count to properly handle UTF-8 multi-byte characters.
func ExtractExcerpt(markdown string, maxLength int) string {
	runes := []rune(markdown)
	if len(runes) <= maxLength {
		return markdown
	}
	return string(runes[:maxLength]) + "..."
}
