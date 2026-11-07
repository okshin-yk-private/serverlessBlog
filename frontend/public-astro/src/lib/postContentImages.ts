import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { resolvePostImageSource } from './postImage';

export interface ContentImage {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];

function escapeAttribute(value: string): string {
  return value.replace(
    /[&"<>']/g,
    (char) =>
      ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;' })[
        char
      ]!
  );
}

function dimension(value: string | undefined): number | undefined {
  return value &&
    /^\d+$/.test(value) &&
    Number(value) > 0 &&
    Number.isSafeInteger(Number(value))
    ? Number(value)
    : undefined;
}

/**
 * Build-only enhancement of HTML already sanitized by the Go handlers.
 * This is NOT a sanitizer: non-image markup is preserved byte for byte.
 * Only real HTML img start tags are replaced; code examples/comments stay intact.
 */
export async function optimizePostContentImages(
  html: string,
  site: URL | undefined,
  hasHero: boolean,
  transform: (
    source: string,
    width?: number,
    height?: number
  ) => Promise<ContentImage | undefined>
): Promise<string> {
  const images: Element[] = [];
  function visit(node: Node) {
    if (
      'tagName' in node &&
      node.tagName === 'img' &&
      node.namespaceURI === 'http://www.w3.org/1999/xhtml'
    )
      images.push(node);
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }
  visit(parseFragment(html, { sourceCodeLocationInfo: true }));
  const cache = new Map<string, Promise<ContentImage | undefined>>();
  const replacements: { start: number; end: number; value: string }[] = [];
  // Sequential registration bounds network pressure for image-heavy articles.
  for (const [index, image] of images.entries()) {
    const location = image.sourceCodeLocation?.startTag;
    if (!location) continue;
    const attrs = Object.fromEntries(
      image.attrs.map(({ name, value }) => [name, value])
    );
    if (!attrs.src) continue;
    const source = resolvePostImageSource(attrs.src, site);
    const width = dimension(attrs.width);
    const height = dimension(attrs.height);
    let optimized: ContentImage | undefined;
    if (source) {
      const key = JSON.stringify([source, width, height]);
      if (!cache.has(key)) cache.set(key, transform(source, width, height));
      optimized = await cache.get(key);
    }
    const eager = !hasHero && index === 0;
    const output: Record<string, string | number> = {
      src: optimized?.src ?? attrs.src,
      alt: attrs.alt ?? '',
      ...(width || optimized ? { width: optimized?.width ?? width! } : {}),
      ...(height || optimized ? { height: optimized?.height ?? height! } : {}),
      loading: eager ? 'eager' : 'lazy',
      decoding: 'async',
      ...(optimized
        ? {
            srcset: optimized.srcset,
            sizes: `${eager ? '' : 'auto, '}(max-width: 768px) calc(100vw - 40px), (max-width: 880px) calc(100vw - 80px), ${Math.min(800, optimized.width)}px`,
          }
        : {}),
    };
    replacements.push({
      start: location.startOffset,
      end: location.endOffset,
      value:
        '<img ' +
        Object.entries(output)
          .map(([name, value]) => `${name}="${escapeAttribute(String(value))}"`)
          .join(' ') +
        '>',
    });
  }
  for (const { start, end, value } of replacements.reverse())
    html = html.slice(0, start) + value + html.slice(end);
  return html;
}
