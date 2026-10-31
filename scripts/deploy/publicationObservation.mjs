// Explicit allowlist: never serialize process.env, URLs, headers or response bodies.
export function publicationObservation({
  confirmed,
  releaseRevision,
  buildId,
  contentRevision,
  startedAt,
  now,
  attempts,
}) {
  const event = {
    event: confirmed ? 'site-public-confirmed' : 'site-public-unconfirmed',
    observedAtMs: now,
    publicCheckMs: Math.max(0, now - startedAt),
    attempts,
  };
  if (confirmed) event.confirmedAtMs = now;
  if (/^r\d+(?:-[a-z0-9][a-z0-9._-]*)?$/.test(releaseRevision ?? '')) {
    event.releaseRevision = releaseRevision;
  }
  if (
    /^[A-Za-z0-9][A-Za-z0-9_-]{1,254}:[a-fA-F0-9-]{36}$/.test(buildId ?? '')
  ) {
    event.buildId = buildId;
  }
  const revision = Number(contentRevision);
  if (
    /^[1-9]\d*$/.test(contentRevision ?? '') &&
    Number.isSafeInteger(revision)
  ) {
    event.contentRevision = revision;
  }
  return event;
}
