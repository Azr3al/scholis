export type ChangelogCategory = "feature" | "fix" | "improvement" | "internal";

/** Who should see this entry in the changelog feed */
export type ChangelogAudience = "everyone" | "staff";

export type ChangelogScreenshotStatus = "captured" | "needs_capture" | "skipped";

export type ChangelogScreenshot = {
  /** Public asset path, e.g. `/changelog/2026-06-16-submission-tracker/overview.png` */
  src: string;
  alt: string;
  caption?: string;
};

export type ChangelogAffectedArea = {
  label: string;
  href: string;
};

/** Per-repo git tips included in or used as bounds for a changelog entry */
export type ChangelogSummarizedCommits = {
  /** Newest schedjuice-reimagined-fe commit covered (short or full hash) */
  fe?: string;
  /** Newest schedjuice-reimagined-be commit covered (short or full hash) */
  be?: string;
};

export type ChangelogSourceMetadata = {
  /** Natural-language range used when generating, e.g. "today" or "after last summarized commit" */
  sourceRange: string;
  /** ISO timestamp when the entry was generated */
  generatedAt: string;
  /** Newest commit tip included per repo — drives incremental "since last summarized" runs */
  summarizedCommits?: ChangelogSummarizedCommits;
  /** Commit tips the range started after (populated for incremental source ranges) */
  sinceCommits?: ChangelogSummarizedCommits;
  /** All commit short hashes included (display/debug) */
  commitRefs?: string[];
  /** Whether agent transcripts were found for the range */
  transcriptsFound: boolean;
  /** Notes when git or transcript lookup was sparse */
  notes?: string;
};

export type ChangelogEntry = {
  /** Stable slug used for anchors and screenshot folders */
  id: string;
  /**
   * `everyone` — visible to students, teachers, and school staff.
   * `staff` — school founders, admins, managers, teachers, finance, HR only.
   */
  audience: ChangelogAudience;
  /** Display title */
  title: string;
  /** ISO date (YYYY-MM-DD) for grouping and sorting */
  publishedAt: string;
  /** Short one-line summary shown in the feed header */
  summary: string;
  /** Detailed bullet points for the entry body */
  bullets: string[];
  categories: ChangelogCategory[];
  affectedAreas: ChangelogAffectedArea[];
  screenshots: ChangelogScreenshot[];
  screenshotStatus: ChangelogScreenshotStatus;
  source: ChangelogSourceMetadata;
};
