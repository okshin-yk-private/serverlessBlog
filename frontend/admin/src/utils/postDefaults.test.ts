import { describe, it, expect } from 'vitest';
import {
  slugify,
  excerptFromMarkdown,
  coverFromMarkdown,
} from './postDefaults';

describe('slugify', () => {
  it('plainなASCIIタイトルをkebab-caseに変換', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('連続したスペース・記号は単一ハイフンに正規化', () => {
    expect(slugify('Hello   World!?')).toBe('hello-world');
  });

  it('80文字制限で切り詰め', () => {
    const long = 'a-'.repeat(60); // 120 chars
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toMatch(/^[a-z0-9-]+$/);
  });

  it('空タイトルでは6文字のフォールバックトークンを返す', () => {
    const out = slugify('');
    expect(out).toMatch(/^[a-z0-9]{6}$/);
  });

  it('日本語のみのタイトルではフォールバックトークン', () => {
    const out = slugify('こんにちは世界');
    expect(out).toMatch(/^[a-z0-9]{6}$/);
  });

  it('日本語と英字の混在タイトルは英字部分を採用', () => {
    expect(slugify('Hello 世界')).toBe('hello');
  });
});

describe('excerptFromMarkdown', () => {
  it('空文字列は空のまま', () => {
    expect(excerptFromMarkdown('')).toBe('');
  });

  it('見出しと段落から本文だけを残す', () => {
    expect(excerptFromMarkdown('# Title\n\nThis is **bold** body.')).toBe(
      'Title This is bold body.'
    );
  });

  it('画像とリンクを処理する', () => {
    expect(
      excerptFromMarkdown(
        'Look at ![alt](http://x/y.png) and [click](http://z)'
      )
    ).toBe('Look at and click');
  });

  it('コードブロックは除去', () => {
    expect(excerptFromMarkdown('Hi\n\n```js\nconst a = 1;\n```\n\nbye')).toBe(
      'Hi bye'
    );
  });

  it('160文字を超えると切り詰め', () => {
    const long = 'a '.repeat(120);
    const out = excerptFromMarkdown(long);
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it('インラインコードは中身を残す', () => {
    expect(excerptFromMarkdown('use `bun` not `npm`')).toBe('use bun not npm');
  });
});

describe('coverFromMarkdown', () => {
  it('画像が無いとnull', () => {
    expect(coverFromMarkdown('plain text only')).toBeNull();
  });

  it('最初の画像URLを抽出', () => {
    expect(coverFromMarkdown('a ![cap](https://cdn/x.jpg) b')).toBe(
      'https://cdn/x.jpg'
    );
  });

  it('複数あっても最初のURLだけ返す', () => {
    const md = '![](a.jpg)\n\n![](b.jpg)';
    expect(coverFromMarkdown(md)).toBe('a.jpg');
  });

  it('空文字列はnull', () => {
    expect(coverFromMarkdown('')).toBeNull();
  });
});
