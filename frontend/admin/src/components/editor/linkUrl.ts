/** Accept web links and explicit relative references without rewriting query strings. */
export function isValidLinkUrl(value: string): boolean {
  if (!value || /[\s\\]/u.test(value)) return false;
  if (
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    )
  )
    return false;
  if (/^https?:\/\/[^/?#]/i.test(value)) {
    try {
      const url = new URL(value);
      return !!url.hostname && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  return /^(?:\/(?!\/)|\.\.?\/|#)/.test(value);
}
