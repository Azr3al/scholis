/**
 * Sticky chrome for entity title + body pages (docs/design/ui-contracts/entity-title-chrome.md).
 *
 * Full-bleeds across the default PageContainer horizontal inset (`px-4` /
 * `sm:px-6` / `lg:px-8`) so the frosted bar does not sit as an inset rectangle
 * with a visible vertical edge. Title / Back / actions keep their own padding
 * via the matching positive `px-*` on the same element.
 */
export function entityTitleStickyChromeClassName(): string {
  return [
    "sticky top-0 z-10",
    "-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
    "space-y-4 border-b border-border/40 py-5",
    "bg-surface-elevated/95 backdrop-blur-sm",
    "supports-[backdrop-filter]:bg-surface-elevated/85",
  ].join(" ");
}

/** Align Back with a compact page H1 in the entity title row. */
export function entityTitleBackAlignClassName(): string {
  return "shrink-0 self-center";
}

/** Slimmer sticky chrome when page title/actions live in panel breadcrumb. */
export function markSheetNewStickyChromeClassName(): string {
  return [
    entityTitleStickyChromeClassName(),
    "!space-y-3 !py-3",
  ].join(" ");
}
