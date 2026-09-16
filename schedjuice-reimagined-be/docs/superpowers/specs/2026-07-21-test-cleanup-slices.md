# Test cleanup slices (2026-07-21)

Exclusive ownership. Skip `worktrees/`. Paths relative to each repo root unless noted.

## Backend (`schedjuice-reimagined-be`)

| slice_id | path |
|----------|------|
| be-app_ai | app_ai/tests |
| be-app_announcement | app_announcement/tests |
| be-app_attachment | app_attachment/tests |
| be-app_attendance | app_attendance/tests |
| be-app_auth | app_auth/tests |
| be-app_certificates | app_certificates/tests |
| be-app_chat | app_chat/tests |
| be-app_course | app_course/tests |
| be-app_crm | app_crm/tests |
| be-app_custom_fields | app_custom_fields/tests |
| be-app_demo | app_demo/tests |
| be-app_finance | app_finance/tests |
| be-app_grading_reports | app_grading_reports/tests |
| be-app_hr | app_hr/tests |
| be-app_microsoft | app_microsoft/tests |
| be-app_organization | app_organization/tests |
| be-app_points | app_points/tests |
| be-app_product_docs | app_product_docs/tests |
| be-app_quiz | app_quiz/tests |
| be-app_quiz_v3 | app_quiz_v3/tests |
| be-app_rbac | app_rbac/tests |
| be-app_reports | app_reports/tests |
| be-app_tasks | app_tasks/tests |
| be-app_telegram | app_telegram/tests |
| be-app_userlog | app_userlog/tests |
| be-app_utility_notifications | app_utility_notifications/tests |
| be-app_utils | app_utils/tests |
| be-app_zoom | app_zoom/tests |
| be-utilitas | utilitas/tests |

## Frontend (`schedjuice-reimagined-fe`)

| slice_id | path (under `src/`) | notes |
|----------|---------------------|-------|
| fe-helpers | helpers | |
| fe-hooks | hooks | |
| fe-config | config | |
| fe-types | types | |
| fe-sdk | sdk | |
| fe-lib-root | lib | **only** `src/lib/*.test.ts(x)` (maxdepth 1), not subdirs |
| fe-lib-__tests__ | lib/__tests__ | |
| fe-lib-ai | lib/ai | |
| fe-lib-attachment | lib/attachment | skip if no tests |
| fe-lib-autosave | lib/autosave | skip if no tests |
| fe-lib-changelog | lib/changelog | |
| fe-lib-chat | lib/chat | |
| fe-lib-chat-threads | lib/chat-threads | |
| fe-lib-course | lib/course | |
| fe-lib-custom-fields | lib/custom-fields | |
| fe-lib-data-sheets | lib/data-sheets | |
| fe-lib-finances | lib/finances | |
| fe-lib-fullscreen | lib/fullscreen | |
| fe-lib-grading | lib/grading | |
| fe-lib-id-card | lib/id-card | |
| fe-lib-imports | lib/imports | |
| fe-lib-layout | lib/layout | |
| fe-lib-linking | lib/linking | |
| fe-lib-microsoft | lib/microsoft | |
| fe-lib-org | lib/org | |
| fe-lib-payroll | lib/payroll | |
| fe-lib-points | lib/points | |
| fe-lib-product-docs | lib/product-docs | |
| fe-lib-rbac | lib/rbac | |
| fe-lib-sj | lib/sj | |
| fe-lib-sound | lib/sound | |
| fe-lib-subjects | lib/subjects | |
| fe-lib-ui | lib/ui | |
| fe-lib-ui-remediation | lib/ui-remediation | |
| fe-lib-user | lib/user | |
| fe-lib-user-logs | lib/user-logs | |
| fe-lib-users | lib/users | |
| fe-lib-web-push | lib/web-push | |
| fe-components-attachment-uploader | components/attachment-uploader | |
| fe-components-attendance | components/attendance | |
| fe-components-auth | components/auth | |
| fe-components-auto-form | components/auto-form | |
| fe-components-camera | components/camera | |
| fe-components-course | components/course | |
| fe-components-data-sheet | components/data-sheet | |
| fe-components-data-table | components/data-table | |
| fe-components-date | components/date | |
| fe-components-edit-kit | components/edit-kit | |
| fe-components-filters | components/filters | |
| fe-components-form | components/form | |
| fe-components-home | components/home | |
| fe-components-images | components/images | |
| fe-components-import-grid | components/import-grid | |
| fe-components-import-wizard | components/import-wizard | |
| fe-components-internal | components/internal | |
| fe-components-layout | components/layout | |
| fe-components-loading | components/loading | |
| fe-components-microsoft | components/microsoft | |
| fe-components-nav | components/nav | |
| fe-components-organization | components/organization | |
| fe-components-points | components/points | |
| fe-components-primitives | components/primitives | |
| fe-components-quiz-v3 | components/quiz-v3 | |
| fe-components-rbac | components/rbac | |
| fe-components-record | components/record | |
| fe-components-scheduling | components/scheduling | |
| fe-components-shell | components/shell | |
| fe-components-users | components/users | |

If a slice path has zero test files at dispatch time, mark the report `deleted: []`, `ambiguous: []`, `skipped: true` and move on.
If a slice is too large and the agent stalls, split alphabetically (e.g. `fe-helpers-a-m` / `fe-helpers-n-z`) and re-queue — never silently skip work.
