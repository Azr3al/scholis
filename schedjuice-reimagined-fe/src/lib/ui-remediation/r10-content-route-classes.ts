export function contentRouteBodyClassName(
  variant: "editorial" | "tool" | "take-flow",
): string {
  if (variant === "take-flow") {
    return "mx-auto w-full max-w-3xl px-4 py-6";
  }
  if (variant === "tool") {
    return "flex min-w-0 flex-col gap-6";
  }
  return "flex min-w-0 flex-col gap-8";
}

export function contentListToolbarClassName(): string {
  return "flex min-w-0 flex-wrap items-center justify-between gap-3";
}
