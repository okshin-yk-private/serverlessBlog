// Package markdown provides Markdown to HTML conversion with XSS sanitization.
package markdown

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"

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

// uuidPattern matches a standard UUID format (8-4-4-4-12 hex characters).
var uuidPattern = `[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`

// mindmapMarkerInParagraph matches {{mindmap:UUID}} as the sole content of a <p> tag.
// Requirement 5.3: Replace mindmap markers with embed div elements.
var mindmapMarkerInParagraph = regexp.MustCompile(`<p>\{\{mindmap:(` + uuidPattern + `)\}\}</p>`)

// mindmapMarkerInline matches {{mindmap:UUID}} anywhere in the HTML.
var mindmapMarkerInline = regexp.MustCompile(`\{\{mindmap:(` + uuidPattern + `)\}\}`)

// codeBlockPattern matches <pre>...</pre> and <code>...</code> blocks to protect from marker replacement.
var codeBlockPattern = regexp.MustCompile(`(?s)<pre[^>]*>.*?</pre>|<code[^>]*>.*?</code>`)

// ConvertToHTML converts Markdown content to sanitized HTML.
// The conversion pipeline is: Markdown → HTML (goldmark) → Sanitized HTML (sanitizer) → Mindmap marker conversion.
// Empty input returns an empty string.
//
// Requirement 5.3, 5.4: Mindmap markers ({{mindmap:UUID}}) are converted to embed div elements.
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

	// Convert mindmap markers to embed div elements (post-sanitization)
	// Requirement 5.3, 5.4
	result := ConvertMindmapMarkers(sanitized)

	return result, nil
}

// ConvertMindmapMarkers replaces {{mindmap:UUID}} markers in HTML with embed div elements.
// Valid UUID markers are converted to: <div class="mindmap-embed" data-mindmap-id="UUID"></div>
// Invalid ID formats are left unchanged (fail-safe).
//
// Requirement 5.3: Mindmap markers are converted to interactive mindmap views.
// Requirement 5.4: Astro SSG embeds mindmap data at build time.
func ConvertMindmapMarkers(htmlStr string) string {
	if htmlStr == "" {
		return ""
	}

	// Protect code blocks by temporarily replacing them with placeholders.
	// This prevents markers inside <pre>/<code> from being converted.
	var codeBlocks []string
	protected := codeBlockPattern.ReplaceAllStringFunc(htmlStr, func(match string) string {
		idx := len(codeBlocks)
		codeBlocks = append(codeBlocks, match)
		return fmt.Sprintf("\x00CB%d\x00", idx)
	})

	// First pass: replace markers that are the sole content of a <p> tag (remove p wrapper)
	result := mindmapMarkerInParagraph.ReplaceAllString(protected,
		`<div class="mindmap-embed" data-mindmap-id="$1"></div>`)

	// Second pass: replace any remaining inline markers
	result = mindmapMarkerInline.ReplaceAllString(result,
		`<div class="mindmap-embed" data-mindmap-id="$1"></div>`)

	// Restore code blocks
	for i, block := range codeBlocks {
		result = strings.Replace(result, fmt.Sprintf("\x00CB%d\x00", i), block, 1)
	}

	return result
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
