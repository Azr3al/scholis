export function dashboardSectionStackClassName(
  density: "comfortable" | "compact" = "comfortable",
): string {
  return density === "compact" ? "flex flex-col gap-4" : "flex flex-col gap-6";
}

export function dashboardMetricGridClassName(columnCount: 2 | 3 | 4): string {
  const cols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
  } as const;
  return `grid min-w-0 gap-4 ${cols[columnCount]}`;
}

export function dashboardFilterToolbarClassName(): string {
  return "flex min-w-0 flex-wrap items-end gap-3";
}
