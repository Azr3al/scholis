# Course Record — Context Rail + Unified Shell — Design Spec

> Redesign `/courses/[id]/**` with a persistent course context rail (Linear-style swap), typography-first identity on hub routes, Overview rebuilt in `.sj-root`, and staff tools in the panel-header overflow — mirroring the user record migration.

**Status:** Design approved (brainstorming 2026-06-24). Ready for implementation plan.
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type, motion §12, layout §9, banned list §14.
**Predecessors:**
- P2a app shell — `2026-06-21-app-shell-sidebar-design.md`
- P2b user record — `2026-06-21-user-record-inline-design.md`
- Record-mode dual-path nav — `2026-06-22-record-mode-global-nav-design.md`
- Academic Hub list — `2026-05-22-academic-hub-design.md` (course card v2 identity hierarchy)

---

## 1. Context

The Academic Hub (`/courses`) was redesigned in May 2026. Course **detail** was explicitly deferred (“Phase 2”). Today `/courses/[id]/**` (~38 routes) still uses shadcn/Radix hub chrome:

- Horizontal tab bar + mobile bottom bar + **More** dropdown (`CourseHubToolbar`)
- Hub toolbar **hidden** on sub-routes (`isCourseHubChromePath`) — Attendance, Grading, Edit, etc. have **no course nav**
- Separate `/courses/[id]/edit` with internal tabs
- Overview is a thin wrapper around legacy `CourseHeader` (~1100 lines, shadcn cards)

The user record migration shipped a reusable **context-rail slot** (`useContextRail`, `RecordSectionRail`, record mode). This spec applies the same shell pattern to courses.

---

## 2. Goals & non-goals

### Goals

1. **Persistent course shell on all `/courses/[id]/**` routes** — context rail stays mounted; users navigate Overview ↔ Attendance ↔ Grading ↔ Edit without losing course context.
2. **Contextual sidebar swap** — entering any course route collapses the global rail to icons and reveals the course section rail (reuse P2a/P2b mechanism + dual-path nav).
3. **Teaching-flow rail IA** — Overview → Schedule → Attendance → Grading → Members → Assessments → Announcements → Materials (permission-gated where applicable).
4. **Promoted staff sections** — Attendance and Grading in the rail (not buried in overflow).
5. **Panel-header `⋯`** — all other staff links from `getDropdownMenuItems` (Edit course, Payments, Notes, Recordings, Templates, …).
6. **Typography-first identity strip** on **hub routes only** — program breadcrumb, Fraunces title, code/status/subject chips, schedule hint; screenshot-clean (no hero image in this pass).
7. **Overview fully redesigned** in `.sj-root`; other hub sections **reuse existing displays** inside the new shell.
8. **Sub-route bodies unchanged** — Attendance marking, Edit tabs, Grading, etc. keep current components until later reskin passes.
9. Motion per `DESIGN.md` §12 via `src/lib/sj/motion.ts`.

### Non-goals (explicitly deferred)

- Inline editing on course fields / removing `/courses/[id]/edit` (future pass, like user record Stage C).
- Reskinning Attendance, Grading, Edit, or other sub-route **content**.
- Course cover / hero image upload.
- Backend API changes.
- Replacing `getDropdownMenuItems` permission logic — reuse as-is for `⋯` menu.
- Second “Settings rail” swap (GitHub-style); single rail for now.
- Nav IA changes outside the course workspace.

---

## 3. Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Shell scope | **All** `/courses/[id]/**` share context rail + record mode |
| 2 | Content reskin scope | **Hub routes + Overview redesign**; sub-route bodies old chrome |
| 3 | Identity header | **Typography-first strip** on hub routes only; sub-routes use rail block + breadcrumb |
| 4 | Rail mechanism | **Link-based** real URLs (Approach 1); not in-page `?section=` |
| 5 | Rail order | Overview → Schedule → **Attendance** → **Grading** → Members → Assessments → Announcements → Materials |
| 6 | Attendance / Grading | **In rail** (permission-gated); not in `⋯` |
| 7 | Other staff tools | **Panel-header `⋯`** (reuse `getDropdownMenuItems` minus attendance/grading) |
| 8 | Join code / invite | Stay as visible control in panel header actions (staff), not in `⋯` |
| 9 | Swap integration | Reuse `useContextRail` + `ContextRailParent` |
| 10 | Context parent | `{ label: "Academic Hub", href: "/courses" }` |
| 11 | Primitives / icons | Base UI + `src/components/primitives/*`; Iconoir; ban new shadcn/lucide in new shell code |
| 12 | Old hub chrome | **Remove** `CourseHubToolbar`, `CourseHubNavDesktop/Mobile`, horizontal tabs, bottom bar |

---

## 4. Section IA (course rail)

### 4.1 Rail entries

| Order | Label | Href | Visible when | Active match |
| --- | --- | --- | --- | --- |
| 1 | Overview | `/courses/[id]` | always | exact base path |
| 2 | Schedule | `/courses/[id]/schedule` | always | prefix `/schedule` |
| 3 | Attendance | `/courses/[id]/attendance` | `attendance.mark` or `checkin.view_all` | prefix `/attendance`, `/checkin-history`, `/meeting-attendance` |
| 4 | Grading | `/courses/[id]/grading` | `assignment.grade` or `grade.manage` | prefix `/grading` |
| 5 | Members | `/courses/[id]/members` | always (student parity) | prefix `/members` |
| 6 | Assessments | `/courses/[id]/assessments` | always | prefix `/assessments` |
| 7 | Announcements | `/courses/[id]/announcements` | always | prefix `/announcements` |
| 8 | Materials | `/courses/[id]/materials` | always | prefix `/materials` |

**Note:** Check-in history and meeting attendance are **Attendance** family routes — Attendance rail item stays active on those paths.

### 4.2 Panel-header `⋯` menu

Source: `getDropdownMenuItems(user, course, tenant)` from `src/config/course.tsx`, **excluding** items whose href is `attendance`, `checkin-history`, `meeting-attendance`, or `grading` (already in rail).

Grouped with existing separators between config groups. Destructive/status actions on Overview (pause/end course) stay in **Overview content** or move to `⋯` during Overview redesign — default: **Overview actions in redesigned Overview**, admin-only course mutations in `⋯` if not already on Overview.

### 4.3 Routes with no rail highlight

Sub-routes reached only via `⋯` (e.g. `/edit`, `/student-payments`, `/email-templates/...`) persist the rail but **no section is active** — breadcrumb carries location (`Academic Hub / {title} / Edit course`).

---

## 5. Layout & chrome

### 5.1 Unified `courses/[id]/layout.tsx`

Replace current hub-only layout with a **course shell layout**:

```
CourseHubProvider (loads course + events — already exists)
└── CourseShellLayoutInner
    ├── useContextRail(<CourseSectionRail … />, COURSE_CONTEXT_PARENT)
    ├── usePageHeader from child routes OR shell defaults (breadcrumb skeleton)
    ├── HubRouteChrome? (identity strip — hub paths only)
    └── {children}
```

- **`useContextRail`** registered here so **all** child routes get record mode.
- Remove `isCourseHubChromePath` gating for rail/toolbar — delete old toolbar entirely.
- **`isCourseHubRoute(pathname, courseId)`** (new helper): true for the eight hub section base paths; controls identity strip visibility only.

### 5.2 Hub routes vs sub-routes

| Surface | Hub routes (§4.1) | Sub-routes (`/edit`, `/email-templates`, …) |
| --- | --- | --- |
| Context rail | yes | yes |
| Record mode | yes | yes |
| Typography identity strip | **yes** | **no** |
| Panel breadcrumb | `Academic Hub / {title}` or `… / {section}` | `Academic Hub / {title} / {page label}` |
| Page body | `.sj-root` wrapper for hub; Overview new, others reused | un-migrated shadcn inside floating panel (unchanged) |

### 5.3 Identity strip (hub only)

New `CourseRecordHeader` under `src/components/course/record/`:

- Reuse **`CourseIdentityBlock`** (`variant="hub"` or extend with `record` variant fields already in `course-identity-block.tsx`).
- Add: next-session line, primary teacher, status — sourced from existing Overview/`CourseHeader` data queries (extract read-only summary hooks; do not port all edit dialogs in this pass).
- **No** cover photo, **no** edit buttons in strip — staff actions in panel `⋯` / join code in header actions.
- Screenshot-worthy: presentation-only default.

### 5.4 Dual-path navigation

Per `2026-06-22-record-mode-global-nav-design.md`:

- Breadcrumb **`Academic Hub`** links to `/courses`.
- Global icon rail navigates away in one click; **Courses** icon → `/courses` while in course record mode.
- Rail `← Academic Hub` link kept as tertiary affordance.

### 5.5 Mobile (<768px)

No second rail column. Pattern mirrors user record:

- **`CourseMobileSections`** — horizontal scroll or segmented control for rail entries (including Attendance/Grading when visible).
- `⋯` and join code in panel header.
- Remove fixed bottom tab bar (`CourseHubNavMobile`).

---

## 6. Contextual swap (reuse P2b)

- **`CourseSectionRail`** — parallel to `RecordSectionRail`: back link, `CourseIdentityBlock` compact in rail header, `<Link>` list with `aria-current`, Iconoir icons, `staggerList` / `transition.panelWipe`.
- **`COURSE_CONTEXT_PARENT`**: `{ label: "Academic Hub", href: "/courses" }`.
- Motion: same as user record §5.2 in P2b spec (`railMorph`, `panelWipe`, reduced-motion fallback).
- **`CourseHubProvider`** remains the single course fetch for rail identity + children.

---

## 7. Overview redesign

### 7.1 Replace `OverviewTab` + legacy `CourseHeader` shell

- New **`CourseRecordOverview`** in `.sj-root` composes:
  - Summary metrics row (sessions, members, status — reuse data from current `CourseHeader` queries where possible).
  - Key cards: schedule snapshot, meeting link, primary teacher, intake/dates — **redesigned layout** using primitives (`Card` pattern from record Overview), not shadcn `Card`.
  - Status actions (pause/resume/end) — port from `CourseHeader` with primitive `Button` / `AlertDialog`; keep existing API calls.
- **Do not** port entire 1100-line `CourseHeader` verbatim — extract logical sections into focused components.

### 7.2 Other hub sections

| Section | Build |
| --- | --- |
| Schedule | Reuse existing schedule page component inside `.sj-root` page wrapper |
| Members | Reuse existing members UI |
| Assessments | Reuse existing |
| Announcements | Reuse existing |
| Materials | Reuse existing |

Wrap with minimal `.sj-root` padding wrapper; no horizontal tabs.

---

## 8. Config & routing refactor

### 8.1 Replace `course-hub-nav.ts`

Evolve into **`course-record-nav.ts`**:

- `CourseRecordNavEntry` type: `{ id, label, href, icon, canShow?(user, course, tenant), matchPath?(pathname, courseId) }`.
- `visibleCourseRecordEntries(...)` — ordered teaching-flow list.
- `courseRecordNavActive(...)` — pathname prefix rules including attendance family.
- Deprecate `desktopPrimary` / overflow split — rail shows all visible entries.

### 8.2 Delete / retire

- `CourseHubToolbar`, `CourseHubNavDesktop`, `CourseHubNavMobile`, `CourseHubTitleHeader` (title moves to identity strip + breadcrumb).
- `isCourseHubChromePath` → rename/split into `isCourseHubRoute` (strip only) + nav active helpers.

---

## 9. Components to build

| Component | Purpose |
| --- | --- |
| `courses/[id]/layout.tsx` (rewrite) | Shell: provider, context rail, optional hub identity wrapper |
| `course/record/course-section-rail.tsx` | Context rail UI |
| `course/record/course-record-header.tsx` | Typography identity strip (hub routes) |
| `course/record/course-record-overview.tsx` | Redesigned Overview |
| `course/record/course-record-header-actions.tsx` | Panel `⋯` + join code slot |
| `course/record/course-mobile-sections.tsx` | Mobile section switcher |
| `config/course-record-nav.ts` | Rail IA + visibility + active state |
| `course/record/course-hub-route-shell.tsx` | Optional wrapper: identity strip + children for hub pages |

---

## 10. Staged implementation

1. **Stage A — Shell + rail:** `course-record-nav.ts`, `CourseSectionRail`, layout rewrite, `useContextRail`, remove old toolbar, mobile sections, breadcrumb + dual-path nav. Hub pages still use old Overview body temporarily.
2. **Stage B — Identity + Overview:** `CourseRecordHeader`, `CourseRecordOverview`, panel `⋯` actions; hub routes wrapped in `.sj-root`.
3. **Stage C — Hub section wrappers:** thin `.sj-root` wrappers for Schedule/Members/Assessments/Announcements/Materials; delete dead hub chrome files.

Each stage independently shippable.

---

## 11. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Edit page double-nav (rail + edit tabs) | Accept for now; breadcrumb clarifies; future inline edit removes edit tabs |
| Rail active state on deep URLs | Central `matchPath` helpers; unit tests for pathname cases |
| `CourseHeader` extraction complexity | Stage B timebox; port read-only blocks first, status dialogs second |
| Sub-route pages with own `PageContainer` double padding | Audit sub-routes in Stage A; adjust top padding when rail present |
| Student sees Attendance/Grading | Strict `canShow` mirrors existing `getDropdownMenuItems` gates |
| Locked course route | `/courses/[id]/locked` inherits shell or opts out — verify; default inherit |

---

## 12. Acceptance

- Any `/courses/[id]/**` route shows context rail + record mode on desktop; mobile section switcher works.
- Teaching-flow order correct; Attendance/Grading visible only with permissions.
- Navigating Overview → Attendance → back to Schedule keeps rail mounted; global nav reachable.
- Hub routes show typography identity strip; sub-routes do not (breadcrumb + rail block only).
- Overview rebuilt in `.sj-root`; other hub sections function as before.
- `⋯` contains staff tools except Attendance/Grading; join code visible for staff in header.
- Old horizontal tabs and bottom bar removed.
- `npm run lint`, `npm run build`, `npm run test:unit` pass.

---

## 13. Real-world references (brainstorming)

| Pattern | Reference |
| --- | --- |
| Persistent course nav | [Canvas course nav](https://canvas.instructure.com/doc), [Google Classroom](https://classroom.google.com) |
| Context rail swap | [Linear](https://linear.app), Schedjuice `/users/[id]` |
| Settings/tools in overflow | [Google Classroom gear menu](https://classroom.google.com) |
| Dual-path escape | `2026-06-22-record-mode-global-nav-design.md` |
| Course identity typography | Academic Hub card v2, `CourseIdentityBlock` |

---

## 14. Spec self-review

- [x] No TBD placeholders
- [x] Shell scope (all routes) vs content scope (hub + Overview) clearly separated
- [x] Attendance family paths map to one rail item
- [x] Consistent with user record shell contracts
- [x] Single implementation unit suitable for one plan (staged)
