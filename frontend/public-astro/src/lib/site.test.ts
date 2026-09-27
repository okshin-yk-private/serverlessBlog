import { describe, expect, it } from 'vitest';
import { SITE_NAME } from './site';

describe('site', () => {
  it('exports the site name used across Layout/SEO/JSON-LD', () => {
    expect(SITE_NAME).toBe('bone of my fallacy');
  });
});
