# Academic Admin Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a coherent card-forward Academic admin suite, with shared subject usage counts used by both Academic Hub and the Subject catalog.

**Architecture:** Add backend subject usage aggregation as the single source of truth, then wire Academic Hub and `/subjects` to that shared contract. On the frontend, add small reusable academic page primitives and apply them to the academic list pages without changing existing routes or detail/workflow internals.

**Tech Stack:** Django REST views/services/tests, Next.js 15 App Router, React 19, TanStack Query v4, nuqs, Tailwind CSS, TypeScript, existing `DataTable` where still useful.

---

## File Structure

Backend:

- Modify `schedjuice-reimagined-be/app_course/services/aggregate.py`: add reusable subject usage aggregation and update the `subject` facet branch in `build_course_aggregates`.
- Modify `schedjuice-reimagined-be/app_course/views.py`: add `CourseSubjectUsageView` for `/courses/subject-usage`.
- Modify `schedjuice-reimagined-be/app_course/urls.py`: register `courses/subject-usage`.
- Modify `schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py`: add tests for `Course.subject`, `CourseSubject`, no double-counting, current vs all-course behavior, and aggregate facet alignment.

Frontend shared:

- Create `schedjuice-reimagined-fe/src/types/subject-usage.ts`: zod schemas and TypeScript types for subject usage rows.
- Create `schedjuice-reimagined-fe/src/hooks/academic/use-subject-usage.ts`: React Query hook for `/courses/subject-usage`.
- Create `schedjuice-reimagined-fe/src/components/academic/academic-page-header.tsx`: reusable page heading/description/actions.
- Create `schedjuice-reimagined-fe/src/components/academic/academic-list-surface.tsx`: consistent page shell.
- Create `schedjuice-reimagined-fe/src/components/academic/academic-card-grid.tsx`: responsive card grid wrapper.
- Create `schedjuice-reimagined-fe/src/components/academic/subject-usage-stat.tsx`: shared usage count display.
- Create `schedjuice-reimagined-fe/src/components/academic/entity-summary-card.tsx`: generic card for program/intake/role pages.

Frontend existing:

- Modify `schedjuice-reimagined-fe/src/config/nav-routes.tsx`: add `Academic` section and remove academic items from `Management`.
- Modify `schedjuice-reimagined-fe/src/types/academic-hub.ts`: align subject facet row schema with shared subject usage fields if needed.
- Modify `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/subject-chips.tsx`: consume shared subject usage fields.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/subjects/page.tsx`: replace generic table chrome with card-forward Subject catalog.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/programs/page.tsx`: card-forward Programs page.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/intakes/page.tsx`: card-forward Intakes page.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/quizzes-v3/page.tsx`: add Academic suite header/surface and default card view.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/quizzes-v3/question-bank/page.tsx`: add Academic suite header/surface.
- Modify `schedjuice-reimagined-fe/src/app/(internal)/course-roles/page.tsx`: add Academic suite header/surface and card-forward layout.

---

### Task 1: Backend Subject Usage Tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py`

- [ ] **Step 1: Extend imports for subjects and course-subject rows**

Add `Subject` and `CourseSubject` to the model imports:

```python
from app_course.models import Category, Course, CourseSubject, Program, Subject
```

- [ ] **Step 2: Add subject fixtures to `setUp`**

Inside `with schema_context(self.schema_name):`, after program creation and before `self.base_qs`, create subjects and attach them to courses:

```python
self.math = Subject.objects.create(name=f"Math {uuid4().hex[:4]}")
self.physics = Subject.objects.create(name=f"Physics {uuid4().hex[:4]}")
self.biology = Subject.objects.create(name=f"Biology {uuid4().hex[:4]}")

self.primary_subject_course = Course.objects.create(
    title="Primary subject course",
    category=self.cat,
    program=self.prog,
    subject=self.math,
    status=Course.CourseStatus.ACTIVE,
    start_date="2024-01-01",
    end_date="2024-12-31",
)
self.multi_subject_course = Course.objects.create(
    title="Multi subject course",
    category=self.cat,
    program=self.prog,
    status=Course.CourseStatus.ACTIVE,
    start_date="2024-01-01",
    end_date="2024-12-31",
)
CourseSubject.objects.create(course=self.multi_subject_course, subject=self.physics)

self.double_linked_course = Course.objects.create(
    title="Double linked course",
    category=self.cat,
    program=self.prog,
    subject=self.biology,
    status=Course.CourseStatus.ACTIVE,
    start_date="2024-01-01",
    end_date="2024-12-31",
)
CourseSubject.objects.create(course=self.double_linked_course, subject=self.biology)

self.ended_subject_course = Course.objects.create(
    title="Ended subject course",
    category=self.cat,
    program=self.prog,
    subject=self.math,
    status=Course.CourseStatus.ENDED,
    start_date="2023-01-01",
    end_date="2023-12-31",
)
self.base_qs = Course.objects.filter(program=self.prog)
```

Keep the existing category/status tests. Their expected counts will need to account for the added courses if they reuse `self.base_qs`.

- [ ] **Step 3: Add failing tests for shared subject usage**

Append these tests to `CourseAggregateServiceTest`:

```python
def test_subject_usage_counts_primary_subject(self):
    from app_course.services.aggregate import build_subject_usage_rows

    with schema_context(self.schema_name):
        rows = build_subject_usage_rows(
            base_qs=self.base_qs,
            request_filter_params=[],
            include_all_courses=False,
        )

    by_id = {row["id"]: row for row in rows}
    self.assertEqual(by_id[self.math.id]["count"], 1)

def test_subject_usage_counts_course_subject_rows(self):
    from app_course.services.aggregate import build_subject_usage_rows

    with schema_context(self.schema_name):
        rows = build_subject_usage_rows(
            base_qs=self.base_qs,
            request_filter_params=[],
            include_all_courses=False,
        )

    by_id = {row["id"]: row for row in rows}
    self.assertEqual(by_id[self.physics.id]["count"], 1)

def test_subject_usage_does_not_double_count_same_course_subject(self):
    from app_course.services.aggregate import build_subject_usage_rows

    with schema_context(self.schema_name):
        rows = build_subject_usage_rows(
            base_qs=self.base_qs,
            request_filter_params=[],
            include_all_courses=False,
        )

    by_id = {row["id"]: row for row in rows}
    self.assertEqual(by_id[self.biology.id]["count"], 1)

def test_subject_usage_include_all_courses_adds_ended_courses(self):
    from app_course.services.aggregate import build_subject_usage_rows

    with schema_context(self.schema_name):
        active_rows = build_subject_usage_rows(
            base_qs=self.base_qs,
            request_filter_params=[],
            include_all_courses=False,
        )
        all_rows = build_subject_usage_rows(
            base_qs=self.base_qs,
            request_filter_params=[],
            include_all_courses=True,
        )

    active_by_id = {row["id"]: row for row in active_rows}
    all_by_id = {row["id"]: row for row in all_rows}
    self.assertEqual(active_by_id[self.math.id]["count"], 1)
    self.assertEqual(all_by_id[self.math.id]["count"], 2)

def test_academic_hub_subject_facet_uses_shared_subject_usage(self):
    with schema_context(self.schema_name):
        result = build_course_aggregates(
            base_qs=self.base_qs,
            request_filter_params=[],
            facets=["subject"],
        )

    by_id = {row["id"]: row for row in result["subject"]}
    self.assertEqual(by_id[self.math.id]["count"], 1)
    self.assertEqual(by_id[self.physics.id]["count"], 1)
    self.assertEqual(by_id[self.biology.id]["count"], 1)
```

- [ ] **Step 4: Run tests and verify they fail**

Run from `schedjuice-reimagined-be`:

```bash
python manage.py test app_course.tests.test_course_aggregate -v 2
```

Expected: failures because `build_subject_usage_rows` does not exist and the subject facet still only counts `Course.subject`.

- [ ] **Step 5: Commit failing tests**

```bash
git add app_course/tests/test_course_aggregate.py
git commit -m "$(cat <<'EOF'
test: capture shared subject usage expectations

EOF
)"
```

---

### Task 2: Backend Shared Subject Usage Service

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/services/aggregate.py`
- Modify: `schedjuice-reimagined-be/app_course/views.py`
- Modify: `schedjuice-reimagined-be/app_course/urls.py`
- Test: `schedjuice-reimagined-be/app_course/tests/test_course_aggregate.py`

- [ ] **Step 1: Add current status constants and subject usage helper**

In `aggregate.py`, keep the existing `Count`, `Q`, and `QuerySet` imports and add constants near `FACET_STRIP_FIELDS`:

```python
CURRENT_COURSE_STATUSES = (
    models.Course.CourseStatus.ACTIVE,
    models.Course.CourseStatus.PAUSED,
)
SUBJECT_FILTER_FIELDS = {"subject", "subject_id", "subject__id"}
```

Add the helper below `_apply_filters`:

```python
def _subject_usage_base_qs(
    base_qs: QuerySet,
    request_filter_params: list | None,
    *,
    include_all_courses: bool,
    q: str | None = None,
) -> QuerySet:
    filters = [
        fp for fp in list(request_filter_params or [])
        if fp.get("field_name") not in SUBJECT_FILTER_FIELDS
    ]
    qs = _apply_filters(base_qs, filters, q=q or None)
    if not include_all_courses:
        qs = qs.filter(status__in=CURRENT_COURSE_STATUSES)
    return qs
```

- [ ] **Step 2: Implement `build_subject_usage_rows`**

Add this function below `_subject_usage_base_qs`:

```python
def build_subject_usage_rows(
    *,
    base_qs: QuerySet,
    request_filter_params: list | None,
    include_all_courses: bool = False,
    q: str | None = None,
) -> list[dict]:
    """Return subject usage rows, counting each course once per subject."""
    qs = _subject_usage_base_qs(
        base_qs,
        request_filter_params,
        include_all_courses=include_all_courses,
        q=q,
    )
    course_ids = qs.values("id")

    subject_course_ids: dict[int, set[int]] = {}
    subject_names: dict[int, str] = {}

    for row in (
        models.Course.objects.filter(id__in=course_ids)
        .exclude(subject_id__isnull=True)
        .values("id", "subject_id", "subject__name")
    ):
        subject_id = row["subject_id"]
        subject_course_ids.setdefault(subject_id, set()).add(row["id"])
        subject_names[subject_id] = row["subject__name"]

    for row in (
        models.CourseSubject.objects.filter(course_id__in=course_ids)
        .values("course_id", "subject_id", "subject__name")
    ):
        subject_id = row["subject_id"]
        subject_course_ids.setdefault(subject_id, set()).add(row["course_id"])
        subject_names[subject_id] = row["subject__name"]

    program_rows = (
        models.Course.objects.filter(id__in=course_ids)
        .filter(
            Q(subject_id__in=subject_course_ids.keys())
            | Q(course_subjects__subject_id__in=subject_course_ids.keys())
        )
        .values(
            "subject_id",
            "course_subjects__subject_id",
            "program_id",
            "program__name",
        )
        .distinct()
    )
    programs_by_subject: dict[int, dict[int, str]] = {}
    for row in program_rows:
        for subject_id in (row["subject_id"], row["course_subjects__subject_id"]):
            if subject_id in subject_course_ids and row["program_id"] is not None:
                programs_by_subject.setdefault(subject_id, {})[row["program_id"]] = row[
                    "program__name"
                ]

    return [
        {
            "id": subject_id,
            "name": subject_names[subject_id],
            "count": len(course_ids_for_subject),
            "programs": [
                {"id": program_id, "name": name}
                for program_id, name in sorted(
                    programs_by_subject.get(subject_id, {}).items(),
                    key=lambda item: item[1],
                )
            ],
        }
        for subject_id, course_ids_for_subject in sorted(
            subject_course_ids.items(),
            key=lambda item: subject_names[item[0]].lower(),
        )
    ]
```

- [ ] **Step 3: Update Academic Hub subject facet**

Replace the `elif facet == "subject":` branch in `build_course_aggregates` with:

```python
elif facet == "subject":
    result["subject"] = build_subject_usage_rows(
        base_qs=base_qs,
        request_filter_params=filters_for_facet,
        include_all_courses=True,
        q=q or None,
    )
```

Reasoning: Academic Hub already passes its selected status filters into `request_filter_params`; the facet should not add its own active-only default.

- [ ] **Step 4: Add the subject usage view**

In `views.py`, add a view below `CourseAggregateView`:

```python
class CourseSubjectUsageView(BaseSearchView):
    """POST /courses/subject-usage - shared subject usage rows."""

    name = "Course subject usage view"
    model = models.Course
    serializer = serializers.CourseSerializer

    def post(self, request: Request):
        from app_course.course_search import get_search_q
        from app_course.services.aggregate import build_subject_usage_rows

        user = models.User.get_user_from_request(request)
        q = get_search_q(request) or None
        include_all_courses = bool(request.data.get("include_all_courses", False))

        base_qs = models.Course.objects.all()
        if not user.is_admin():
            assigned = models.UserCourse.objects.filter(user_id=user.id).values_list(
                "course_id", flat=True
            )
            created = models.Course.objects.filter(created_by=user.id).values_list(
                "id", flat=True
            )
            base_qs = base_qs.filter(id__in=list(set(list(assigned) + list(created))))

        return self.ok(
            {
                "subjects": build_subject_usage_rows(
                    base_qs=base_qs,
                    request_filter_params=request.data.get("filter_params") or [],
                    include_all_courses=include_all_courses,
                    q=q,
                )
            }
        )
```

- [ ] **Step 5: Register the endpoint**

In `urls.py`, after `courses/aggregate`, add:

```python
path(
    "courses/subject-usage",
    views.CourseSubjectUsageView.as_view(),
    name="course-subject-usage",
),
```

- [ ] **Step 6: Run backend tests**

Run from `schedjuice-reimagined-be`:

```bash
python manage.py test app_course.tests.test_course_aggregate -v 2
```

Expected: all tests in `test_course_aggregate.py` pass.

- [ ] **Step 7: Commit backend implementation**

```bash
git add app_course/services/aggregate.py app_course/views.py app_course/urls.py app_course/tests/test_course_aggregate.py
git commit -m "$(cat <<'EOF'
feat: share academic subject usage aggregation

EOF
)"
```

---

### Task 3: Frontend Shared Academic Primitives

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/subject-usage.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/academic/use-subject-usage.ts`
- Create: `schedjuice-reimagined-fe/src/components/academic/academic-page-header.tsx`
- Create: `schedjuice-reimagined-fe/src/components/academic/academic-list-surface.tsx`
- Create: `schedjuice-reimagined-fe/src/components/academic/academic-card-grid.tsx`
- Create: `schedjuice-reimagined-fe/src/components/academic/subject-usage-stat.tsx`
- Create: `schedjuice-reimagined-fe/src/components/academic/entity-summary-card.tsx`

- [ ] **Step 1: Create subject usage types**

Create `src/types/subject-usage.ts`:

```typescript
import { z } from "zod";

export const subjectUsageProgramSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const subjectUsageRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
  programs: z.array(subjectUsageProgramSchema).default([]),
});

export const subjectUsageResponseSchema = z.object({
  subjects: z.array(subjectUsageRowSchema),
});

export type SubjectUsageProgram = z.infer<typeof subjectUsageProgramSchema>;
export type SubjectUsageRow = z.infer<typeof subjectUsageRowSchema>;
export type SubjectUsageResponse = z.infer<typeof subjectUsageResponseSchema>;
```

- [ ] **Step 2: Create subject usage hook**

Create `src/hooks/academic/use-subject-usage.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import {
  SubjectUsageResponse,
  subjectUsageResponseSchema,
} from "@/types/subject-usage";
import { filterParam } from "@/types/api";

interface UseSubjectUsageArgs {
  includeAllCourses?: boolean;
  filterParams?: filterParam[];
  q?: string;
  enabled?: boolean;
}

export function useSubjectUsage({
  includeAllCourses = false,
  filterParams = [],
  q,
  enabled = true,
}: UseSubjectUsageArgs = {}) {
  return useQuery({
    queryKey: ["academic-subject-usage", includeAllCourses, filterParams, q ?? ""],
    enabled,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SubjectUsageResponse> => {
      const res = await axiosClient.post("courses/subject-usage", {
        filter_params: filterParams,
        include_all_courses: includeAllCourses,
        q: q || undefined,
      });
      const raw = res.data?.data ?? res.data;
      return subjectUsageResponseSchema.parse(raw);
    },
  });
}
```

- [ ] **Step 3: Create `AcademicPageHeader`**

Create `src/components/academic/academic-page-header.tsx`:

```tsx
import { TypographyH1 } from "@/components/typography/h1";
import { ReactNode } from "react";

interface AcademicPageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function AcademicPageHeader({
  title,
  description,
  eyebrow = "Academic",
  actions,
}: AcademicPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <TypographyH1>{title}</TypographyH1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Create `AcademicListSurface`**

Create `src/components/academic/academic-list-surface.tsx`:

```tsx
import { ReactNode } from "react";

interface AcademicListSurfaceProps {
  children: ReactNode;
  className?: string;
}

export function AcademicListSurface({ children, className = "" }: AcademicListSurfaceProps) {
  return (
    <div className={`space-y-6 rounded-2xl border bg-background p-4 shadow-sm sm:p-6 ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Create card grid wrapper**

Create `src/components/academic/academic-card-grid.tsx`:

```tsx
import { ReactNode } from "react";

interface AcademicCardGridProps {
  children: ReactNode;
}

export function AcademicCardGrid({ children }: AcademicCardGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Create subject usage stat component**

Create `src/components/academic/subject-usage-stat.tsx`:

```tsx
interface SubjectUsageStatProps {
  count?: number;
  includeAllCourses?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

export function SubjectUsageStat({
  count = 0,
  includeAllCourses = false,
  isLoading = false,
  isError = false,
}: SubjectUsageStatProps) {
  if (isLoading) return <span className="text-sm text-muted-foreground">Loading usage...</span>;
  if (isError) return <span className="text-sm text-muted-foreground">Usage unavailable</span>;

  const label = includeAllCourses ? "all-time courses" : "active courses";
  return (
    <span className="text-sm font-medium">
      {count} {label}
    </span>
  );
}
```

- [ ] **Step 7: Create generic academic summary card**

Create `src/components/academic/entity-summary-card.tsx`:

```tsx
import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EntitySummaryCardProps {
  title: string;
  href: string;
  description?: string | null;
  meta?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function EntitySummaryCard({
  title,
  href,
  description,
  meta,
  footer,
  className,
}: EntitySummaryCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition hover:border-primary/40 hover:shadow-md",
        className,
      )}
    >
      <div className="space-y-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
        ) : null}
        {meta ? <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{meta}</div> : null}
        {footer ? <div className="pt-2 text-sm">{footer}</div> : null}
      </div>
    </Link>
  );
}
```

- [ ] **Step 8: Run frontend lint for new files**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: no lint errors from the new shared components.

- [ ] **Step 9: Commit shared frontend primitives**

```bash
git add src/types/subject-usage.ts src/hooks/academic/use-subject-usage.ts src/components/academic
git commit -m "$(cat <<'EOF'
feat: add shared academic UI primitives

EOF
)"
```

---

### Task 4: Academic Sidebar IA

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/nav-routes.tsx`

- [ ] **Step 1: Add an Academic nav section**

In `nav-routes.tsx`, add a new top-level object after Quick Links:

```tsx
{
  title: "Academic",
  icon: School,
  allowedRoles: [
    role.superadmin,
    role.admin,
    role.manager,
    role.teacher,
    role.finance,
    role.hr,
    role.student,
  ],
  children: [
    {
      title: "Academic Hub",
      icon: BookOpen,
      href: "/courses",
      allowedRoles: [
        role.superadmin,
        role.admin,
        role.manager,
        role.teacher,
        role.finance,
        role.hr,
        role.student,
      ],
    },
    {
      title: "Programs",
      icon: Braces,
      href: "/programs",
      allowedRoles: [role.superadmin, role.admin, role.manager],
    },
    {
      title: "Subjects",
      icon: BookMarked,
      href: "/subjects",
      allowedRoles: [role.superadmin, role.admin, role.manager],
    },
    {
      title: "Intakes",
      icon: Calendar,
      href: "/intakes",
      allowedRoles: [role.superadmin, role.admin, role.manager],
    },
    {
      title: "Quizzes",
      icon: ClipboardCheck,
      href: "/quizzes-v3",
      allowedRoles: [role.superadmin, role.admin, role.manager, role.teacher],
    },
    {
      title: "Question Bank",
      icon: Library,
      href: "/quizzes-v3/question-bank",
      allowedRoles: [role.superadmin, role.admin, role.manager, role.teacher],
    },
    {
      title: "Course Roles",
      icon: GraduationCap,
      href: "/course-roles",
      allowedRoles: [role.superadmin, role.admin, role.manager],
    },
  ],
},
```

- [ ] **Step 2: Remove moved items from Management**

Delete these child entries from the existing `Management` section:

```tsx
Academic Hub
Quizzes
Question Bank
Subjects
Programs
Intakes
Course Roles
```

Keep `Users`, teacher-only `Students`, `Categories`, and `Student Registration` in `Management`.

- [ ] **Step 3: Verify route title behavior**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: no TypeScript/ESLint errors.

- [ ] **Step 4: Commit sidebar IA**

```bash
git add src/config/nav-routes.tsx
git commit -m "$(cat <<'EOF'
feat: group academic admin navigation

EOF
)"
```

---

### Task 5: Subject Catalog Page

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/subjects/page.tsx`
- Use: `schedjuice-reimagined-fe/src/hooks/academic/use-subject-usage.ts`
- Use: `schedjuice-reimagined-fe/src/components/academic/*`

- [ ] **Step 1: Replace subject page imports**

Replace the current imports in `subjects/page.tsx` with:

```tsx
"use client";

import { AcademicCardGrid } from "@/components/academic/academic-card-grid";
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import { AcademicPageHeader } from "@/components/academic/academic-page-header";
import { EntitySummaryCard } from "@/components/academic/entity-summary-card";
import { SubjectUsageStat } from "@/components/academic/subject-usage-stat";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSubjectUsage } from "@/hooks/academic/use-subject-usage";
import Link from "next/link";
import { parseAsBoolean, useQueryState } from "nuqs";
```

- [ ] **Step 2: Replace page body**

Replace the component with:

```tsx
const SubjectListPage: React.FC = () => {
  const [includeAllCourses, setIncludeAllCourses] = useQueryState(
    "allCourses",
    parseAsBoolean.withDefault(false),
  );
  const usage = useSubjectUsage({ includeAllCourses });
  const subjects = usage.data?.subjects ?? [];

  return (
    <div className="space-y-6">
      <AcademicPageHeader
        title="Subject catalog"
        description="Subjects used across your programs and courses."
        actions={
          <Link href="/subjects/create">
            <Button>Create subject</Button>
          </Link>
        }
      />

      <AcademicListSurface>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Usage overview</h2>
            <p className="text-sm text-muted-foreground">
              Default counts show active courses. Toggle all courses to include planned and ended history.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={includeAllCourses}
              onCheckedChange={setIncludeAllCourses}
              aria-label="Show all courses"
            />
            Show all courses
          </label>
        </div>

        {usage.isError ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Usage unavailable. You can still create and manage subjects.
          </div>
        ) : null}

        <AcademicCardGrid>
          {(usage.isLoading ? [] : subjects).map((subject) => {
            const programNames = subject.programs.map((program) => program.name);
            const programSummary =
              programNames.length === 0
                ? "No active program usage"
                : programNames.length <= 2
                  ? `Used in ${programNames.join(", ")}`
                  : `Used in ${programNames.length} programs`;

            return (
              <EntitySummaryCard
                key={subject.id}
                title={subject.name}
                href={`/subjects/${subject.id}`}
                description={programSummary}
                footer={
                  <SubjectUsageStat
                    count={subject.count}
                    includeAllCourses={includeAllCourses}
                    isError={usage.isError}
                  />
                }
              />
            );
          })}
        </AcademicCardGrid>

        {usage.isLoading ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Loading subject usage...
          </div>
        ) : null}
        {!usage.isLoading && subjects.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No subjects found. Create a subject to start building your academic catalog.
          </div>
        ) : null}
      </AcademicListSurface>
    </div>
  );
};

export default SubjectListPage;
```

- [ ] **Step 3: Run lint**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: no lint errors in `subjects/page.tsx`.

- [ ] **Step 4: Commit subject catalog**

```bash
git add src/app/(internal)/subjects/page.tsx
git commit -m "$(cat <<'EOF'
feat: refresh subject catalog usage page

EOF
)"
```

---

### Task 6: Academic Hub Subject Count Alignment

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/academic-hub.ts`
- Modify: `schedjuice-reimagined-fe/src/components/academic-hub/filter-bar/subject-chips.tsx`

- [ ] **Step 1: Extend hub facet schema**

In `types/academic-hub.ts`, replace `hubFacetRowSchema` with:

```typescript
export const hubFacetProgramSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const hubFacetRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
  programs: z.array(hubFacetProgramSchema).optional(),
});
```

- [ ] **Step 2: Keep subject chips focused**

No visual change is required in `subject-chips.tsx`; it can continue rendering `row.name` and `row.count`. Update the row type to the shared usage type:

```typescript
import { SubjectUsageRow } from "@/types/subject-usage";

interface Props {
  rows?: SubjectUsageRow[];
  selected: string[];
  onChange: (next: string[]) => void;
  isLoading?: boolean;
}
```

- [ ] **Step 3: Run lint**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: no lint errors.

- [ ] **Step 4: Commit hub type alignment**

```bash
git add src/types/academic-hub.ts src/components/academic-hub/filter-bar/subject-chips.tsx
git commit -m "$(cat <<'EOF'
fix: align hub subject facets with shared usage rows

EOF
)"
```

---

### Task 7: Programs, Intakes, And Course Roles Card Refresh

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/programs/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/intakes/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/course-roles/page.tsx`

- [ ] **Step 1: Refresh Programs page shell**

In `programs/page.tsx`, replace header imports with academic primitives and keep `DataTable` as a card-capable list until a dedicated program card exists:

```tsx
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import { AcademicPageHeader } from "@/components/academic/academic-page-header";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import Link from "next/link";
```

Replace the returned JSX with:

```tsx
return (
  <div className="space-y-6">
    <AcademicPageHeader
      title="Programs"
      description="Programs define how courses are organized, created, and connected to levels, subjects, and intakes."
      actions={
        <Link href="/programs/create">
          <Button>Create program</Button>
        </Link>
      }
    />
    <AcademicListSurface>
      <DataTable
        uid="programs"
        entity="programs"
        baseDetailsPath="/programs"
        defaultViewMode="card"
        isViewModeEditable
      />
    </AcademicListSurface>
  </div>
);
```

- [ ] **Step 2: Refresh Intakes page shell**

In `intakes/page.tsx`, replace the JSX with:

```tsx
return (
  <div className="space-y-6">
    <AcademicPageHeader
      title="Intakes"
      description="Review and manage cohorts or terms within programs. Course creation still starts from the program-centered Add classes flow."
      actions={
        <Link href="/intakes/create">
          <Button>Schedule intake</Button>
        </Link>
      }
    />
    <AcademicListSurface>
      <DataTable
        uid="intakes"
        entity="intakes"
        baseDetailsPath="/intakes"
        defaultViewMode="card"
        isViewModeEditable
      />
    </AcademicListSurface>
  </div>
);
```

Use the same import pattern from Programs.

- [ ] **Step 3: Refresh Course Roles page shell**

In `course-roles/page.tsx`, replace the JSX with:

```tsx
return (
  <div className="space-y-6">
    <AcademicPageHeader
      title="Course roles"
      description="Define the roles people can hold inside courses, such as teaching, assisting, or coordinating."
      actions={
        <Link
          href="/course-roles/create"
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Create course role
        </Link>
      }
    />
    <AcademicListSurface>
      <DataTable
        uid="course-roles"
        entity="assigned-as-roles"
        baseDetailsPath="/course-roles"
        defaultViewMode="card"
        isViewModeEditable
      />
    </AcademicListSurface>
  </div>
);
```

- [ ] **Step 4: Run lint**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: no lint errors in the three refreshed pages.

- [ ] **Step 5: Commit academic list refresh**

```bash
git add src/app/(internal)/programs/page.tsx src/app/(internal)/intakes/page.tsx src/app/(internal)/course-roles/page.tsx
git commit -m "$(cat <<'EOF'
feat: refresh academic structure list pages

EOF
)"
```

---

### Task 8: Quizzes And Question Bank Academic Framing

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/quizzes-v3/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/quizzes-v3/question-bank/page.tsx`

- [ ] **Step 1: Add academic shell to quizzes page**

In `quizzes-v3/page.tsx`, add imports:

```tsx
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import { AcademicPageHeader } from "@/components/academic/academic-page-header";
```

Replace the fragment wrapper with:

```tsx
return (
  <div className="space-y-6">
    <AcademicPageHeader
      title="Quizzes"
      description="Create and manage academic assessments that can be assigned to courses and classes."
      actions={
        <>
          <Link
            href="/quizzes-v3/question-bank"
            className={cn(buttonVariants({ variant: "outline", size: "default" }), "gap-2")}
          >
            Question Bank
          </Link>
          <Link
            href="/quizzes-v3/create"
            className={cn(buttonVariants({ variant: "default", size: "default" }), "gap-2")}
          >
            Create quiz
          </Link>
        </>
      }
    />
    <AcademicListSurface>
      <DataTable
        queryParams={{
          ...queryParamDefault,
          sorts: ["-created_at"],
          expand: ["category", "created_by"],
        }}
        getDataFilterParams={{
          filter_params: [
            {
              field_name: "course",
              operator: operatorEnum.isnull,
              value: "true",
            },
          ],
        }}
        isCsvExportable={false}
        uid="quizzes-v3-list"
        entity="quizzes"
        baseDetailsPath="/quizzes-v3"
        isViewModeEditable
        defaultViewMode="card"
        cardRenderFunction={(row) => (
          <QuizCard quizRow={row} baseDetailsPath="/quizzes-v3" />
        )}
      />
    </AcademicListSurface>
  </div>
);
```

- [ ] **Step 2: Add academic shell to question bank**

In `quizzes-v3/question-bank/page.tsx`, add imports:

```tsx
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import { AcademicPageHeader } from "@/components/academic/academic-page-header";
```

Wrap the existing filter row and `DataTable`:

```tsx
return (
  <div className="space-y-6">
    <AcademicPageHeader
      title="Question Bank"
      description="Browse reusable questions that back quizzes and assessments."
      actions={
        <Link
          href="/quizzes-v3"
          className={cn(buttonVariants({ variant: "outline", size: "default" }), "gap-2")}
        >
          Back to quizzes
        </Link>
      }
    />
    <AcademicListSurface>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="qb-type">Question type</Label>
            <Select value={questionTypeFilter} onValueChange={setQuestionTypeFilter}>
              <SelectTrigger id="qb-type" className="w-[220px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="SINGLE_CHOICE">Single choice</SelectItem>
                <SelectItem value="MULTIPLE_CHOICE">Multiple choice</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DataTable
        uid="quiz-questions-bank"
        entity="quiz-questions"
        baseDetailsPath="/quizzes-v3"
        queryParams={{
          ...queryParamDefault,
          sorts: ["-created_at"],
        }}
        getDataFilterParams={getDataFilterParams}
        isCsvExportable={false}
        defaultViewMode="card"
        isViewModeEditable
        actionButtonRender={(row: Row<QuestionBankRow>) => {
          const quizId = row.original.quiz?.id;
          if (quizId == null) {
            return null;
          }
          return (
            <Link
              href={`/quizzes-v3/${quizId}/edit`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "inline-flex",
              )}
              aria-label="Open quiz editor"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          );
        }}
      />
    </AcademicListSurface>
  </div>
);
```

Keep the existing `Row`, `ArrowRight`, `Link`, `cn`, and `buttonVariants` imports used by this callback.

- [ ] **Step 3: Run lint**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: no lint errors in quiz pages.

- [ ] **Step 4: Commit quiz framing**

```bash
git add src/app/(internal)/quizzes-v3/page.tsx src/app/(internal)/quizzes-v3/question-bank/page.tsx
git commit -m "$(cat <<'EOF'
feat: refresh academic quiz list pages

EOF
)"
```

---

### Task 9: Final Verification

**Files:**
- Verify all files changed in prior tasks.

- [ ] **Step 1: Run backend aggregate tests**

Run from `schedjuice-reimagined-be`:

```bash
python manage.py test app_course.tests.test_course_aggregate -v 2
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend lint**

Run from `schedjuice-reimagined-fe`:

```bash
npm run lint
```

Expected: no lint errors.

- [ ] **Step 3: Run frontend unit tests**

Run from `schedjuice-reimagined-fe`:

```bash
npm run test:unit
```

Expected: existing unit tests pass.

- [ ] **Step 4: Manual QA in browser**

Start or reuse the frontend dev server, then verify:

```bash
npm run dev
```

Manual checks:

- Sidebar shows `Academic` with `Academic Hub`, `Programs`, `Subjects`, `Intakes`, `Quizzes`, `Question Bank`, and `Course Roles`.
- `Management` no longer contains those academic items.
- `/courses` is still labeled `Academic Hub`.
- `/subjects` shows `Subject catalog`, subject cards, active course usage, and the `Show all courses` toggle.
- A multi-subject course represented through `CourseSubject` contributes to both Academic Hub subject counts and `/subjects` usage.
- `/programs`, `/intakes`, `/quizzes-v3`, `/quizzes-v3/question-bank`, and `/course-roles` use the academic page framing and remain navigable.
- Existing create/edit/detail links still open.

- [ ] **Step 5: Final commit if verification required fixes**

If verification required small fixes, commit them:

```bash
git add .
git commit -m "$(cat <<'EOF'
fix: polish academic admin refresh

EOF
)"
```

