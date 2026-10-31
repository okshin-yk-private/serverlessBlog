import { expect, test } from 'vitest';
import { publicationObservation } from './publicationObservation.mjs';

test('missing or hostile metadata does not leak or claim a publish duration', () => {
  const event = publicationObservation({
    confirmed: false,
    releaseRevision: 'https://user:SECRET@host',
    buildId: 'Authorization: SECRET',
    contentRevision: '9007199254740992',
    startedAt: 1000,
    now: 1100,
    attempts: 1,
  });
  expect(event).toEqual({
    event: 'site-public-unconfirmed',
    observedAtMs: 1100,
    publicCheckMs: 100,
    attempts: 1,
  });
  expect(JSON.stringify(event)).not.toContain('SECRET');
});

test('manual publication may confirm the manifest without fabricating save/build correlation', () => {
  const event = publicationObservation({
    confirmed: true,
    releaseRevision: 'r20-manual',
    startedAt: 1000,
    now: 1200,
    attempts: 1,
  });
  expect(event.confirmedAtMs).toBe(1200);
  expect(event).not.toHaveProperty('contentRevision');
  expect(event).not.toHaveProperty('buildId');
  expect(event).not.toHaveProperty('requestedAtMs');
});
