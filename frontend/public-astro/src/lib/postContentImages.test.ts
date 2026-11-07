// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { optimizePostContentImages } from './postContentImages';

const site = new URL('https://blog.example');
const transformed = {
  src: '/_astro/image.webp',
  srcset: '/_astro/image.webp 400w',
  width: 400,
  height: 200,
};
const document = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html');

describe('sanitized body image enhancement', () => {
  it('preserves non-image markup and escaped examples; visits actual images in source order', async () => {
    const prefix =
      '<h2 id="x">Title &amp; text</h2><pre>&lt;img src="/images/code.png"&gt;</pre><!-- <img src="/images/comment.png"> -->';
    const transform = vi.fn().mockResolvedValue(transformed);
    const html = await optimizePostContentImages(
      prefix +
        '<a href="#x"><img src="/images/body.png" alt="A &amp; B"></a><p>End</p>',
      site,
      false,
      transform
    );
    expect(html.startsWith(prefix)).toBe(true);
    expect(html.endsWith('</a><p>End</p>')).toBe(true);
    expect(transform).toHaveBeenCalledExactlyOnceWith(
      'https://blog.example/images/body.png',
      undefined,
      undefined
    );
    const img = document(html).querySelector('img')!;
    expect(img.getAttribute('srcset')).toBe(transformed.srcset);
    expect(img.getAttribute('width')).toBe('400');
    expect(img.getAttribute('height')).toBe('200');
    expect(img.getAttribute('alt')).toBe('A & B');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('uses lazy images after a hero, reuses duplicate transforms and keeps authored sizing', async () => {
    const transform = vi.fn().mockResolvedValue(transformed);
    const html = await optimizePostContentImages(
      '<img src="/images/a.png" width="200" height="100"><img src="/images/a.png" width="200" height="100">',
      site,
      true,
      transform
    );
    expect(transform).toHaveBeenCalledExactlyOnceWith(
      'https://blog.example/images/a.png',
      200,
      100
    );
    for (const image of document(html).querySelectorAll('img')) {
      expect(image.getAttribute('loading')).toBe('lazy');
      expect(image.getAttribute('sizes')).toContain('auto, ');
    }
  });

  it('does not fetch external, signed, non-raster or ambiguous URLs; preserves source and dimensions', async () => {
    const transform = vi.fn();
    for (const source of [
      'https://external.invalid/a.png',
      '//blog.example/images/a.png',
      '/images/a.gif',
      '/images/a.svg',
      '/images/a.png?signature=x',
      '/other/a.png',
    ]) {
      const html = await optimizePostContentImages(
        `<img src="${source}" alt="original" width="123" height="45">`,
        site,
        true,
        transform
      );
      const image = document(html).querySelector('img')!;
      expect(image.getAttribute('src')).toBe(source);
      expect(image.getAttribute('width')).toBe('123');
      expect(image.getAttribute('height')).toBe('45');
      expect(image.hasAttribute('srcset')).toBe(false);
    }
    expect(transform).not.toHaveBeenCalled();
  });

  it('escapes all generated attribute values without creating new markup or handlers', async () => {
    const html = await optimizePostContentImages(
      '<img src="/images/a.png" alt="&quot; onerror=&quot;alert(1)&lt;script&gt;" onerror="unsafe()">',
      site,
      true,
      vi.fn().mockResolvedValue({
        ...transformed,
        src: '/_astro/a.webp?x="&y=<tag>',
        srcset: '" onload="bad()',
      })
    );
    const doc = document(html);
    expect(doc.querySelectorAll('img')).toHaveLength(1);
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('img')!.hasAttribute('onerror')).toBe(false);
    expect(doc.querySelector('img')!.hasAttribute('onload')).toBe(false);
    expect(doc.querySelector('img')!.getAttribute('srcset')).toBe(
      '" onload="bad()'
    );
    expect(doc.querySelector('img')!.getAttribute('alt')).toBe(
      '" onerror="alert(1)<script>'
    );
  });

  it('retains failed probes, skips absent sources, and handles no site or no images', async () => {
    const transform = vi.fn().mockResolvedValue(undefined);
    const input =
      '<p>Text</p><img><img src="/images/missing.png" width="0" height="bad">';
    const result = await optimizePostContentImages(
      input,
      site,
      false,
      transform
    );
    expect(result).toContain('<p>Text</p><img>');
    const img = document(result).querySelector('img[src]')!;
    expect(img.getAttribute('src')).toBe('/images/missing.png');
    expect(img.hasAttribute('width')).toBe(false);
    expect(img.hasAttribute('height')).toBe(false);
    expect(img.hasAttribute('srcset')).toBe(false);
    transform.mockClear();
    await optimizePostContentImages(input, undefined, false, transform);
    expect(transform).not.toHaveBeenCalled();
    expect(
      await optimizePostContentImages('<p>Only text</p>', site, true, transform)
    ).toBe('<p>Only text</p>');
  });

  it('loads only the first body image eagerly when there is no hero and propagates transform failures', async () => {
    const html = await optimizePostContentImages(
      '<img src="/images/a.png"><img src="/images/b.png">',
      site,
      false,
      vi.fn().mockResolvedValue(transformed)
    );
    expect(
      [...document(html).querySelectorAll('img')].map((img) =>
        img.getAttribute('loading')
      )
    ).toEqual(['eager', 'lazy']);
    await expect(
      optimizePostContentImages(
        '<img src="/images/a.png">',
        site,
        false,
        async () => {
          throw new Error('transform failed');
        }
      )
    ).rejects.toThrow('transform failed');
  });
});
