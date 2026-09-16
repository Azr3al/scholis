# Announcement Creation Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Repo policy:** Run `git commit` / `git push` only when the user has authorized commits. Split work into granular atomic commits per layer (see mobile `git-commit-granularity.mdc`).
> **Spec:** [`docs/superpowers/specs/2026-08-20-announcement-creation-center-design.md`](../specs/2026-08-20-announcement-creation-center-design.md)

**Goal:** Consolidate admin announcement creation into one **Announcement Creation Center** on web and mobile (`announcement.manage` only, org-wide or per-course scope). Remove scattered mobile create entry points. Merge web admin org-wide lists under Content nav; keep course feed composer for non-admin teachers.

**Architecture:** Client-only consolidation — reuse `POST /api/v1/announcements` with existing RBAC. Web builds one `AnnouncementCreationCenterForm` absorbing `AnnouncementForm` + `OrgWideAnnouncementForm` logic behind a scope picker. Mobile adds a full-screen create route reachable from nav only; extends `buildAnnouncementCreateFormData` for optional Teams fields. Legacy web URLs redirect to the new hub.

**Tech Stack:** Django 4.2 + DRF (`schedjuice-reimagined-be`); Next.js 15 + TanStack Query v4 (`schedjuice-reimagined-fe`); Expo Router + React Query + NativeWind (`schedjuice-reimagined-mobile`).

## Global Constraints

- Center access: **`announcement.manage` only** — scope picker: org-wide or per-course.
- Non-admin create: **course feed composer stays** on web (`CourseFeedComposer`) for MT/AT and `course.manage_content` users; **daily lessons inline only**.
- Org-wide form: **one unified form** — Teams options when `tenant.is_microsoft_on`.
- Mobile entry: **nav button only** — remove home/course/top-tabs create FABs.
- Web nav: Content → **"Announcement Center"** at `/content/announcement-center` (replaces "Org-wide Announcements").
- Legacy routes: **redirect** list + create URLs to center (option B from spec).
- Backend v1: **no new endpoints** — reuse `POST announcements`.
- Student read paths: **unchanged** (mobile Home Announcements tab, course announcement list/feed).
- Mobile i18n: add keys to `en.ts`; copy same English into `my.ts`.
- Backend tests: always `./scripts/run_backend_tests.sh <target> --keepdb --noinput` (never Railway).
- FE tests: `pnpm run test:unit`; lint: `pnpm run lint`.
- Mobile tests: `pnpm test` for touched paths.

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| Path | Responsibility |
|------|----------------|
| `app_announcement/tests/test_rbac_announcement.py` | Add center-path RBAC tests (admin course-scoped without roster; org-wide + `course_filters`) |

No production BE code changes expected v1.

### Frontend (`schedjuice-reimagined-fe`)

| Path | Responsibility |
|------|----------------|
| `src/types/announcement-center.ts` | `AnnouncementCenterScope` enum |
| `src/helpers/announcement-center-form-data.ts` | Build `FormData` for org-wide / per-course + Teams |
| `src/helpers/announcement-center-form-data.test.ts` | Payload shape unit tests |
| `src/components/announcement/announcement-creation-center-form.tsx` | Unified create form |
| `src/app/(internal)/content/announcement-center/page.tsx` | Admin hub list |
| `src/app/(internal)/content/announcement-center/create/page.tsx` | Create route |
| `src/config/nav-routes.tsx` | Replace nav item |
| `src/config/route-permissions.ts` | Guard `/content/announcement-center` |
| `src/lib/resolve-utility-notification-href.ts` | Redirect resolver to new hub |
| Legacy pages under `announcements/` and `services/org-wide-announcements/` | `redirect()` stubs |
| Delete when unused: `org-wide-announcement-form.tsx`, `announcement-tab.tsx` | Dead code cleanup |

### Mobile (`schedjuice-reimagined-mobile`)

| Path | Responsibility |
|------|----------------|
| `types/announcement-center.ts` | Scope enum + form values |
| `lib/announcement/build-announcement-create-form-data.ts` | Extend for Teams + `post_type` |
| `lib/announcement/build-announcement-create-form-data.test.ts` | Payload tests |
| `app/(protected)/announcement-center/_layout.tsx` | Stack layout |
| `app/(protected)/announcement-center/create.tsx` | Full-screen create |
| `components/announcement/announcement-creation-center-form.tsx` | Form UI |
| `lib/navigation/sidebar-nav-config.ts` | Nav entry |
| `components/home/home-dashboard.tsx` | Remove create FAB/sheet |
| `components/navigation/top-tabs.tsx` | Remove create FAB/sheet |
| `app/(protected)/(tabs)/class/course/[id]/announcement/index.tsx` | Remove create FAB/sheet |
| `lib/i18n/locales/en.ts`, `my.ts` | Copy keys |
| `__tests__/...` | Gate + payload tests |

---

### Task 0: Cross-repo worktrees — `feat/announcement-creation-center`

**Files:**
- Create: git worktrees + branches in `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`, `schedjuice-reimagined-mobile`

**Interfaces:**
- Produces: three repos on branch `feat/announcement-creation-center` branched from latest `dev`

- [ ] **Step 1: Fetch dev and create matching branches (each repo)**

```bash
# Backend
cd c:/schedjuice/schedjuice-reimagined-be
git fetch origin dev
git worktree add ../schedjuice-reimagined-be-feat-announcement-center -b feat/announcement-creation-center origin/dev

# Frontend
cd c:/schedjuice/schedjuice-reimagined-fe
git fetch origin dev
git worktree add ../schedjuice-reimagined-fe-feat-announcement-center -b feat/announcement-creation-center origin/dev

# Mobile
cd c:/schedjuice/schedjuice-reimagined-mobile
git fetch origin dev
git worktree add ../schedjuice-reimagined-mobile-feat-announcement-center -b feat/announcement-creation-center origin/dev
```

Expected: three worktree directories; `git branch --show-current` prints `feat/announcement-creation-center` in each.

- [ ] **Step 2: Implement all tasks below inside these worktrees**

Use worktree paths for all subsequent edits. Keep branch name identical across repos for review correlation.

---

### Task 1: BE — RBAC tests for Creation Center paths

**Files:**
- Modify: `app_announcement/tests/test_rbac_announcement.py`

**Interfaces:**
- Produces: passing tests documenting that `announcement.manage` holder can POST course-scoped without teaching assignment; can POST org-wide with `course_filters`

- [ ] **Step 1: Write failing tests**

Add to `AnnouncementRBACTests` in `app_announcement/tests/test_rbac_announcement.py`:

```python
def test_admin_with_announcement_manage_can_create_course_announcement_without_roster(self):
    with self.settings(RBAC_ENFORCE="enforce"):
        resp = self._client(self.admin).post(
            "/api/v1/announcements",
            {
                "title": "Admin course post",
                "data": "body",
                "course": self.other_course.id,
            },
            format="json",
        )
    self.assertEqual(resp.status_code, 201, resp.content)

def test_admin_can_create_org_wide_with_course_filters(self):
    with self.settings(RBAC_ENFORCE="enforce"):
        resp = self._client(self.admin).post(
            "/api/v1/announcements",
            {
                "title": "Org broadcast",
                "data": "body",
                "send_to_microsoft": True,
                "course_filters": {"month_type": "ALL", "category_ids": [self.course.category_id]},
            },
            format="json",
        )
    self.assertEqual(resp.status_code, 201, resp.content)
```

- [ ] **Step 2: Run tests**

```bash
cd c:/schedjuice/schedjuice-reimagined-be-feat-announcement-center
./scripts/run_backend_tests.sh app_announcement.tests.test_rbac_announcement.AnnouncementRBACTests.test_admin_with_announcement_manage_can_create_course_announcement_without_roster app_announcement.tests.test_rbac_announcement.AnnouncementRBACTests.test_admin_can_create_org_wide_with_course_filters -v 2 --keepdb --noinput
```

Expected: PASS (admin already has `announcement.manage` in seed data). If FAIL, fix BE `_require_announcement_write` only if spec requires it — do not broaden beyond admin + `announcement.manage`.

- [ ] **Step 3: Run full announcement RBAC module**

```bash
./scripts/run_backend_tests.sh app_announcement.tests.test_rbac_announcement -v 2 --keepdb --noinput
```

Expected: all PASS.

- [ ] **Step 4: Commit (when user authorized)**

```bash
git add app_announcement/tests/test_rbac_announcement.py
git commit -m "test(announcement): cover admin center create paths"
```

---

### Task 2: FE — scope enum + FormData builder

**Files:**
- Create: `src/types/announcement-center.ts`
- Create: `src/helpers/announcement-center-form-data.ts`
- Create: `src/helpers/announcement-center-form-data.test.ts`

**Interfaces:**
- Produces: `AnnouncementCenterScope` enum; `buildAnnouncementCenterFormData(args)` → `FormData`

- [ ] **Step 1: Write failing unit tests**

Create `src/helpers/announcement-center-form-data.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { AnnouncementCenterScope } from "@/types/announcement-center";
import { buildAnnouncementCenterFormData } from "./announcement-center-form-data";

describe("buildAnnouncementCenterFormData", () => {
  it("omits course for org-wide scope", () => {
    const fd = buildAnnouncementCenterFormData({
      scope: AnnouncementCenterScope.OrgWide,
      title: "Hello",
      dataHtml: "<p>Hi</p>",
      createdById: 1,
      files: [],
    });
    expect(fd.get("title")).toBe("Hello");
    expect(fd.get("course")).toBeNull();
    expect(fd.get("post_type")).toBe("announcement");
  });

  it("includes course for per-course scope", () => {
    const fd = buildAnnouncementCenterFormData({
      scope: AnnouncementCenterScope.PerCourse,
      courseId: 42,
      title: "Class note",
      dataHtml: "<p>Note</p>",
      createdById: 1,
      files: [],
    });
    expect(fd.get("course")).toBe("42");
  });

  it("appends Teams fields for org-wide broadcast", () => {
    const fd = buildAnnouncementCenterFormData({
      scope: AnnouncementCenterScope.OrgWide,
      title: "Teams",
      dataHtml: "<p>T</p>",
      createdById: 1,
      files: [],
      sendToMicrosoft: true,
      courseFilters: { month_type: "ALL", category_ids: [3] },
    });
    expect(fd.get("send_to_microsoft")).toBe("true");
    expect(fd.get("course_filters")).toBe(
      JSON.stringify({ month_type: "ALL", category_ids: [3] }),
    );
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd c:/schedjuice/schedjuice-reimagined-fe-feat-announcement-center
pnpm run test:unit src/helpers/announcement-center-form-data.test.ts
```

- [ ] **Step 3: Implement types + helper**

Create `src/types/announcement-center.ts`:

```typescript
export enum AnnouncementCenterScope {
  OrgWide = "org_wide",
  PerCourse = "per_course",
}

export type AnnouncementCourseFilters = {
  month_type: "ALL" | "FM" | "HM";
  category_ids?: number[];
};
```

Create `src/helpers/announcement-center-form-data.ts`:

```typescript
import {
  AnnouncementCenterScope,
  type AnnouncementCourseFilters,
} from "@/types/announcement-center";

export type BuildAnnouncementCenterFormDataArgs = {
  scope: AnnouncementCenterScope;
  title: string;
  dataHtml: string;
  createdById: number | undefined;
  files: File[];
  courseId?: number;
  sendToMicrosoft?: boolean;
  courseFilters?: AnnouncementCourseFilters;
};

export function buildAnnouncementCenterFormData({
  scope,
  title,
  dataHtml,
  createdById,
  files,
  courseId,
  sendToMicrosoft,
  courseFilters,
}: BuildAnnouncementCenterFormDataArgs): FormData {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("data", dataHtml);
  formData.append("post_type", "announcement");
  if (createdById != null) {
    formData.append("created_by", String(createdById));
  }
  if (scope === AnnouncementCenterScope.PerCourse && courseId != null) {
    formData.append("course", String(courseId));
  }
  if (sendToMicrosoft) {
    formData.append("send_to_microsoft", "true");
  }
  if (courseFilters) {
    formData.append("course_filters", JSON.stringify(courseFilters));
  }
  files.forEach((file) => formData.append("files", file));
  return formData;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm run test:unit src/helpers/announcement-center-form-data.test.ts
```

- [ ] **Step 5: Commit (when user authorized)**

```bash
git add src/types/announcement-center.ts src/helpers/announcement-center-form-data.ts src/helpers/announcement-center-form-data.test.ts
git commit -m "feat(announcement): add center scope types and form builder"
```

---

### Task 3: FE — `AnnouncementCreationCenterForm` component

**Files:**
- Create: `src/components/announcement/announcement-creation-center-form.tsx`
- Reference (lift logic from): `src/components/announcement/org-wide-announcement-form.tsx`, `src/components/announcement/announcement-form.tsx`

**Interfaces:**
- Consumes: `buildAnnouncementCenterFormData`, `AnnouncementCenterScope`, `searchEntities("categories")`, `searchEntities("courses")`, TipTap `getAnnouncementEditorOptions({ teamsSafe: true })`
- Produces: exported `AnnouncementCreationCenterForm` with props `{ cancelHref: string; onSuccess?: () => void }`

- [ ] **Step 1: Implement form shell with scope toggle**

Create `src/components/announcement/announcement-creation-center-form.tsx` with:

1. **Scope radio/segmented control:** Org-wide | Per course (`AnnouncementCenterScope`)
2. **Per-course:** course search via `searchEntities("courses", { size: 20, sorts: ["title"] }, filter)` — reuse course picker pattern from existing admin screens (combobox or `MultiSelectPopOver` single-select)
3. **Shared fields:** title `Input`, TipTap editor (`teamsSafe: true` when `tenant.is_microsoft_on`), `AttachmentUploader` (image-only, max 10)
4. **Org-wide + Microsoft on:** month type select, category multi-select, `send_to_microsoft` checkbox (default false for non-Teams org-wide; when checked, show confirm dialog copied from `OrgWideAnnouncementForm`)
5. **Per-course + Microsoft on:** optional `send_to_microsoft` checkbox (no category/month filters)
6. **Submit:** `useMutation` → `makePostRequest("announcements", formData)` using `buildAnnouncementCenterFormData`; `isLoading` on primary button; disable cancel while pending
7. **Invalidate:** `queryClient.invalidateQueries({ queryKey: ["announcementList"] })` and `["courseFeed", courseId]` when per-course

Minimal scope toggle snippet:

```tsx
const [scope, setScope] = useState(AnnouncementCenterScope.OrgWide);

<fieldset disabled={createMutation.isPending}>
  <SegmentedControl
    value={scope}
    onValueChange={(v) => setScope(v as AnnouncementCenterScope)}
    options={[
      { value: AnnouncementCenterScope.OrgWide, label: "Org-wide" },
      { value: AnnouncementCenterScope.PerCourse, label: "Per course" },
    ]}
  />
  {scope === AnnouncementCenterScope.PerCourse ? (
    <CoursePicker value={courseId} onChange={setCourseId} />
  ) : null}
  {/* title, editor, attachments, conditional Teams controls */}
</fieldset>
```

- [ ] **Step 2: Manual smoke in dev (after Task 4 routes exist)**

Verify org-wide create without Teams; org-wide with Teams + confirm; per-course create with course selected.

- [ ] **Step 5: Commit (when user authorized)**

```bash
git add src/components/announcement/announcement-creation-center-form.tsx
git commit -m "feat(announcement): add unified creation center form"
```

---

### Task 4: FE — hub + create routes

**Files:**
- Create: `src/app/(internal)/content/announcement-center/page.tsx`
- Create: `src/app/(internal)/content/announcement-center/create/page.tsx`

**Interfaces:**
- Consumes: `AnnouncementList`, `AnnouncementCreationCenterForm`, `searchEntities` with `course IS NULL` filter (copy from `src/app/(internal)/services/org-wide-announcements/page.tsx`)

- [ ] **Step 1: Hub list page**

Create `src/app/(internal)/content/announcement-center/page.tsx`:

```tsx
"use client";

import AnnouncementList from "@/components/announcement/announcement-list";
import { searchEntities } from "@/app/client-api/utils";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { operatorEnum } from "@/types/api";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";

export default function AnnouncementCenterPage() {
  const { refetch, fetchNextPage, hasNextPage, data } = useInfiniteQuery({
    queryKey: ["announcementList", null],
    queryFn: ({ pageParam }) =>
      searchEntities(
        "announcements",
        {
          page: pageParam,
          size: 6,
          sorts: ["-is_pinned", "-created_at"],
          expand: ["attachments"],
        },
        {
          filter_params: [
            { field_name: "course", operator: operatorEnum.isnull, value: "true" },
          ],
        },
      ),
    getNextPageParam: (lastPage, pages) =>
      lastPage.data.links.next ? pages.length + 1 : undefined,
  });

  return (
    <PageContainer width="wide" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-text-primary">Announcement Center</h1>
        <Link
          href="/content/announcement-center/create"
          className={cn(buttonVariants({ variant: "primary", size: "md" }))}
        >
          Create announcement
        </Link>
      </div>
      <AnnouncementList
        canEditAnnouncement
        refetch={refetch}
        fetchNextPage={fetchNextPage}
        hasNextPage={hasNextPage}
        data={data}
        isFormVisible={false}
        setIsFormVisible={() => {}}
        isOrgAnnouncement
      />
    </PageContainer>
  );
}
```

- [ ] **Step 2: Create page**

Create `src/app/(internal)/content/announcement-center/create/page.tsx`:

```tsx
"use client";

import { AnnouncementCreationCenterForm } from "@/components/announcement/announcement-creation-center-form";
import { PageContainer } from "@/components/layout/page-container";
import { useRouter } from "next/navigation";

export default function AnnouncementCenterCreatePage() {
  const router = useRouter();
  return (
    <PageContainer width="wide">
      <AnnouncementCreationCenterForm
        cancelHref="/content/announcement-center"
        onSuccess={() => router.push("/content/announcement-center")}
      />
    </PageContainer>
  );
}
```

- [ ] **Step 3: Commit (when user authorized)**

```bash
git add src/app/(internal)/content/announcement-center/
git commit -m "feat(announcement): add center hub and create routes"
```

---

### Task 5: FE — nav, route permissions, legacy redirects

**Files:**
- Modify: `src/config/nav-routes.tsx` (~382–387)
- Modify: `src/config/route-permissions.ts`
- Modify: `src/lib/resolve-utility-notification-href.ts`
- Modify: `src/app/(internal)/announcements/page.tsx` → redirect stub
- Modify: `src/app/(internal)/announcements/create/page.tsx` → redirect stub
- Modify: `src/app/(internal)/services/org-wide-announcements/page.tsx` → redirect stub
- Modify: `src/app/(internal)/services/org-wide-announcements/create/page.tsx` → redirect stub
- Modify: `src/app/(internal)/announcements/[id]/page.tsx` — update back link to center hub

**Interfaces:**
- Produces: nav item **Announcement Center** → `/content/announcement-center`; legacy URLs redirect

- [ ] **Step 1: Update nav**

In `src/config/nav-routes.tsx`, replace Org-wide Announcements child:

```tsx
{
  title: "Announcement Center",
  icon: Megaphone,
  href: "/content/announcement-center",
  requiredPermissions: ["announcement.manage"],
},
```

Remove `canShow: (tenant) => tenant.is_microsoft_on` gate — center is visible whenever user has permission; Teams controls remain conditional in form.

- [ ] **Step 2: Route permissions**

In `src/config/route-permissions.ts`, add:

```typescript
{ prefix: "/content/announcement-center", anyOf: ["announcement.manage"] },
```

- [ ] **Step 3: Utility notification resolver**

In `src/lib/resolve-utility-notification-href.ts`, change:

```typescript
"/services/org-wide-announcements": () => "/content/announcement-center",
```

- [ ] **Step 4: Legacy redirect pages**

Example for `src/app/(internal)/announcements/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function LegacyAnnouncementsListPage() {
  redirect("/content/announcement-center");
}
```

Apply same pattern:
- `/announcements/create` → `/content/announcement-center/create`
- `/services/org-wide-announcements` → `/content/announcement-center`
- `/services/org-wide-announcements/create` → `/content/announcement-center/create`

- [ ] **Step 5: Update announcement detail back link**

In `src/app/(internal)/announcements/[id]/page.tsx`, change breadcrumb/back `href` from `/announcements` to `/content/announcement-center`.

- [ ] **Step 6: Commit (when user authorized)**

```bash
git add src/config/nav-routes.tsx src/config/route-permissions.ts src/lib/resolve-utility-notification-href.ts src/app/(internal)/announcements/ src/app/(internal)/services/org-wide-announcements/
git commit -m "feat(announcement): wire nav, guards, and legacy redirects"
```

---

### Task 6: FE — cleanup + unit tests

**Files:**
- Delete: `src/components/announcement/org-wide-announcement-form.tsx` (after form absorbed)
- Delete: `src/components/announcement/announcement-tab.tsx`
- Create: `src/components/announcement/announcement-creation-center-form.test.tsx` (scope visibility smoke)

- [ ] **Step 1: Remove dead imports**

```bash
cd c:/schedjuice/schedjuice-reimagined-fe-feat-announcement-center
rg "org-wide-announcement-form|announcement-tab" src/
```

Fix any remaining imports (should be none after redirect stubs).

- [ ] **Step 2: Add form test (high-value)**

Test that Teams month/category controls render only when `scope === OrgWide` and tenant Microsoft flag is true (mock tenant hook).

- [ ] **Step 3: Run gates**

```bash
pnpm run lint
pnpm run test:unit
pnpm run typecheck
```

- [ ] **Step 4: Commit (when user authorized)**

```bash
git add -A src/components/announcement/ src/config/
git commit -m "chore(announcement): remove legacy org-wide form and add center tests"
```

---

### Task 7: Mobile — extend FormData builder + types

**Files:**
- Create: `types/announcement-center.ts`
- Modify: `lib/announcement/build-announcement-create-form-data.ts`
- Modify: `__tests__/lib/announcement/build-announcement-create-form-data.test.ts`

**Interfaces:**
- Produces: optional `sendToMicrosoft`, `courseFilters`, `postType: 'announcement'` on FormData

- [ ] **Step 1: Extend tests**

Add cases to `__tests__/lib/announcement/build-announcement-create-form-data.test.ts`:

```typescript
it('appends send_to_microsoft and course_filters for org-wide Teams', () => {
  const fd = buildAnnouncementCreateFormData({
    title: 'T',
    dataHtml: '<p>x</p>',
    courseId: null,
    createdById: 1,
    images: [],
    sendToMicrosoft: true,
    courseFilters: { month_type: 'ALL' },
  });
  expect(fd.get('send_to_microsoft')).toBe('true');
  expect(fd.get('course_filters')).toBe(JSON.stringify({ month_type: 'ALL' }));
});
```

- [ ] **Step 2: Extend builder**

Update `BuildAnnouncementCreateFormDataArgs` and append fields when present; always append `post_type=announcement`.

- [ ] **Step 3: Run tests**

```bash
cd c:/schedjuice/schedjuice-reimagined-mobile-feat-announcement-center
pnpm test __tests__/lib/announcement/build-announcement-create-form-data.test.ts
```

- [ ] **Step 4: Commit (when user authorized)**

```bash
git add types/announcement-center.ts lib/announcement/build-announcement-create-form-data.ts __tests__/lib/announcement/build-announcement-create-form-data.test.ts
git commit -m "feat(announcement): extend mobile create form data for center"
```

---

### Task 8: Mobile — creation center screen

**Files:**
- Create: `app/(protected)/announcement-center/_layout.tsx`
- Create: `app/(protected)/announcement-center/create.tsx`
- Create: `components/announcement/announcement-creation-center-form.tsx`

**Interfaces:**
- Consumes: `buildAnnouncementCreateFormData`, `plainTextToAnnouncementDataHtml`, `makePostRequest`, `announcementsInfiniteQueryKey`
- Produces: full-screen form with scope picker; navigates back on success

- [ ] **Step 1: Stack layout**

`app/(protected)/announcement-center/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function AnnouncementCenterLayout() {
  return (
    <Stack>
      <Stack.Screen name="create" options={{ title: 'Create announcement', headerShown: true }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Form component**

Port fields from web center (scope toggle, title, multiline body, image attachments via `AnnouncementImageAttachments`). Per-course: simple course picker using existing course list hook/search. Org-wide + Microsoft: month type + optional category IDs (use `searchEntities('categories')`). Use `useMutation` + invalidate `announcementsInfiniteQueryKey(null)` and course key when applicable.

- [ ] **Step 3: Create route**

`app/(protected)/announcement-center/create.tsx` renders form inside `ScrollView`; guard with `canShowCreateAnnouncement(user)` — if false, redirect to home.

- [ ] **Step 4: Commit (when user authorized)**

```bash
git add app/(protected)/announcement-center/ components/announcement/announcement-creation-center-form.tsx
git commit -m "feat(announcement): add mobile creation center screen"
```

---

### Task 9: Mobile — nav entry (single entry point)

**Files:**
- Modify: `lib/navigation/sidebar-nav-config.ts`

**Interfaces:**
- Produces: nav link visible when `permissionsFor(user).can('announcement.manage')`

- [ ] **Step 1: Add nav item under Quick Links or Management**

```typescript
{
  title: 'Announcement Center',
  icon: Megaphone, // add import from lucide-react-native
  href: '/announcement-center/create',
  requiredPermissions: ['announcement.manage'],
},
```

Import `Megaphone` from `lucide-react-native`.

- [ ] **Step 2: Verify no other create entry points remain** (Task 10)

- [ ] **Step 3: Commit (when user authorized)**

```bash
git add lib/navigation/sidebar-nav-config.ts
git commit -m "feat(announcement): add center nav entry for admins"
```

---

### Task 10: Mobile — remove scattered create UI

**Files:**
- Modify: `components/home/home-dashboard.tsx`
- Modify: `components/navigation/top-tabs.tsx`
- Modify: `app/(protected)/(tabs)/class/course/[id]/announcement/index.tsx`
- Modify: `__tests__/components/home/home-dashboard.test.tsx`

**Interfaces:**
- Consumes: none from create sheet
- Produces: read-only announcement lists; no `CreateAnnouncementSheet` outside center route

- [ ] **Step 1: Remove from home-dashboard.tsx**

Delete imports/usages of `CreateAnnouncementSheet`, `canShowCreateAnnouncement`, FAB block on `HomeSegment.Announcements`. Keep `HomeAnnouncementsPanel` read list.

- [ ] **Step 2: Remove from top-tabs.tsx**

Delete create FAB, sheet ref/state, and `CreateAnnouncementSheet` render.

- [ ] **Step 3: Remove from course announcement index**

Delete FAB, `CreateAnnouncementSheet`, `canShowCreateAnnouncement` gate; keep list + navigation to detail.

- [ ] **Step 4: Update tests**

Adjust `home-dashboard.test.tsx` — remove mocks expecting create FAB; assert announcements panel still renders.

- [ ] **Step 5: Run tests**

```bash
pnpm test __tests__/components/home/home-dashboard.test.tsx __tests__/lib/announcement/can-show-create-announcement.test.ts
```

- [ ] **Step 6: Commit (when user authorized)**

```bash
git add components/home/home-dashboard.tsx components/navigation/top-tabs.tsx app/(protected)/(tabs)/class/course/[id]/announcement/index.tsx __tests__/components/home/home-dashboard.test.tsx
git commit -m "refactor(announcement): remove mobile create entry points outside center"
```

---

### Task 11: Mobile — i18n + nav visibility test

**Files:**
- Modify: `lib/i18n/locales/en.ts`, `lib/i18n/locales/my.ts`
- Create: `__tests__/lib/navigation/announcement-center-nav.test.ts` (optional small test)

- [ ] **Step 1: Add i18n keys**

Under `announcements.center` namespace:

```typescript
center: {
  navTitle: 'Announcement Center',
  createTitle: 'Create announcement',
  scopeOrgWide: 'Org-wide',
  scopePerCourse: 'Per course',
  selectCourse: 'Select course',
  sendToTeams: 'Send to Microsoft Teams',
  monthTypeAll: 'All courses',
  monthTypeFullMonth: 'Full month',
  monthTypeHalfMonth: 'Half month',
},
```

Copy identical strings to `my.ts`.

- [ ] **Step 2: Commit (when user authorized)**

```bash
git add lib/i18n/locales/en.ts lib/i18n/locales/my.ts __tests__/lib/navigation/
git commit -m "feat(i18n): add announcement center copy"
```

---

### Task 12: Cross-repo verification

**Files:** none new

- [ ] **Step 1: Backend tests**

```bash
cd c:/schedjuice/schedjuice-reimagined-be-feat-announcement-center
./scripts/run_backend_tests.sh app_announcement.tests -v 2 --keepdb --noinput
```

- [ ] **Step 2: Frontend gates**

```bash
cd c:/schedjuice/schedjuice-reimagined-fe-feat-announcement-center
pnpm run verify
```

- [ ] **Step 3: Mobile tests**

```bash
cd c:/schedjuice/schedjuice-reimagined-mobile-feat-announcement-center
pnpm test
```

- [ ] **Step 4: Manual acceptance checklist**

| Check | Expected |
|-------|----------|
| Web nav "Announcement Center" visible with `announcement.manage` | Opens hub list |
| Create org-wide without Teams | Appears in hub list; mobile Home tab shows it |
| Create per-course from center | Appears in course feed / mobile course announcements |
| Teacher without `announcement.manage` | No center nav; course feed composer still works on web |
| Legacy `/services/org-wide-announcements` | Redirects to hub |
| Mobile home/course tabs | No create FAB |
| Mobile nav | Opens full-screen create |
| Student Home Announcements tab | Still lists org-wide posts (read-only) |

---

## Spec self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| `announcement.manage` only for center | Tasks 5, 8, 9 |
| Scope picker org-wide / per-course | Tasks 2, 3, 8 |
| Unified org-wide + Teams form | Tasks 2, 3 |
| Course feed composer unchanged for teachers | Task 12 manual check; no FE composer edits |
| Daily lessons inline only | No task touches `CourseFeedComposer` post-type menu |
| Mobile nav-only entry | Tasks 9, 10 |
| Remove mobile FABs | Task 10 |
| Web nav + hub + create routes | Tasks 4, 5 |
| Legacy redirect option B | Task 5 |
| No new BE endpoints | Task 1 tests only |
| Student read unchanged | Task 12 checklist |
| Worktrees + matching branch | Task 0 |
| i18n my = en placeholder | Task 11 |

No placeholders or TBDs remain.

---

## Out of scope (do not implement in this plan)

- Mobile push deep-link fix for org-wide (`announcement-notification.ts` → nonexistent route)
- Web student org-wide browse page
- Consolidating edit flows into center
- Deleting `/announcements/[id]` detail routes

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-20-announcement-creation-center.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
