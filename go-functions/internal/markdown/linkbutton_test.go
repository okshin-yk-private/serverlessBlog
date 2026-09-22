package markdown

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/net/html"
)

func TestLinkButtonSharedFixtures(t *testing.T) {
	data, err := os.ReadFile("../../../tests/fixtures/article-links.json")
	require.NoError(t, err)
	var cases []struct {
		Name, Markdown, Text, Href string
		Button                     bool
	}
	require.NoError(t, json.Unmarshal(data, &cases))
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			output, err := ConvertToHTML(tc.Markdown)
			require.NoError(t, err)
			doc, err := html.Parse(strings.NewReader(output))
			require.NoError(t, err)
			var anchor *html.Node
			var walk func(*html.Node)
			walk = func(n *html.Node) {
				if n.Type == html.ElementNode && n.Data == "a" {
					anchor = n
				}
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					walk(c)
				}
			}
			walk(doc)
			require.NotNil(t, anchor, output)
			attrs := map[string]string{}
			for _, a := range anchor.Attr {
				attrs[a.Key] = a.Val
			}
			require.Equal(t, tc.Href, attrs["href"])
			require.Equal(t, tc.Button, attrs["class"] == "article-link-button", output)
			require.Equal(t, "nofollow noreferrer", attrs["rel"])
			require.Empty(t, attrs["target"])
			var label strings.Builder
			walk = func(n *html.Node) {
				if n.Type == html.TextNode {
					label.WriteString(n.Data)
				}
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					walk(c)
				}
			}
			walk(anchor)
			require.Equal(t, tc.Text, label.String())
		})
	}
}

func TestLinkButtonSafetyAndBreaks(t *testing.T) {
	for _, input := range []string{
		"`[x](https://example.com){.link-button}`",
		"```\n[x](https://example.com){.link-button}\n```",
		`<a href="https://example.com" class="article-link-button" onclick="alert(1)">x</a>`,
	} {
		output, err := ConvertToHTML(input)
		require.NoError(t, err)
		require.NotContains(t, output, `<a href=`)
	}
	output, err := ConvertToHTML("[x](https://example.com){.link-button}  \nnext\n\n[y](https://example.org){.other-class}")
	require.NoError(t, err)
	require.Contains(t, output, `class="article-link-button"`)
	require.Contains(t, output, "<br/>")
	require.Contains(t, output, "{.other-class}")
}
