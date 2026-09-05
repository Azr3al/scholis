# Route-local UI shims (`courses/ui`)

Temporary lifts of primitives and `_chrome` widgets used by R9-owned routes while shared primitive consolidation is in progress elsewhere. Prefer importing from `@/components/primitives` or `@/components/date` when those modules already expose the same API; keep local copies only where the route cohort needs semantic token updates ahead of the shared merge.

Do not treat these files as the long-term home for calendar, tabs, or table primitives.
