export type PageWidth = "narrow" | "default" | "wide" | "full";

const PAGE_WIDTHS: Record<PageWidth, string> = {
  narrow: "max-w-[768px]",
  default: "max-w-[1024px]",
  wide: "max-w-[1280px]",
  full: "",
};

export const DEFAULT_PAGE_WIDTH: PageWidth = "default";

export function resolvePageWidthClass(
  width: PageWidth,
  isFullscreen: boolean,
): string {
  if (isFullscreen) return PAGE_WIDTHS.full;
  return PAGE_WIDTHS[width];
}
