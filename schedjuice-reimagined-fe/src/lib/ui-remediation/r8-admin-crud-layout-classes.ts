export function adminCrudDetailSectionClassName(): string {
  return "flex flex-col gap-6";
}

export function adminCrudSurfaceClassName(): string {
  return "rounded-lg border border-border bg-surface shadow-sm";
}

export function adminCrudSurfaceHeaderClassName(): string {
  return "space-y-1.5 border-b border-border p-6";
}

export function adminCrudSurfaceBodyClassName(): string {
  return "p-6";
}

export function adminCrudStatusBadgeClassName(
  variant: "default" | "outline" | "destructive" | "secondary" = "default",
): string {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold";
  switch (variant) {
    case "outline":
      return `${base} border-border text-text-primary`;
    case "destructive":
      return `${base} border-transparent bg-danger/15 text-danger`;
    case "secondary":
      return `${base} border-transparent bg-surface-hover text-text-primary`;
    default:
      return `${base} border-transparent bg-surface-hover text-text-primary`;
  }
}
