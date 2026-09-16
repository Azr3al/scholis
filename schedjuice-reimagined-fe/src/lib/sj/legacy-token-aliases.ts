// src/lib/sj/legacy-token-aliases.ts

/** Temporary shadcn → DESIGN.md mappings. Remove entries when grep count hits zero. */
export const LEGACY_TOKEN_ALIASES: Record<string, string> = {
  "text-foreground": "text-text-primary",
  "text-muted-foreground": "text-text-muted",
  "bg-background": "bg-surface",
  "bg-card": "bg-surface-elevated",
  "text-card-foreground": "text-text-primary",
  "bg-popover": "bg-surface-elevated",
  "text-popover-foreground": "text-text-primary",
  "bg-primary": "bg-accent",
  "text-primary-foreground": "text-accent-foreground",
  "bg-secondary": "bg-surface-hover",
  "text-secondary-foreground": "text-text-secondary",
  "bg-muted": "bg-surface-sunken",
  "bg-destructive": "bg-danger",
  "text-destructive": "text-danger",
};

const LEGACY_NAMES = Object.keys(LEGACY_TOKEN_ALIASES);

export const LEGACY_TOKEN_CLASS_PATTERN = new RegExp(
  `\\b(${LEGACY_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
);

export function isLegacyTokenClass(className: string): boolean {
  return className in LEGACY_TOKEN_ALIASES;
}
