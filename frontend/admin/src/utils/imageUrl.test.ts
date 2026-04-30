import { describe, it, expect } from 'vitest';
import {
  isAllowedImageUrl,
  sanitizeImageUrl,
  hasImageExtension,
} from './imageUrl';

describe('isAllowedImageUrl', () => {
  describe('許可されるURL', () => {
    it('相対URLを許可する', () => {
      expect(isAllowedImageUrl('/images/photo.jpg')).toBe(true);
      expect(isAllowedImageUrl('/uploads/2024/image.png')).toBe(true);
    });

    it('CloudFront URLを許可する', () => {
      expect(
        isAllowedImageUrl('https://d1234567890.cloudfront.net/images/photo.jpg')
      ).toBe(true);
      expect(
        isAllowedImageUrl('https://abc-xyz.cloudfront.net/path/to/image.png')
      ).toBe(true);
    });

    it('S3 URL（path-style）を許可する', () => {
      expect(
        isAllowedImageUrl(
          'https://s3.us-east-1.amazonaws.com/my-bucket/image.jpg'
        )
      ).toBe(true);
      expect(
        isAllowedImageUrl(
          'https://s3.ap-northeast-1.amazonaws.com/bucket-name/path/image.png'
        )
      ).toBe(true);
    });

    it('S3 URL（virtual-hosted style）を許可する', () => {
      expect(
        isAllowedImageUrl(
          'https://my-bucket.s3.us-east-1.amazonaws.com/image.jpg'
        )
      ).toBe(true);
      expect(
        isAllowedImageUrl(
          'https://bucket-name.s3.ap-northeast-1.amazonaws.com/path/image.png'
        )
      ).toBe(true);
    });

    it('S3 URL（legacy style）を許可する', () => {
      expect(
        isAllowedImageUrl('https://my-bucket.s3.amazonaws.com/image.jpg')
      ).toBe(true);
    });

    it('環境変数で設定されたCloudFront URLを許可する', () => {
      const customCloudFront = 'https://custom.example.com';
      expect(
        isAllowedImageUrl(
          'https://custom.example.com/images/photo.jpg',
          customCloudFront
        )
      ).toBe(true);
    });
  });

  describe('拒否されるURL', () => {
    it('javascript: URLを拒否する', () => {
      expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
      expect(isAllowedImageUrl('JAVASCRIPT:alert(1)')).toBe(false);
    });

    it('data: URLを拒否する', () => {
      expect(isAllowedImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(
        false
      );
      expect(
        isAllowedImageUrl('DATA:text/html,<script>alert(1)</script>')
      ).toBe(false);
    });

    it('vbscript: URLを拒否する', () => {
      expect(isAllowedImageUrl('vbscript:msgbox(1)')).toBe(false);
    });

    it('file: URLを拒否する', () => {
      expect(isAllowedImageUrl('file:///etc/passwd')).toBe(false);
    });

    it('HTTP URLを拒否する', () => {
      expect(isAllowedImageUrl('http://example.com/image.jpg')).toBe(false);
      expect(isAllowedImageUrl('http://d123.cloudfront.net/image.jpg')).toBe(
        false
      );
    });

    it('プロトコル相対URLを拒否する', () => {
      expect(isAllowedImageUrl('//evil.com/image.jpg')).toBe(false);
    });

    it('許可されていない外部ドメインを拒否する', () => {
      expect(isAllowedImageUrl('https://evil.com/image.jpg')).toBe(false);
      expect(isAllowedImageUrl('https://attacker.com/tracking.gif')).toBe(
        false
      );
    });

    it('空のURLを拒否する', () => {
      expect(isAllowedImageUrl('')).toBe(false);
    });

    it('nullやundefinedを拒否する', () => {
      expect(isAllowedImageUrl(null as unknown as string)).toBe(false);
      expect(isAllowedImageUrl(undefined as unknown as string)).toBe(false);
    });
  });
});

describe('sanitizeImageUrl', () => {
  it('許可されたURLはそのまま返す', () => {
    expect(sanitizeImageUrl('/images/photo.jpg')).toBe('/images/photo.jpg');
    expect(sanitizeImageUrl('https://d123.cloudfront.net/image.jpg')).toBe(
      'https://d123.cloudfront.net/image.jpg'
    );
  });

  it('許可されていないURLはnullを返す', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeImageUrl('https://evil.com/image.jpg')).toBeNull();
    expect(sanitizeImageUrl('')).toBeNull();
  });
});

describe('hasImageExtension', () => {
  it('画像拡張子を持つURLはtrueを返す', () => {
    expect(hasImageExtension('/images/photo.jpg')).toBe(true);
    expect(hasImageExtension('/images/photo.jpeg')).toBe(true);
    expect(hasImageExtension('/images/photo.png')).toBe(true);
    expect(hasImageExtension('/images/photo.gif')).toBe(true);
    expect(hasImageExtension('/images/photo.webp')).toBe(true);
    expect(hasImageExtension('/images/photo.svg')).toBe(true);
    expect(hasImageExtension('/images/photo.avif')).toBe(true);
  });

  it('画像拡張子を持たないURLはfalseを返す', () => {
    expect(hasImageExtension('/images/document.pdf')).toBe(false);
    expect(hasImageExtension('/images/script.js')).toBe(false);
    expect(hasImageExtension('/images/page.html')).toBe(false);
  });

  it('大文字小文字を区別しない', () => {
    expect(hasImageExtension('/images/photo.JPG')).toBe(true);
    expect(hasImageExtension('/images/photo.PNG')).toBe(true);
  });

  it('空のURLはfalseを返す', () => {
    expect(hasImageExtension('')).toBe(false);
  });
});
