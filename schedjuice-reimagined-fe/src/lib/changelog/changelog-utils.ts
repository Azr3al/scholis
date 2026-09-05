import { isStudent } from "@/helpers/authorization";
import type { accountType } from "@/types/user";
import type {
  ChangelogCategory,
  ChangelogEntry,
  ChangelogSummarizedCommits,
} from "@/content/changelog/types";

const CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  feature: "New",
  fix: "Fixed",
  improvement: "Improved",
  internal: "For staff",
};

export function categoryLabel(category: ChangelogCategory): string {
  return CATEGORY_LABELS[category];
}

/** Students only see `everyone` entries; all other roles see the full feed. */
export function filterChangelogForUser(
  entries: ChangelogEntry[],
  user: accountType | null | undefined,
): ChangelogEntry[] {
  if (!user) return [];
  if (isStudent(user)) {
    return entries.filter((entry) => entry.audience === "everyone");
  }
  return entries;
}

export const CHANGELOG_PAGE_SIZE = 10;

function getChangelogEntriesSorted(
  entries: ChangelogEntry[],
): ChangelogEntry[] {
  return [...entries].sort((a, b) => {
    const dateCompare = b.publishedAt.localeCompare(a.publishedAt);
    if (dateCompare !== 0) return dateCompare;
    return b.source.generatedAt.localeCompare(a.source.generatedAt);
  });
}

export function paginateChangelogEntries(
  entries: ChangelogEntry[],
  page: number,
  pageSize = CHANGELOG_PAGE_SIZE,
): {
  page: number;
  pageSize: number;
  totalCount: number;
  entries: ChangelogEntry[];
} {
  const sorted = getChangelogEntriesSorted(entries);
  const totalCount = sorted.length;
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    page: safePage,
    pageSize: safePageSize,
    totalCount,
    entries: sorted.slice(start, start + safePageSize),
  };
}

export function groupChangelogByMonth(
  entries: ChangelogEntry[],
): { monthKey: string; monthLabel: string; entries: ChangelogEntry[] }[] {
  const sorted = getChangelogEntriesSorted(entries);
  const groups = new Map<string, ChangelogEntry[]>();

  for (const entry of sorted) {
    const monthKey = entry.publishedAt.slice(0, 7);
    const existing = groups.get(monthKey) ?? [];
    existing.push(entry);
    groups.set(monthKey, existing);
  }

  return Array.from(groups.entries()).map(([monthKey, monthEntries]) => ({
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    entries: monthEntries,
  }));
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function slugifyChangelogTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function buildChangelogScreenshotDir(
  publishedAt: string,
  id: string,
): string {
  return `/changelog/${publishedAt}-${id.split("-").slice(3).join("-") || id}`;
}

const INCREMENTAL_SOURCE_RANGE_PATTERN =
  /after\s+last\s+summarized|since\s+last\s+(changelog|summarized)|unsummarized|not\s+yet\s+summarized/i;

export function isIncrementalSourceRange(sourceRange: string): boolean {
  return INCREMENTAL_SOURCE_RANGE_PATTERN.test(sourceRange);
}

/**
 * Highest summarized commit tip per repo across all entries.
 * Picks tips from the newest-generated entry first (entries are prepended on each run).
 * The `/summarize-changelog` command should confirm tips with git when multiple entries
 * exist: `git rev-list -1 tip1 tip2` per repo.
 */
export function getLastSummarizedCommits(
  entries: ChangelogEntry[],
): ChangelogSummarizedCommits {
  const sorted = [...entries].sort((a, b) =>
    b.source.generatedAt.localeCompare(a.source.generatedAt),
  );

  let fe: string | undefined;
  let be: string | undefined;

  for (const entry of sorted) {
    const sc = entry.source.summarizedCommits;
    const refs = entry.source.commitRefs;
    if (!fe) fe = sc?.fe ?? refs?.[0];
    if (!be) be = sc?.be ?? refs?.[1];
    if (fe && be) break;
  }

  return { fe, be };
}
