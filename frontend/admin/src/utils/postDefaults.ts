// PR6: defaults derived from a draft's title / contentMarkdown so the editor
// can pre-fill metadata sidebar fields (slug / excerpt / cover) without the
// writer having to do it manually.
//
// These helpers run client-side only. The server (`internal/domain.GenerateSlug`)
// is the canonical normalizer, but this TS slugify is good enough for live UI
// preview: it ASCII-folds, lowercases, kebab-cases, and falls back to a short
// random token when the title is non-Latin (Japanese, etc.).

const SLUG_MAX_LENGTH = 80;
const EXCERPT_MAX_LENGTH = 160;
const FALLBACK_TOKEN_LENGTH = 6;

const NON_SLUG_CHAR = /[^a-z0-9-]+/g;
const MULTI_HYPHEN = /-+/g;
const TRIM_HYPHEN = /^-+|-+$/g;

const MARKDOWN_HEADING = /^#{1,6}\s+/gm;
const MARKDOWN_FENCED_CODE = /```[\s\S]*?```/g;
const MARKDOWN_INLINE_CODE = /`([^`]+)`/g;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]+\)/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_BOLD_ITALIC = /(\*\*|__|\*|_)/g;
const MARKDOWN_BLOCKQUOTE = /^>\s?/gm;
const MARKDOWN_LIST_MARKER = /^\s*[-*+]\s+/gm;
const MARKDOWN_HORIZONTAL_RULE = /^\s*-{3,}\s*$/gm;
const COLLAPSE_WHITESPACE = /\s+/g;

const FIRST_IMAGE = /!\[[^\]]*\]\(([^)\s]+)/;

/**
 * Generate a small random token to use when the title produces no usable
 * ASCII characters. Uses crypto.randomUUID when available; otherwise falls
 * back to Math.random (e.g. http dev server, jsdom).
 */
const randomToken = (): string => {
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, FALLBACK_TOKEN_LENGTH);
  }
  return Math.random()
    .toString(36)
    .slice(2, 2 + FALLBACK_TOKEN_LENGTH);
};

/**
 * Convert a title to a kebab-case slug suitable as a URL path segment.
 * Non-Latin titles fold to nothing → return a 6-char random token so the
 * writer always has *some* default they can edit or regenerate.
 */
export const slugify = (title: string): string => {
  if (!title) return randomToken();
  const folded = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(NON_SLUG_CHAR, '-')
    .replace(MULTI_HYPHEN, '-')
    .replace(TRIM_HYPHEN, '');
  if (!folded) return randomToken();
  return folded.length > SLUG_MAX_LENGTH
    ? folded.slice(0, SLUG_MAX_LENGTH).replace(TRIM_HYPHEN, '')
    : folded;
};

/**
 * Strip Markdown markup and return the leading 160 chars of plain text.
 * Used to pre-fill the excerpt sidebar field. Empty input returns ''.
 */
export const excerptFromMarkdown = (md: string): string => {
  if (!md) return '';
  const stripped = md
    .replace(MARKDOWN_FENCED_CODE, '')
    .replace(MARKDOWN_HORIZONTAL_RULE, '')
    .replace(MARKDOWN_HEADING, '')
    .replace(MARKDOWN_BLOCKQUOTE, '')
    .replace(MARKDOWN_LIST_MARKER, '')
    .replace(MARKDOWN_IMAGE, '')
    .replace(MARKDOWN_LINK, '$1')
    .replace(MARKDOWN_INLINE_CODE, '$1')
    .replace(MARKDOWN_BOLD_ITALIC, '')
    .replace(COLLAPSE_WHITESPACE, ' ')
    .trim();
  return stripped.length > EXCERPT_MAX_LENGTH
    ? stripped.slice(0, EXCERPT_MAX_LENGTH).trimEnd()
    : stripped;
};

/**
 * Extract the URL of the first inline image in markdown, or null if absent.
 * Used to pre-fill the cover image sidebar field.
 */
export const coverFromMarkdown = (md: string): string | null => {
  if (!md) return null;
  const m = FIRST_IMAGE.exec(md);
  return m && m[1] ? m[1] : null;
};
