/**
 * Serialize data for an inline `<script type="application/json">` or
 * `application/ld+json` element rendered with `set:html`.
 *
 * JSON.stringify leaves `<` as is, so a value containing `</script>` would end
 * the element and the rest would be parsed as HTML (Issue #695). `<` is the
 * same character to JSON.parse, so the data round-trips unchanged.
 */
export function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
