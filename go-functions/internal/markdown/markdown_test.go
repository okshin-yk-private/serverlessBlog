package markdown

import (
	"strings"
	"testing"
)

func TestConvertToHTML_BasicConversion(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		contains string // Use contains instead of exact match for flexibility
	}{
		{
			name:     "empty string returns empty",
			input:    "",
			contains: "",
		},
		{
			name:     "plain text remains as paragraph",
			input:    "Hello, World!",
			contains: "<p>Hello, World!</p>",
		},
		{
			name:     "heading conversion",
			input:    "# Hello",
			contains: ">Hello</h1>",
		},
		{
			name:     "h2 heading conversion",
			input:    "## Subheading",
			contains: ">Subheading</h2>",
		},
		{
			name:     "bold text conversion",
			input:    "**bold**",
			contains: "<strong>bold</strong>",
		},
		{
			name:     "italic text conversion",
			input:    "*italic*",
			contains: "<em>italic</em>",
		},
		{
			name:     "link conversion",
			input:    "[link](https://example.com)",
			contains: `href="https://example.com"`,
		},
		{
			name:     "inline code conversion",
			input:    "`code`",
			contains: "<code>code</code>",
		},
		{
			name:     "code block conversion",
			input:    "```\ncode\n```",
			contains: "<pre><code>",
		},
		{
			name:     "unordered list conversion",
			input:    "- item1\n- item2",
			contains: "<li>item1</li>",
		},
		{
			name:     "ordered list conversion",
			input:    "1. first\n2. second",
			contains: "<li>first</li>",
		},
		{
			name:     "blockquote conversion",
			input:    "> quote",
			contains: "<blockquote>",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ConvertToHTML(tt.input)
			if err != nil {
				t.Fatalf("ConvertToHTML() error = %v", err)
			}
			if tt.contains == "" && result != "" {
				t.Errorf("ConvertToHTML() = %q, want empty string", result)
			} else if tt.contains != "" && !strings.Contains(result, tt.contains) {
				t.Errorf("ConvertToHTML() = %q, want containing %q", result, tt.contains)
			}
		})
	}
}

func TestConvertToHTML_GFMExtensions(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		contains string
	}{
		{
			name:     "strikethrough",
			input:    "~~strikethrough~~",
			contains: "<del>strikethrough</del>",
		},
		{
			name:     "autolink URL",
			input:    "https://example.com",
			contains: `href="https://example.com"`,
		},
		{
			name:     "table conversion",
			input:    "| a | b |\n|---|---|\n| 1 | 2 |",
			contains: "<table>",
		},
		{
			name:     "table has thead",
			input:    "| a | b |\n|---|---|\n| 1 | 2 |",
			contains: "<thead>",
		},
		{
			name:     "table has tbody",
			input:    "| a | b |\n|---|---|\n| 1 | 2 |",
			contains: "<tbody>",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ConvertToHTML(tt.input)
			if err != nil {
				t.Fatalf("ConvertToHTML() error = %v", err)
			}
			if !strings.Contains(result, tt.contains) {
				t.Errorf("ConvertToHTML() = %q, want containing %q", result, tt.contains)
			}
		})
	}
}

func TestConvertToHTML_XSSSanitization(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		notContains []string
		contains    []string
	}{
		{
			name:        "removes script tags",
			input:       "<script>alert('xss')</script>",
			notContains: []string{"<script>", "</script>", "alert("},
		},
		{
			name:        "removes onclick attribute",
			input:       `<a href="#" onclick="alert('xss')">link</a>`,
			notContains: []string{"onclick"},
		},
		{
			name:        "removes onerror attribute",
			input:       `<img src="x" onerror="alert('xss')">`,
			notContains: []string{"onerror"},
		},
		{
			name:        "removes javascript URL in href",
			input:       `<a href="javascript:alert('xss')">click</a>`,
			notContains: []string{"javascript:"},
		},
		{
			name:        "removes javascript URL in markdown link",
			input:       `[click](javascript:alert('xss'))`,
			notContains: []string{"javascript:"},
		},
		{
			name:        "removes iframe",
			input:       `<iframe src="https://evil.com"></iframe>`,
			notContains: []string{"<iframe", "</iframe>"},
		},
		{
			name:        "removes style with expression",
			input:       `<div style="background:url(javascript:alert('xss'))">`,
			notContains: []string{"javascript:"},
		},
		{
			name:  "preserves safe HTML in markdown",
			input: "**bold** and *italic*",
			contains: []string{
				"<strong>bold</strong>",
				"<em>italic</em>",
			},
		},
		{
			name:     "escapes script content in code blocks",
			input:    "```\n<script>alert('ok')</script>\n```",
			contains: []string{"&lt;script&gt;", "&lt;/script&gt;"},
		},
		{
			name:        "removes data URLs in images",
			input:       `<img src="data:text/html,<script>alert('xss')</script>">`,
			notContains: []string{"data:text/html"},
		},
		{
			name:  "preserves markdown image with https src",
			input: `![image](https://example.com/image.png)`,
			contains: []string{
				"https://example.com/image.png",
				`alt="image"`,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ConvertToHTML(tt.input)
			if err != nil {
				t.Fatalf("ConvertToHTML() error = %v", err)
			}
			for _, notContain := range tt.notContains {
				if strings.Contains(result, notContain) {
					t.Errorf("ConvertToHTML() = %q, should not contain %q", result, notContain)
				}
			}
			for _, contain := range tt.contains {
				if !strings.Contains(result, contain) {
					t.Errorf("ConvertToHTML() = %q, want containing %q", result, contain)
				}
			}
		})
	}
}

func TestConvertToHTML_ComplexContent(t *testing.T) {
	input := `# Blog Post

This is a **paragraph** with *emphasis*.

## Code Example

` + "```go\nfunc main() {\n    fmt.Println(\"Hello\")\n}\n```" + `

## List

- item 1
- item 2

> A quote

| Col1 | Col2 |
|------|------|
| A    | B    |
`

	result, err := ConvertToHTML(input)
	if err != nil {
		t.Fatalf("ConvertToHTML() error = %v", err)
	}

	expectedContents := []string{
		">Blog Post</h1>",
		"<strong>paragraph</strong>",
		"<em>emphasis</em>",
		">Code Example</h2>",
		"<pre><code>",
		">List</h2>",
		"<li>item 1</li>",
		"<li>item 2</li>",
		"<blockquote>",
		"<table>",
	}

	for _, expected := range expectedContents {
		if !strings.Contains(result, expected) {
			t.Errorf("ConvertToHTML() missing expected content: %q\nGot: %s", expected, result)
		}
	}
}

func TestConvertToHTML_SecurityEdgeCases(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		notContains []string
	}{
		{
			name:        "nested script tags are escaped",
			input:       "<scr<script>ipt>alert('xss')</scr</script>ipt>",
			notContains: []string{"<script>"},
		},
		{
			name:        "encoded script",
			input:       `<a href="&#106;avascript:alert('xss')">click</a>`,
			notContains: []string{"javascript:"},
		},
		{
			name:        "null bytes escaped",
			input:       "<scr\x00ipt>alert('xss')</script>",
			notContains: []string{"<script>"},
		},
		{
			name:        "event handlers",
			input:       `<div onmouseover="alert('xss')">hover</div>`,
			notContains: []string{"onmouseover"},
		},
		{
			name:        "svg with script removed",
			input:       `<svg onload="alert('xss')"><script>alert('xss')</script></svg>`,
			notContains: []string{"<script>", "onload"},
		},
		{
			name:        "base tag",
			input:       `<base href="https://evil.com/">`,
			notContains: []string{"<base"},
		},
		{
			name:        "form tag",
			input:       `<form action="https://evil.com/steal"><input type="text"></form>`,
			notContains: []string{"<form", "action="},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ConvertToHTML(tt.input)
			if err != nil {
				t.Fatalf("ConvertToHTML() error = %v", err)
			}
			for _, notContain := range tt.notContains {
				if strings.Contains(result, notContain) {
					t.Errorf("ConvertToHTML() = %q, should not contain %q", result, notContain)
				}
			}
		})
	}
}

func TestConvertToHTML_MarkdownFeatures(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		contains []string
	}{
		{
			name:     "horizontal rule",
			input:    "---",
			contains: []string{"<hr"},
		},
		{
			name:     "image with alt text",
			input:    "![alt](https://example.com/img.png)",
			contains: []string{`alt="alt"`, "https://example.com/img.png"},
		},
		{
			name:     "nested lists",
			input:    "- item1\n  - nested\n- item2",
			contains: []string{"<li>item1", "<li>nested", "<li>item2"},
		},
		{
			name:     "code block with language",
			input:    "```javascript\nconst x = 1;\n```",
			contains: []string{"<pre><code", "const x = 1;"},
		},
		{
			name:     "multiple paragraphs",
			input:    "Para 1\n\nPara 2",
			contains: []string{"<p>Para 1</p>", "<p>Para 2</p>"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ConvertToHTML(tt.input)
			if err != nil {
				t.Fatalf("ConvertToHTML() error = %v", err)
			}
			for _, contain := range tt.contains {
				if !strings.Contains(result, contain) {
					t.Errorf("ConvertToHTML() = %q, want containing %q", result, contain)
				}
			}
		})
	}
}

func TestExtractExcerpt(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		maxLength int
		expected  string
	}{
		{
			name:      "short text unchanged",
			input:     "Hello",
			maxLength: 10,
			expected:  "Hello",
		},
		{
			name:      "exact length unchanged",
			input:     "Hello",
			maxLength: 5,
			expected:  "Hello",
		},
		{
			name:      "long text truncated with ellipsis",
			input:     "Hello, World!",
			maxLength: 5,
			expected:  "Hello...",
		},
		{
			name:      "empty string",
			input:     "",
			maxLength: 10,
			expected:  "",
		},
		{
			name:      "unicode text truncated correctly by rune count",
			input:     "こんにちは世界",
			maxLength: 5,
			expected:  "こんにちは...",
		},
		{
			name:      "unicode text shorter than maxLength unchanged",
			input:     "こんにちは世界",
			maxLength: 10,
			expected:  "こんにちは世界",
		},
		{
			name:      "mixed ascii and unicode truncated by rune count",
			input:     "Hello世界！",
			maxLength: 7,
			expected:  "Hello世界...",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ExtractExcerpt(tt.input, tt.maxLength)
			if result != tt.expected {
				t.Errorf("ExtractExcerpt() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestConvertToHTML_LinksHaveNofollow(t *testing.T) {
	// sanitizer adds rel="nofollow noreferrer" to links for security
	result, err := ConvertToHTML("[link](https://example.com)")
	if err != nil {
		t.Fatalf("ConvertToHTML() error = %v", err)
	}
	if !strings.Contains(result, `rel="nofollow`) {
		t.Errorf("ConvertToHTML() should add rel=nofollow to links, got: %s", result)
	}
}

func TestConvertToHTML_HeadingsHaveIDs(t *testing.T) {
	// goldmark adds id attributes to headings
	result, err := ConvertToHTML("# Test Heading")
	if err != nil {
		t.Fatalf("ConvertToHTML() error = %v", err)
	}
	if !strings.Contains(result, `id="`) {
		t.Errorf("ConvertToHTML() should add id to headings, got: %s", result)
	}
}
