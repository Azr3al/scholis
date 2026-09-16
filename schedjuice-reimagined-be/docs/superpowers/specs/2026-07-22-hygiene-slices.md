# Code hygiene slices (2026-07-22)

Exclusive ownership. Skip `worktrees/` as **scan** targets (they are prune targets only). Paths relative to each repo root unless noted.

Do **not** assign overlapping slices. `fe-lib-*` / `fe-components-*` / `fe-app-*` replace whole-tree ownership of `src/lib`, `src/components`, and `src/app`.

## Backend (`schedjuice-reimagined-be`)

| slice_id | path |
|----------|------|
| be-app_ai | app_ai |
| be-app_announcement | app_announcement |
| be-app_attachment | app_attachment |
| be-app_attendance | app_attendance |
| be-app_auth | app_auth |
| be-app_certificates | app_certificates |
| be-app_chat | app_chat |
| be-app_course | app_course |
| be-app_crm | app_crm |
| be-app_custom_fields | app_custom_fields |
| be-app_data | app_data |
| be-app_demo | app_demo |
| be-app_department | app_department |
| be-app_finance | app_finance |
| be-app_grading_reports | app_grading_reports |
| be-app_hr | app_hr |
| be-app_library | app_library |
| be-app_microsoft | app_microsoft |
| be-app_organization | app_organization |
| be-app_points | app_points |
| be-app_product_docs | app_product_docs |
| be-app_quiz_v3 | app_quiz_v3 |
| be-app_rbac | app_rbac |
| be-app_rbac_audit | app_rbac_audit |
| be-app_reports | app_reports |
| be-app_tasks | app_tasks |
| be-app_telegram | app_telegram |
| be-app_tools | app_tools |
| be-app_userlog | app_userlog |
| be-app_utility_notifications | app_utility_notifications |
| be-app_utils | app_utils |
| be-app_welcome_board | app_welcome_board |
| be-app_wiki | app_wiki |
| be-app_ws | app_ws |
| be-app_zoom | app_zoom |
| be-utilitas | utilitas |

## Frontend — top-level (`schedjuice-reimagined-fe/src`)

| slice_id | path | notes |
|----------|------|-------|
| fe-api | src/api | |
| fe-config | src/config | |
| fe-content | src/content | |
| fe-contexts | src/contexts | |
| fe-csv-examples | src/csv-examples | |
| fe-data | src/data | |
| fe-entity-resolution | src/entity-resolution | |
| fe-helpers | src/helpers | |
| fe-hooks | src/hooks | |
| fe-messages | src/messages | |
| fe-sdk | src/sdk | |
| fe-store | src/store | |
| fe-styles | src/styles | |
| fe-types | src/types | |
| fe-middleware | src/middleware.ts | single file |

## Frontend — `src/lib`

| slice_id | path | notes |
|----------|------|-------|
| fe-lib-root | src/lib | **only** `src/lib/*.{ts,tsx}` maxdepth 1, not subdirs |
| fe-lib-__tests__ | src/lib/__tests__ | |
| fe-lib-ai | src/lib/ai | |
| fe-lib-announcement | src/lib/announcement | |
| fe-lib-attachment | src/lib/attachment | |
| fe-lib-autosave | src/lib/autosave | |
| fe-lib-certifications | src/lib/certifications | |
| fe-lib-changelog | src/lib/changelog | |
| fe-lib-chat | src/lib/chat | |
| fe-lib-chat-threads | src/lib/chat-threads | |
| fe-lib-course | src/lib/course | |
| fe-lib-custom-fields | src/lib/custom-fields | |
| fe-lib-data-sheets | src/lib/data-sheets | |
| fe-lib-finances | src/lib/finances | |
| fe-lib-fullscreen | src/lib/fullscreen | |
| fe-lib-geo | src/lib/geo | |
| fe-lib-grading | src/lib/grading | |
| fe-lib-id-card | src/lib/id-card | |
| fe-lib-imports | src/lib/imports | |
| fe-lib-juicebox | src/lib/juicebox | |
| fe-lib-layout | src/lib/layout | |
| fe-lib-linking | src/lib/linking | |
| fe-lib-microsoft | src/lib/microsoft | |
| fe-lib-org | src/lib/org | |
| fe-lib-payroll | src/lib/payroll | |
| fe-lib-points | src/lib/points | |
| fe-lib-product-docs | src/lib/product-docs | |
| fe-lib-rbac | src/lib/rbac | |
| fe-lib-sj | src/lib/sj | |
| fe-lib-sound | src/lib/sound | |
| fe-lib-subjects | src/lib/subjects | |
| fe-lib-ui | src/lib/ui | |
| fe-lib-ui-remediation | src/lib/ui-remediation | |
| fe-lib-user | src/lib/user | |
| fe-lib-user-logs | src/lib/user-logs | |
| fe-lib-users | src/lib/users | |
| fe-lib-web-push | src/lib/web-push | |
| fe-lib-wiki | src/lib/wiki | |

## Frontend — `src/components`

| slice_id | path |
|----------|------|
| fe-components-root | src/components/*.tsx (root files only) |
| fe-components-academic | src/components/academic |
| fe-components-academic-hub | src/components/academic-hub |
| fe-components-announcement | src/components/announcement |
| fe-components-assignment | src/components/assignment |
| fe-components-attachment-uploader | src/components/attachment-uploader |
| fe-components-attendance | src/components/attendance |
| fe-components-attendance-god-view | src/components/attendance-god-view |
| fe-components-auth | src/components/auth |
| fe-components-auto-form | src/components/auto-form |
| fe-components-birthday | src/components/birthday |
| fe-components-board-detail | src/components/board-detail |
| fe-components-calendar | src/components/calendar |
| fe-components-camera | src/components/camera |
| fe-components-campus-checkin | src/components/campus-checkin |
| fe-components-category | src/components/category |
| fe-components-certificate | src/components/certificate |
| fe-components-certificates | src/components/certificates |
| fe-components-changelog | src/components/changelog |
| fe-components-charts | src/components/charts |
| fe-components-chat | src/components/chat |
| fe-components-colors | src/components/colors |
| fe-components-connectors | src/components/connectors |
| fe-components-countdown | src/components/countdown |
| fe-components-course | src/components/course |
| fe-components-course-identity | src/components/course-identity |
| fe-components-course-insights | src/components/course-insights |
| fe-components-courses | src/components/courses |
| fe-components-custom | src/components/custom |
| fe-components-custom-fields | src/components/custom-fields |
| fe-components-data-sheet | src/components/data-sheet |
| fe-components-data-table | src/components/data-table |
| fe-components-datatable | src/components/datatable |
| fe-components-date | src/components/date |
| fe-components-department | src/components/department |
| fe-components-dvr | src/components/dvr |
| fe-components-edit-kit | src/components/edit-kit |
| fe-components-editor | src/components/editor |
| fe-components-email-templates | src/components/email-templates |
| fe-components-event | src/components/event |
| fe-components-filters | src/components/filters |
| fe-components-finance | src/components/finance |
| fe-components-finances | src/components/finances |
| fe-components-find-page | src/components/find-page |
| fe-components-footer | src/components/footer |
| fe-components-form | src/components/form |
| fe-components-grading-reports | src/components/grading-reports |
| fe-components-help-dialogs | src/components/help-dialogs |
| fe-components-holiday | src/components/holiday |
| fe-components-home | src/components/home |
| fe-components-id-card | src/components/id-card |
| fe-components-image-editor | src/components/image-editor |
| fe-components-images | src/components/images |
| fe-components-import-grid | src/components/import-grid |
| fe-components-import-wizard | src/components/import-wizard |
| fe-components-internal | src/components/internal |
| fe-components-issues | src/components/issues |
| fe-components-kanban | src/components/kanban |
| fe-components-layout | src/components/layout |
| fe-components-leads | src/components/leads |
| fe-components-library | src/components/library |
| fe-components-linking | src/components/linking |
| fe-components-loading | src/components/loading |
| fe-components-markdown | src/components/markdown |
| fe-components-media | src/components/media |
| fe-components-microsoft | src/components/microsoft |
| fe-components-misc | src/components/misc |
| fe-components-nav | src/components/nav |
| fe-components-newspaper | src/components/newspaper |
| fe-components-notification | src/components/notification |
| fe-components-org | src/components/org |
| fe-components-organization | src/components/organization |
| fe-components-platform | src/components/platform |
| fe-components-points | src/components/points |
| fe-components-primitives | src/components/primitives |
| fe-components-product-docs | src/components/product-docs |
| fe-components-profile | src/components/profile |
| fe-components-program | src/components/program |
| fe-components-providers | src/components/providers |
| fe-components-public | src/components/public |
| fe-components-quiz-v3 | src/components/quiz-v3 |
| fe-components-rbac | src/components/rbac |
| fe-components-record | src/components/record |
| fe-components-registration | src/components/registration |
| fe-components-reports | src/components/reports |
| fe-components-scheduling | src/components/scheduling |
| fe-components-shell | src/components/shell |
| fe-components-shortcuts | src/components/shortcuts |
| fe-components-sortable-header | src/components/sortable-header |
| fe-components-storage | src/components/storage |
| fe-components-submission-tracker | src/components/submission-tracker |
| fe-components-typography | src/components/typography |
| fe-components-user-hub | src/components/user-hub |
| fe-components-user-insights | src/components/user-insights |
| fe-components-user-logs | src/components/user-logs |
| fe-components-users | src/components/users |
| fe-components-visibility | src/components/visibility |
| fe-components-web-push | src/components/web-push |

## Frontend — `src/app`

| slice_id | path |
|----------|------|
| fe-app-root | src/app root files (`layout.tsx`, `page.tsx`, `error.tsx`, `globals.css`, `favicon.ico`, …) |
| fe-app-_chrome | src/app/_chrome |
| fe-app-design | src/app/(design) |
| fe-app-docs | src/app/(docs) |
| fe-app-internal | src/app/(internal) |
| fe-app-platform-internal | src/app/(platform-internal) |
| fe-app-public | src/app/(public) |
| fe-app-quiz-v3 | src/app/(quiz-v3) |
| fe-app-quizv2 | src/app/(quizv2) |
| fe-app-artifacts | src/app/artifacts |
| fe-app-attachments | src/app/attachments |
| fe-app-client-api | src/app/client-api |
| fe-app-image-proxy | src/app/image-proxy |

## Meta (guidance files only)

| slice_id | path |
|----------|------|
| meta-be-agents | schedjuice-reimagined-be/AGENTS.md + schedjuice-reimagined-be/.cursor/rules/ |
| meta-fe-agents | schedjuice-reimagined-fe/AGENTS.md + schedjuice-reimagined-fe/.cursor/rules/ |
| meta-monorepo-rules | /Users/jamesthiha/programming/schedjuice/.cursor/rules/ (prevention rule only; after cleanup) |

App/src slices must **not** edit meta paths.
