import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Convert markdown to HTML
 * @param markdown - Markdown string to convert
 * @returns HTML string
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) {
    return '';
  }

  const html = marked(markdown);
  return html as string;
}

/**
 * Sanitize HTML to prevent XSS attacks
 * @param html - HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  if (!html) {
    return '';
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'span',
      'div',
      'strong',
      'em',
      'u',
      's',
      'del',
      'a',
      'img',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code',
      'pre',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
  });
}

/**
 * Convert markdown to sanitized HTML
 * @param markdown - Markdown string to convert
 * @returns Sanitized HTML string
 */
export function markdownToSafeHtml(markdown: string): string {
  const html = markdownToHtml(markdown);
  return sanitizeHtml(html);
}
