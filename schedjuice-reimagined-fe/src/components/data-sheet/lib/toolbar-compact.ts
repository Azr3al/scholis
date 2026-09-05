/** True when labeled toolbar content would overflow its container. */
export function shouldCompactToolbar(
  containerWidth: number,
  contentWidth: number,
): boolean {
  if (containerWidth <= 0 || contentWidth <= 0) return false;
  return contentWidth > containerWidth;
}
