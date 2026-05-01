import { describe, it, expect } from 'vitest';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from './imageValidation';

const makeFile = (size: number, type: string, name = 'test.bin'): File => {
  const buf = new Uint8Array(size);
  return new File([buf], name, { type });
};

describe('validateImageFile', () => {
  it.each(ALLOWED_IMAGE_MIME_TYPES)('accepts %s', (type) => {
    const result = validateImageFile(makeFile(1024, type));
    expect(result.ok).toBe(true);
  });

  it('accepts a file at exactly 5MB', () => {
    const result = validateImageFile(makeFile(MAX_IMAGE_BYTES, 'image/png'));
    expect(result.ok).toBe(true);
  });

  it('rejects a file that exceeds 5MB by 1 byte', () => {
    const result = validateImageFile(
      makeFile(MAX_IMAGE_BYTES + 1, 'image/png')
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/5MB/);
  });

  it('rejects image/svg+xml as not whitelisted', () => {
    const result = validateImageFile(makeFile(100, 'image/svg+xml'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/対応していない/);
  });

  it('rejects non-image MIME types', () => {
    const result = validateImageFile(makeFile(100, 'application/pdf'));
    expect(result.ok).toBe(false);
  });

  it('rejects empty MIME type', () => {
    const result = validateImageFile(makeFile(100, ''));
    expect(result.ok).toBe(false);
  });
});
