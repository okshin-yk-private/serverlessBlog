//! Markdown to HTML conversion with XSS sanitization.

use ammonia::Builder;
use pulldown_cmark::{html, Options, Parser};
use std::collections::{HashMap, HashSet};

/// Converts Markdown text to sanitized HTML.
///
/// This function uses pulldown-cmark for CommonMark-compliant Markdown parsing
/// and ammonia for XSS-safe HTML sanitization.
///
/// # Arguments
///
/// * `markdown` - The Markdown text to convert
///
/// # Returns
///
/// Sanitized HTML string
///
/// # Examples
///
/// ```
/// use common::markdown::markdown_to_safe_html;
///
/// let html = markdown_to_safe_html("# Hello\n\nThis is **bold**.");
/// assert!(html.contains("<h1>Hello</h1>"));
/// assert!(html.contains("<strong>bold</strong>"));
/// ```
pub fn markdown_to_safe_html(markdown: &str) -> String {
    if markdown.is_empty() {
        return String::new();
    }

    // Parse Markdown with GFM extensions
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_SMART_PUNCTUATION;

    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    // Sanitize HTML
    sanitize_html(&html_output)
}

/// Sanitizes HTML content by allowing only safe tags and attributes.
fn sanitize_html(html: &str) -> String {
    if html.is_empty() {
        return String::new();
    }

    // Allowed tags (matching Node.js implementation)
    let allowed_tags: HashSet<&str> = [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "br",
        "span",
        "div",
        "strong",
        "em",
        "u",
        "s",
        "del",
        "a",
        "img",
        "ul",
        "ol",
        "li",
        "blockquote",
        "code",
        "pre",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "input", // For task lists
    ]
    .into_iter()
    .collect();

    // Tag-specific allowed attributes
    let mut tag_attributes: HashMap<&str, HashSet<&str>> = HashMap::new();
    tag_attributes.insert("a", ["href", "title"].into_iter().collect());
    tag_attributes.insert("img", ["src", "alt", "title"].into_iter().collect());
    tag_attributes.insert(
        "input",
        ["type", "checked", "disabled"].into_iter().collect(),
    );

    // Generic attributes allowed on all tags
    let generic_attributes: HashSet<&str> = ["class", "id"].into_iter().collect();

    Builder::default()
        .tags(allowed_tags)
        .tag_attributes(tag_attributes)
        .generic_attributes(generic_attributes)
        .link_rel(Some("noopener noreferrer"))
        .clean(html)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_markdown() {
        assert_eq!(markdown_to_safe_html(""), "");
    }

    #[test]
    fn test_heading() {
        let result = markdown_to_safe_html("# Hello World");
        assert!(result.contains("<h1>Hello World</h1>"));
    }

    #[test]
    fn test_bold_and_italic() {
        let result = markdown_to_safe_html("This is **bold** and *italic*.");
        assert!(result.contains("<strong>bold</strong>"));
        assert!(result.contains("<em>italic</em>"));
    }

    #[test]
    fn test_links() {
        let result = markdown_to_safe_html("[Link](https://example.com)");
        assert!(result.contains(r#"href="https://example.com""#));
        assert!(result.contains(r#"rel="noopener noreferrer""#));
    }

    #[test]
    fn test_xss_prevention() {
        let result = markdown_to_safe_html("<script>alert('xss')</script>");
        assert!(!result.contains("<script>"));
        assert!(!result.contains("alert"));
    }

    #[test]
    fn test_table() {
        let markdown = "| Col1 | Col2 |\n|------|------|\n| A    | B    |";
        let result = markdown_to_safe_html(markdown);
        assert!(result.contains("<table>"));
        assert!(result.contains("<th>Col1</th>"));
        assert!(result.contains("<td>A</td>"));
    }

    #[test]
    fn test_strikethrough() {
        let result = markdown_to_safe_html("~~deleted~~");
        assert!(result.contains("<del>deleted</del>"));
    }

    #[test]
    fn test_code_block() {
        let result = markdown_to_safe_html("```rust\nlet x = 1;\n```");
        assert!(result.contains("<pre>"));
        assert!(result.contains("<code"));
    }
}
