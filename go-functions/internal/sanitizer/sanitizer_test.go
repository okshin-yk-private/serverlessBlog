// Package sanitizer provides HTML content sanitization for XSS prevention.
// This test file follows TDD methodology - tests written first.
//
// Requirement 16.1: HTML content shall be sanitized with an allowlist of safe tags and attributes
// Requirement 16.2: Allowed tags: <p>, <br>, <strong>, <em>, <a>, <ul>, <ol>, <li>, <h1>-<h6>, <blockquote>, <code>, <pre>, <img>
// Requirement 16.3: <a> href shall only allow http://, https://, or relative URLs
// Requirement 16.4: <img> shall only allow src, alt, width, height attributes with validated URL patterns
// Requirement 16.5: All <script>, <iframe>, <object>, <embed>, onclick, onerror, and event handler attributes shall be stripped
// Requirement 16.6: When rendering content in Astro templates using set:html, the content shall already be sanitized
// Requirement 16.7: The sanitization logic shall be implemented in the Go Lambda post handlers (create/update)
package sanitizer

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Test suite for allowed tags (Requirement 16.2)
func TestSanitize_AllowedTags(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "paragraph tag",
			input:    "<p>Hello World</p>",
			expected: "<p>Hello World</p>",
		},
		{
			name:     "break tag",
			input:    "Line 1<br>Line 2",
			expected: "Line 1<br>Line 2",
		},
		{
			name:     "break tag self-closing",
			input:    "Line 1<br/>Line 2",
			expected: "Line 1<br/>Line 2",
		},
		{
			name:     "strong tag",
			input:    "<strong>Bold text</strong>",
			expected: "<strong>Bold text</strong>",
		},
		{
			name:     "em tag",
			input:    "<em>Italic text</em>",
			expected: "<em>Italic text</em>",
		},
		{
			name:     "unordered list",
			input:    "<ul><li>Item 1</li><li>Item 2</li></ul>",
			expected: "<ul><li>Item 1</li><li>Item 2</li></ul>",
		},
		{
			name:     "ordered list",
			input:    "<ol><li>First</li><li>Second</li></ol>",
			expected: "<ol><li>First</li><li>Second</li></ol>",
		},
		{
			name:     "heading h1",
			input:    "<h1>Title</h1>",
			expected: "<h1>Title</h1>",
		},
		{
			name:     "heading h2",
			input:    "<h2>Subtitle</h2>",
			expected: "<h2>Subtitle</h2>",
		},
		{
			name:     "heading h3",
			input:    "<h3>Section</h3>",
			expected: "<h3>Section</h3>",
		},
		{
			name:     "heading h4",
			input:    "<h4>Subsection</h4>",
			expected: "<h4>Subsection</h4>",
		},
		{
			name:     "heading h5",
			input:    "<h5>Minor section</h5>",
			expected: "<h5>Minor section</h5>",
		},
		{
			name:     "heading h6",
			input:    "<h6>Smallest heading</h6>",
			expected: "<h6>Smallest heading</h6>",
		},
		{
			name:     "blockquote",
			input:    "<blockquote>Quote text</blockquote>",
			expected: "<blockquote>Quote text</blockquote>",
		},
		{
			name:     "code inline",
			input:    "<code>const x = 1;</code>",
			expected: "<code>const x = 1;</code>",
		},
		{
			name:     "pre block",
			input:    "<pre>function() {\n  return true;\n}</pre>",
			expected: "<pre>function() {\n  return true;\n}</pre>",
		},
		{
			name:     "nested tags",
			input:    "<p><strong>Bold</strong> and <em>italic</em></p>",
			expected: "<p><strong>Bold</strong> and <em>italic</em></p>",
		},
		{
			name:     "complex nesting",
			input:    "<blockquote><p>Quoted <strong>text</strong></p></blockquote>",
			expected: "<blockquote><p>Quoted <strong>text</strong></p></blockquote>",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test suite for anchor tag with URL validation (Requirement 16.3)
func TestSanitize_AnchorTag(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "http URL allowed",
			input:    `<a href="http://example.com">Link</a>`,
			expected: `<a href="http://example.com" rel="nofollow noreferrer">Link</a>`,
		},
		{
			name:     "https URL allowed",
			input:    `<a href="https://example.com">Secure Link</a>`,
			expected: `<a href="https://example.com" rel="nofollow noreferrer">Secure Link</a>`,
		},
		{
			name:     "relative URL allowed",
			input:    `<a href="/posts/123">Internal Link</a>`,
			expected: `<a href="/posts/123" rel="nofollow noreferrer">Internal Link</a>`,
		},
		{
			name:     "relative URL with path allowed",
			input:    `<a href="../about">About</a>`,
			expected: `<a href="../about" rel="nofollow noreferrer">About</a>`,
		},
		{
			name:     "javascript URL removed",
			input:    `<a href="javascript:alert('XSS')">Bad Link</a>`,
			expected: `Bad Link`,
		},
		{
			name:     "data URL removed",
			input:    `<a href="data:text/html,<script>alert('XSS')</script>">Data Link</a>`,
			expected: `Data Link`,
		},
		{
			name:     "vbscript URL removed",
			input:    `<a href="vbscript:msgbox('XSS')">VBS Link</a>`,
			expected: `VBS Link`,
		},
		{
			name:     "other attributes on anchor stripped",
			input:    `<a href="https://example.com" onclick="alert('xss')" class="link">Link</a>`,
			expected: `<a href="https://example.com" rel="nofollow noreferrer">Link</a>`,
		},
		{
			name:     "anchor without href preserved",
			input:    `<a name="section1">Anchor</a>`,
			expected: `Anchor`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test suite for image tag with URL and attribute validation (Requirement 16.4)
func TestSanitize_ImageTag(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "http src allowed",
			input:    `<img src="http://example.com/image.jpg">`,
			expected: `<img src="http://example.com/image.jpg">`,
		},
		{
			name:     "https src allowed",
			input:    `<img src="https://example.com/image.jpg">`,
			expected: `<img src="https://example.com/image.jpg">`,
		},
		{
			name:     "relative src allowed",
			input:    `<img src="/images/photo.png">`,
			expected: `<img src="/images/photo.png">`,
		},
		{
			name:     "alt attribute allowed",
			input:    `<img src="https://example.com/img.jpg" alt="Description">`,
			expected: `<img src="https://example.com/img.jpg" alt="Description">`,
		},
		{
			name:     "width attribute allowed",
			input:    `<img src="https://example.com/img.jpg" width="300">`,
			expected: `<img src="https://example.com/img.jpg" width="300">`,
		},
		{
			name:     "height attribute allowed",
			input:    `<img src="https://example.com/img.jpg" height="200">`,
			expected: `<img src="https://example.com/img.jpg" height="200">`,
		},
		{
			name:     "all allowed attributes together",
			input:    `<img src="https://example.com/img.jpg" alt="Photo" width="300" height="200">`,
			expected: `<img src="https://example.com/img.jpg" alt="Photo" width="300" height="200">`,
		},
		{
			name:     "javascript src removed",
			input:    `<img src="javascript:alert('XSS')">`,
			expected: ``,
		},
		{
			name:     "data src removed",
			input:    `<img src="data:image/svg+xml,<svg onload=alert('XSS')>">`,
			expected: ``,
		},
		{
			name:     "onerror attribute removed",
			input:    `<img src="x" onerror="alert('XSS')">`,
			expected: `<img src="x">`,
		},
		{
			name:     "onload attribute removed",
			input:    `<img src="https://example.com/img.jpg" onload="alert('XSS')">`,
			expected: `<img src="https://example.com/img.jpg">`,
		},
		{
			name:     "class attribute removed",
			input:    `<img src="https://example.com/img.jpg" class="rounded">`,
			expected: `<img src="https://example.com/img.jpg">`,
		},
		{
			name:     "style attribute removed",
			input:    `<img src="https://example.com/img.jpg" style="border:1px solid red">`,
			expected: `<img src="https://example.com/img.jpg">`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test suite for dangerous tags removal (Requirement 16.5)
func TestSanitize_DangerousTags(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "script tag removed",
			input:    `<script>alert('XSS')</script>`,
			expected: ``,
		},
		{
			name:     "script with attributes removed",
			input:    `<script src="evil.js"></script>`,
			expected: ``,
		},
		{
			name:     "iframe removed",
			input:    `<iframe src="https://evil.com"></iframe>`,
			expected: ``,
		},
		{
			name:     "object removed",
			input:    `<object data="malware.swf"></object>`,
			expected: ``,
		},
		{
			name:     "embed removed",
			input:    `<embed src="malware.swf">`,
			expected: ``,
		},
		{
			name:     "style tag removed",
			input:    `<style>body { background: url('javascript:alert()'); }</style>`,
			expected: ``,
		},
		{
			name:     "link tag removed",
			input:    `<link rel="stylesheet" href="evil.css">`,
			expected: ``,
		},
		{
			name:     "meta tag removed",
			input:    `<meta http-equiv="refresh" content="0;url=http://evil.com">`,
			expected: ``,
		},
		{
			name:     "base tag removed",
			input:    `<base href="http://evil.com">`,
			expected: ``,
		},
		{
			name:     "form tag removed",
			input:    `<form action="http://evil.com"><input type="text"></form>`,
			expected: ``,
		},
		{
			name:     "svg tag removed",
			input:    `<svg onload="alert('XSS')"><circle cx="50" cy="50" r="50"></circle></svg>`,
			expected: ``,
		},
		{
			name:     "math tag removed",
			input:    `<math><mi>x</mi></math>`,
			expected: `x`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test suite for event handler attribute removal (Requirement 16.5)
func TestSanitize_EventHandlers(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "onclick removed",
			input:    `<p onclick="alert('XSS')">Click me</p>`,
			expected: `<p>Click me</p>`,
		},
		{
			name:     "onmouseover removed",
			input:    `<p onmouseover="alert('XSS')">Hover me</p>`,
			expected: `<p>Hover me</p>`,
		},
		{
			name:     "onerror removed",
			input:    `<p onerror="alert('XSS')">Error</p>`,
			expected: `<p>Error</p>`,
		},
		{
			name:     "onload removed",
			input:    `<body onload="alert('XSS')">Content</body>`,
			expected: `Content`,
		},
		{
			name:     "onfocus removed",
			input:    `<input onfocus="alert('XSS')">`,
			expected: ``,
		},
		{
			name:     "onblur removed",
			input:    `<input onblur="alert('XSS')">`,
			expected: ``,
		},
		{
			name:     "onsubmit removed",
			input:    `<form onsubmit="alert('XSS')"><input></form>`,
			expected: ``,
		},
		{
			name:     "onkeypress removed",
			input:    `<p onkeypress="alert('XSS')">Type here</p>`,
			expected: `<p>Type here</p>`,
		},
		{
			name:     "ondblclick removed",
			input:    `<p ondblclick="alert('XSS')">Double click</p>`,
			expected: `<p>Double click</p>`,
		},
		{
			name:     "onchange removed",
			input:    `<select onchange="alert('XSS')"><option>A</option></select>`,
			expected: `A`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test suite for XSS attack vectors
func TestSanitize_XSSVectors(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "mixed case script tag",
			input:    `<ScRiPt>alert('XSS')</ScRiPt>`,
			expected: ``,
		},
		{
			name:     "script with encoded characters",
			input:    `<script>alert(&#x27;XSS&#x27;)</script>`,
			expected: ``,
		},
		{
			name:     "img with javascript in src",
			input:    `<img src=javascript:alert('XSS')>`,
			expected: ``,
		},
		{
			name:     "img with expression in style",
			input:    `<img style="xss:expression(alert('XSS'))">`,
			expected: ``,
		},
		{
			name:     "nested script obfuscation",
			input:    `<scr<script>ipt>alert('XSS')</scr<script>ipt>`,
			expected: `ipt&gt;alert(&#39;XSS&#39;)ipt&gt;`,
		},
		{
			name:     "null byte injection",
			input:    "<script\x00>alert('XSS')</script>",
			expected: `alert(&#39;XSS&#39;)`,
		},
		{
			name:     "SVG with script",
			input:    `<svg><script>alert('XSS')</script></svg>`,
			expected: ``,
		},
		{
			name:     "img with onerror and valid src",
			input:    `<img src="valid.jpg" onerror="alert('XSS')">`,
			expected: `<img src="valid.jpg">`,
		},
		{
			name:     "body onload",
			input:    `<body onload=alert('XSS')>content</body>`,
			expected: `content`,
		},
		{
			name:     "div with onclick",
			input:    `<div onclick="alert('XSS')">click me</div>`,
			expected: `click me`,
		},
		{
			name:     "anchor with javascript href and text",
			input:    `<a href="javascript:alert('XSS')">click me</a>`,
			expected: `click me`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test suite for edge cases and special content
func TestSanitize_EdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "plain text",
			input:    "Hello, World!",
			expected: "Hello, World!",
		},
		{
			name:     "text with special characters",
			input:    "5 > 3 && 2 < 4",
			expected: "5 &gt; 3 &amp;&amp; 2 &lt; 4",
		},
		{
			name:     "Japanese text",
			input:    "<p>こんにちは世界</p>",
			expected: "<p>こんにちは世界</p>",
		},
		{
			name:     "emoji content",
			input:    "<p>Hello 👋 World 🌍</p>",
			expected: "<p>Hello 👋 World 🌍</p>",
		},
		{
			name:     "code with html entities inside",
			input:    "<code>&lt;script&gt;alert('safe')&lt;/script&gt;</code>",
			expected: "<code>&lt;script&gt;alert(&#39;safe&#39;)&lt;/script&gt;</code>",
		},
		{
			name:     "pre with html content inside",
			input:    "<pre>&lt;div class=\"foo\"&gt;&lt;/div&gt;</pre>",
			expected: "<pre>&lt;div class=&#34;foo&#34;&gt;&lt;/div&gt;</pre>",
		},
		{
			name:     "mixed safe and unsafe content",
			input:    "<p>Safe content</p><script>bad()</script><p>More safe</p>",
			expected: "<p>Safe content</p><p>More safe</p>",
		},
		{
			name:     "deeply nested tags",
			input:    "<ul><li><p><strong><em>Deep</em></strong></p></li></ul>",
			expected: "<ul><li><p><strong><em>Deep</em></strong></p></li></ul>",
		},
		{
			name:     "only whitespace",
			input:    "   \n\t  ",
			expected: "   \n\t  ",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Sanitize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Test for SanitizeHTML (wrapper for consistency with existing API)
func TestSanitizeHTML(t *testing.T) {
	input := "<p><script>alert('XSS')</script>Safe text</p>"
	expected := "<p>Safe text</p>"

	result := SanitizeHTML(input)
	assert.Equal(t, expected, result)
}

// Benchmark tests
func BenchmarkSanitize_Simple(b *testing.B) {
	input := "<p>Hello World</p>"
	for i := 0; i < b.N; i++ {
		Sanitize(input)
	}
}

func BenchmarkSanitize_Complex(b *testing.B) {
	input := `<div onclick="alert('xss')"><p><strong>Bold</strong> and <em>italic</em></p>
		<script>evil()</script><img src="https://example.com/img.jpg" onerror="alert('xss')">
		<a href="javascript:void(0)">Link</a></div>`
	for i := 0; i < b.N; i++ {
		Sanitize(input)
	}
}

func BenchmarkSanitize_LargeContent(b *testing.B) {
	// Generate large content with many tags
	input := ""
	for i := 0; i < 100; i++ {
		input += "<p>Paragraph " + string(rune('A'+i%26)) + " with <strong>bold</strong> and <em>italic</em> text.</p>"
	}
	for i := 0; i < b.N; i++ {
		Sanitize(input)
	}
}
