import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { serializeJsonForHtml } from './serializeJsonForHtml';

describe('serializeJsonForHtml', () => {
  it('escapes "<" so data cannot close the script element', () => {
    const value = { title: '</script><img src=x onerror=alert(1)>' };
    const serialized = serializeJsonForHtml(value);
    expect(serialized).not.toContain('<');
    expect(serialized).not.toMatch(/<\/script/i);
    expect(JSON.parse(serialized)).toEqual(value);
  });

  it('also neutralizes HTML comment openers', () => {
    expect(serializeJsonForHtml(['<!--'])).toBe('["\\u003c!--"]');
  });

  it('matches the inline escaping it replaces', () => {
    const value = { a: '<b>', n: 1, list: ['x', null] };
    expect(serializeJsonForHtml(value)).toBe(
      JSON.stringify(value).replace(/</g, '\\u003c')
    );
  });
});

// Issue #695: every set:html in the public site bypasses Astro's escaping, so
// each one must be a known-safe source. A new set:html fails here until it is
// reviewed and listed below with the reason it is safe.
const allowed: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^serializeJsonForHtml\(/,
    reason: 'JSON for an inline script element, "<" escaped',
  },
  {
    pattern: /^post\.contentHtml$/,
    reason:
      'sanitized by the Go handlers before storage (go-functions/internal/sanitizer)',
  },
  {
    pattern: /^paragraph\.replace\(\/\\n\/g, '<br \/>'\)$/,
    reason: 'static About copy authored in this repository',
  },
];

function astroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return astroFiles(path);
    return path.endsWith('.astro') ? [path] : [];
  });
}

// Returns the expression inside each set:html={...}, balancing braces.
function setHtmlExpressions(source: string): string[] {
  const expressions: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf('set:html={', from);
    if (start === -1) return expressions;
    let depth = 1;
    let i = start + 'set:html={'.length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '{') depth++;
      if (source[i] === '}') depth--;
    }
    expressions.push(source.slice(start + 'set:html={'.length, i - 1).trim());
    from = i;
  }
}

describe('set:html guard', () => {
  it('only uses reviewed sources', () => {
    const root = resolve(__dirname, '..');
    const unreviewed: string[] = [];
    for (const file of astroFiles(root)) {
      for (const expression of setHtmlExpressions(readFileSync(file, 'utf8'))) {
        if (!allowed.some(({ pattern }) => pattern.test(expression))) {
          unreviewed.push(`${relative(root, file)}: set:html={${expression}}`);
        }
      }
    }
    expect(unreviewed).toEqual([]);
  });

  it('extracts expressions with nested braces', () => {
    expect(
      setHtmlExpressions('<p set:html={f({ a: 1 })} /><i set:html={x} />')
    ).toEqual(['f({ a: 1 })', 'x']);
  });
});
