/** Only fetch uploaded raster images from the configured public site at build time. */
export function resolvePostImageSource(
  source: string,
  site: URL | undefined
): string | undefined {
  if (!site || !/^https?:$/.test(site.protocol)) return undefined;
  // A relative upload path is supported; ambiguous/protocol-relative URLs are not.
  if (!source.startsWith('/images/') && !/^https?:\/\//.test(source)) {
    return undefined;
  }
  try {
    const url = new URL(source, site);
    if (
      url.origin !== site.origin ||
      url.username ||
      url.password ||
      url.search ||
      !/^\/images\/.+\.(?:jpe?g|png|webp)$/i.test(url.pathname)
    ) {
      return undefined;
    }
    url.hash = '';
    return url.href;
  } catch {
    return undefined;
  }
}

/** Cap both the number of variants and their resolution; never upscale. */
export function postImageWidths(width: number, hero: boolean): number[] {
  const candidates = hero ? [400, 800, 1200, 1600] : [240, 400, 800];
  const max = Math.min(width, candidates[candidates.length - 1]);
  return [...candidates.filter((candidate) => candidate < max), max];
}
