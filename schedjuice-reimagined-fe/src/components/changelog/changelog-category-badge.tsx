import type { ChangelogCategory } from "@/content/changelog/types";
import { categoryLabel } from "@/lib/changelog/changelog-utils";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES: Record<ChangelogCategory, string> = {
  feature: "border-emerald-200/60 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  fix: "border-amber-200/60 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
  improvement: "border-sky-200/60 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300",
  internal: "border-zinc-200/60 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300",
};

type ChangelogCategoryBadgeProps = {
  category: ChangelogCategory;
  className?: string;
};

export function ChangelogCategoryBadge({
  category,
  className,
}: ChangelogCategoryBadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary", 
        "rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-tight",
        CATEGORY_STYLES[category],
        className,
      )}
    >
      {categoryLabel(category)}
    </span>
  );
}
