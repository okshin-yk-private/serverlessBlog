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

func TestConvertMindmapMarkers_SingleMarker(t *testing.T) {
	input := `<p>{{mindmap:550e8400-e29b-41d4-a716-446655440000}}</p>`
	expected := `<div class="mindmap-embed" data-mindmap-id="550e8400-e29b-41d4-a716-446655440000"></div>`
	result := ConvertMindmapMarkers(input)
	if result != expected {
		t.Errorf("ConvertMindmapMarkers() = %q, want %q", result, expected)
	}
}

func TestConvertMindmapMarkers_MultipleMarkers(t *testing.T) {
	input := `<p>Some text</p>
<p>{{mindmap:550e8400-e29b-41d4-a716-446655440000}}</p>
<p>More text</p>
<p>{{mindmap:660e8400-e29b-41d4-a716-446655440001}}</p>`
	result := ConvertMindmapMarkers(input)
	if strings.Contains(result, "{{mindmap:550e8400") {
		t.Error("First marker was not converted")
	}
	if strings.Contains(result, "{{mindmap:660e8400") {
		t.Error("Second marker was not converted")
	}
	if !strings.Contains(result, `data-mindmap-id="550e8400-e29b-41d4-a716-446655440000"`) {
		t.Error("First div not found in result")
	}
	if !strings.Contains(result, `data-mindmap-id="660e8400-e29b-41d4-a716-446655440001"`) {
		t.Error("Second div not found in result")
	}
	if !strings.Contains(result, "<p>Some text</p>") {
		t.Error("Surrounding text should be preserved")
	}
	if !strings.Contains(result, "<p>More text</p>") {
		t.Error("Surrounding text should be preserved")
	}
}

func TestConvertMindmapMarkers_InvalidID(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{
			name:  "not a UUID format",
			input: `<p>{{mindmap:not-a-uuid}}</p>`,
		},
		{
			name:  "empty ID",
			input: `<p>{{mindmap:}}</p>`,
		},
		{
			name:  "UUID with uppercase (still valid)",
			input: `<p>{{mindmap:550E8400-E29B-41D4-A716-446655440000}}</p>`,
		},
		{
			name:  "too short UUID",
			input: `<p>{{mindmap:550e8400-e29b}}</p>`,
		},
		{
			name:  "spaces in ID",
			input: `<p>{{mindmap: 550e8400-e29b-41d4-a716-446655440000 }}</p>`,
		},
		{
			name:  "SQL injection attempt",
			input: `<p>{{mindmap:'; DROP TABLE mindmaps;--}}</p>`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ConvertMindmapMarkers(tt.input)
			// Invalid IDs should leave the marker unchanged
			if tt.name == "UUID with uppercase (still valid)" {
				// Uppercase UUIDs are valid
				if !strings.Contains(result, `data-mindmap-id="550E8400-E29B-41D4-A716-446655440000"`) {
					t.Errorf("Uppercase UUID should be converted, got: %q", result)
				}
			} else {
				if strings.Contains(result, "mindmap-embed") {
					t.Errorf("Invalid ID should not be converted, got: %q", result)
				}
			}
		})
	}
}

func TestConvertMindmapMarkers_NoMarkers(t *testing.T) {
	input := `<p>This is regular content with no markers.</p>
<p>Another paragraph.</p>`
	result := ConvertMindmapMarkers(input)
	if result != input {
		t.Errorf("Content without markers should be unchanged.\nGot:  %q\nWant: %q", result, input)
	}
}

func TestConvertMindmapMarkers_EmptyInput(t *testing.T) {
	result := ConvertMindmapMarkers("")
	if result != "" {
		t.Errorf("Empty input should return empty string, got: %q", result)
	}
}

func TestConvertMindmapMarkers_MarkerInStandaloneParagraph(t *testing.T) {
	// When a marker is the sole content of a <p> tag, the <p> wrapper should be removed
	input := `<p>{{mindmap:550e8400-e29b-41d4-a716-446655440000}}</p>`
	result := ConvertMindmapMarkers(input)
	if strings.Contains(result, "<p>") {
		t.Errorf("Standalone marker paragraph should not have <p> wrapper, got: %q", result)
	}
	if !strings.Contains(result, `<div class="mindmap-embed"`) {
		t.Errorf("Should contain mindmap-embed div, got: %q", result)
	}
}

func TestConvertMindmapMarkers_SkipsCodeBlocks(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		contains    []string
		notContains []string
	}{
		{
			name:  "marker inside inline code preserved",
			input: `<p>Use <code>{{mindmap:550e8400-e29b-41d4-a716-446655440000}}</code> to embed</p>`,
			contains: []string{
				"{{mindmap:550e8400-e29b-41d4-a716-446655440000}}",
				"<code>",
			},
			notContains: []string{
				"mindmap-embed",
			},
		},
		{
			name:  "marker inside pre/code block preserved",
			input: "<pre><code>{{mindmap:550e8400-e29b-41d4-a716-446655440000}}\n</code></pre>",
			contains: []string{
				"{{mindmap:550e8400-e29b-41d4-a716-446655440000}}",
				"<pre><code>",
			},
			notContains: []string{
				"mindmap-embed",
			},
		},
		{
			name: "marker outside code is converted but inside code is preserved",
			input: `<p>{{mindmap:550e8400-e29b-41d4-a716-446655440000}}</p>
<pre><code>{{mindmap:660e8400-e29b-41d4-a716-446655440001}}
</code></pre>`,
			contains: []string{
				`data-mindmap-id="550e8400-e29b-41d4-a716-446655440000"`,
				"{{mindmap:660e8400-e29b-41d4-a716-446655440001}}",
			},
			notContains: []string{
				`data-mindmap-id="660e8400-e29b-41d4-a716-446655440001"`,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ConvertMindmapMarkers(tt.input)
			for _, contain := range tt.contains {
				if !strings.Contains(result, contain) {
					t.Errorf("ConvertMindmapMarkers() = %q, want containing %q", result, contain)
				}
			}
			for _, notContain := range tt.notContains {
				if strings.Contains(result, notContain) {
					t.Errorf("ConvertMindmapMarkers() = %q, should not contain %q", result, notContain)
				}
			}
		})
	}
}

func TestConvertToHTML_MindmapMarkerIntegration(t *testing.T) {
	// Test that ConvertToHTML processes mindmap markers in the full pipeline
	tests := []struct {
		name        string
		input       string
		contains    []string
		notContains []string
	}{
		{
			name:  "marker on its own line",
			input: "Some text\n\n{{mindmap:550e8400-e29b-41d4-a716-446655440000}}\n\nMore text",
			contains: []string{
				`<div class="mindmap-embed" data-mindmap-id="550e8400-e29b-41d4-a716-446655440000"></div>`,
				"<p>Some text</p>",
				"<p>More text</p>",
			},
			notContains: []string{
				"{{mindmap:",
			},
		},
		{
			name:  "marker with no surrounding content",
			input: "{{mindmap:550e8400-e29b-41d4-a716-446655440000}}",
			contains: []string{
				`<div class="mindmap-embed" data-mindmap-id="550e8400-e29b-41d4-a716-446655440000"></div>`,
			},
			notContains: []string{
				"{{mindmap:",
			},
		},
		{
			name:  "invalid marker preserved",
			input: "{{mindmap:not-valid}}",
			contains: []string{
				"{{mindmap:not-valid}}",
			},
			notContains: []string{
				"mindmap-embed",
			},
		},
		{
			name:  "marker inside inline code is not converted",
			input: "Use `{{mindmap:550e8400-e29b-41d4-a716-446655440000}}` to embed",
			contains: []string{
				"{{mindmap:550e8400-e29b-41d4-a716-446655440000}}",
				"<code>",
			},
			notContains: []string{
				"mindmap-embed",
			},
		},
		{
			name:  "marker inside fenced code block is not converted",
			input: "```\n{{mindmap:550e8400-e29b-41d4-a716-446655440000}}\n```",
			contains: []string{
				"{{mindmap:550e8400-e29b-41d4-a716-446655440000}}",
				"<pre>",
			},
			notContains: []string{
				"mindmap-embed",
			},
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
			for _, notContain := range tt.notContains {
				if strings.Contains(result, notContain) {
					t.Errorf("ConvertToHTML() = %q, should not contain %q", result, notContain)
				}
			}
		})
	}
}
