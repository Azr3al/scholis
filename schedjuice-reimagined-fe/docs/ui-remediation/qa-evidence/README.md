# R15 QA Evidence Store

Each route variant verified by an independent QA subagent writes evidence JSON here.
QA agents do not patch product code.

Directory layout:
`{cohort-id}-{variant-id}/{route-slug}/{variant-id}/evidence.json`

Required fields: see R15 plan Evidence format section.

## Cohort directories

| Cohort | Directory prefix | Selector |
| --- | --- | --- |
| R15-QA1 | `r15-qa1-default/` | `routeFamily === "global-shell-auth-public"` |
| R15-QA2 | `r15-qa2-default/` | `routeFamily === "home-dashboard-analytics"` |
| R15-QA3 | `r15-qa3-default/` | `routeFamily === "administration-crud"` |
| R15-QA4 | `r15-qa4-default/` | `routeFamily === "courses-attendance-scheduling"` |
| R15-QA5 | `r15-qa5-default/` | `routeFamily === "quizzes-docs-content-services"` |
| R15-QA6 | `r15-qa6-default/` | `routeFamily === "finance-operations"` |
| R15-QA7 | `r15-qa7-shared-shell/` | variant `shared-shell` on student-payment routes |
| R15-QA8 | `r15-qa8-resource-table/` | variant `resource-table` on student-payment routes |
| R15-QA9 | `r15-qa9-glide/` | variant `glide` on student-payment and recent-transactions routes |
| R15-QA10 | `r15-qa10-default/` | `routeFamily === "payment-upload-verification"` |

Routes without evidence files remain `qaStatus: pending`. Dynamic routes without fixture overrides are `blocked` with an explicit reason until `route-fixtures.json` is updated.

## Workflow

1. **Generate** — `npm run generate:route-manifest` scans `src/app` and writes `docs/ui-remediation/route-manifest.json`. Regeneration **preserves** existing `qaStatus`, `defectRefs`, and evidence-derived `blockerReason` for entries matched by `routePattern` and variant `id` (pass/fail survive regen; fixture-only blockers clear when a fixture is added).
2. **QA evidence** — QA subagents write `evidence.json` under the cohort directories listed above.
3. **Sync** — `npm run sync:route-qa-status` (or `npx tsx scripts/ui-remediation/sync-route-qa-status.ts`) reads evidence files and updates manifest statuses. Run sync after adding or updating evidence; re-run after regenerate if you need evidence to override preserved placeholders.

Root `/` is a redirect smoke check: authed users go to `/home`, unauthed users go to `/login`. Manual QA should verify redirect behavior rather than a standalone landing page.
