package markdown

import (
	"bytes"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
)

// linkButtonTransformer recognizes [label](url){.link-button}. Keeping the
// destination in an ordinary link preserves goldmark's escaping and URI guard.
// No raw HTML, arbitrary classes, or arbitrary attributes are enabled.
type linkButtonTransformer struct{}

func (linkButtonTransformer) Transform(doc *ast.Document, reader text.Reader, _ parser.Context) {
	source := reader.Source()
	marker := []byte("{.link-button}")
	if err := ast.Walk(doc, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering || (node.Kind() != ast.KindLink && node.Kind() != ast.KindAutoLink) {
			return ast.WalkContinue, nil
		}
		next, ok := node.NextSibling().(*ast.Text)
		if !ok || !bytes.HasPrefix(next.Segment.Value(source), marker) {
			return ast.WalkContinue, nil
		}
		node.SetAttributeString("class", []byte("article-link-button"))
		// Retain the node so any hard/soft line break attached to it is preserved.
		next.Segment.Start += len(marker)
		return ast.WalkContinue, nil
	}); err != nil {
		// The visitor never returns an error; stop safely if that changes later.
		return
	}
}
