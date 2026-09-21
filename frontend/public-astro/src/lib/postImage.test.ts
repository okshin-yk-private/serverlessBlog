import { describe, expect, it } from 'vitest';
import { postImageWidths, resolvePostImageSource } from './postImage';

const site = new URL('https://blog.example.com');

describe('build-time article image sources', () => {
  it('resolves local upload paths and exact same-origin URLs', () => {
    expect(resolvePostImageSource('/images/author/photo.png', site)).toBe(
      'https://blog.example.com/images/author/photo.png'
    );
    expect(
      resolvePostImageSource(
        'https://blog.example.com/images/photo.JPG#preview',
        site
      )
    ).toBe('https://blog.example.com/images/photo.JPG');
    expect(
      resolvePostImageSource(
        'http://127.0.0.1:4567/images/photo.webp',
        new URL('http://127.0.0.1:4567')
      )
    ).toBe('http://127.0.0.1:4567/images/photo.webp');
  });

  it.each([
    'https://other.example.com/images/photo.png',
    'https://blog.example.com.evil.example/images/photo.png',
    'http://blog.example.com/images/photo.png',
    'https://blog.example.com:8443/images/photo.png',
    'https://user:password@blog.example.com/images/photo.png',
    'https://blog.example.com/images/photo.png?signature=secret',
    '//blog.example.com/images/photo.png',
    'https://',
    '/images/../private/photo.png',
    '/images/animation.gif',
    '/images/vector.svg',
    '/images/photo.avif',
    '/logo.png',
    'images/photo.png',
    'data:image/png;base64,abc',
  ])('does not fetch unsupported or untrusted source %s', (source) => {
    expect(resolvePostImageSource(source, site)).toBeUndefined();
  });

  it('requires an HTTP(S) site URL', () => {
    expect(
      resolvePostImageSource('/images/photo.png', undefined)
    ).toBeUndefined();
    expect(
      resolvePostImageSource('/images/photo.png', new URL('file:///site'))
    ).toBeUndefined();
  });
});

describe('responsive candidate widths', () => {
  it('caps a large hero at 1600 and a gallery at 800 pixels', () => {
    expect(postImageWidths(4000, true)).toEqual([400, 800, 1200, 1600]);
    expect(postImageWidths(4000, false)).toEqual([240, 400, 800]);
  });

  it('keeps the source width without duplicating or enlarging candidates', () => {
    expect(postImageWidths(1000, true)).toEqual([400, 800, 1000]);
    expect(postImageWidths(800, true)).toEqual([400, 800]);
    expect(postImageWidths(240, false)).toEqual([240]);
    expect(postImageWidths(80, true)).toEqual([80]);
  });
});
