// Package markdown provides Markdown to HTML conversion with XSS sanitization.
package markdown

import (
	"bytes"

	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
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

// policy is the bluemonday UGC policy for XSS sanitization.
var policy = bluemonday.UGCPolicy()

// ConvertToHTML converts Markdown content to sanitized HTML.
// The conversion pipeline is: Markdown → HTML (goldmark) → Sanitized HTML (bluemonday).
// Empty input returns an empty string.
func ConvertToHTML(markdown string) (string, error) {
	if markdown == "" {
		return "", nil
	}

	// Convert Markdown to HTML using goldmark
	var buf bytes.Buffer
	if err := md.Convert([]byte(markdown), &buf); err != nil {
		return "", err
	}

	// Sanitize HTML output using bluemonday UGCPolicy
	sanitized := policy.Sanitize(buf.String())

	return sanitized, nil
}

// ExtractExcerpt extracts a text excerpt from Markdown content.
// If the content is longer than maxLength, it truncates and adds "...".
func ExtractExcerpt(markdown string, maxLength int) string {
	if len(markdown) <= maxLength {
		return markdown
	}
	return markdown[:maxLength] + "..."
}
