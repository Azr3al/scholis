# Program-centered course create — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stepper/modal course create flow with a URL-driven unified “Add classes” experience that branches by program config, supports per-level curriculum for K-12 multi-subject intakes, and deletes all modal create code.

**Architecture:** Backend adds `ProgramLevelSubject` and `level_subject_ids` generation payload; frontend uses thin Next.js routes under `/courses/create/...` with shared `CreateFlowProvider` context and hand-composed step components in `src/components/scheduling/`. No `auto-form.tsx` in create flows.

**Tech Stack:** Django REST (`schedjuice-reimagined-be`), Next.js App Router + React Hook Form + TanStack Query (`schedjuice-reimagined-fe`), existing `EntityCombobox` / `makePostRequest` client API.

**Design spec:** `docs/superpowers/specs/2026-05-21-program-centered-course-create-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_course/models.py` | Add `ProgramLevelSubject` |
| `app_course/migrations/0082_programlevelsubject.py` | Schema migration |
| `app_course/serializers.py` | `ProgramLevelSubjectSerializer`, `intake_count` on `ProgramSerializer` |
| `app_course/views.py` | CRUD views for program-level-subjects |
| `app_course/urls.py` | Route registration |
| `app_course/intake_services.py` | Per-level `CourseSubject` creation |
| `app_course/tests/test_program_intake.py` | Generation + model tests |
| `app_organization/serializers.py` | `program_count` on public org payload |
| `src/types/program.ts` | `ProgramLevelSubject` + extended program type |
| `src/types/organization.ts` | `program_count` |
| `src/components/scheduling/create-flow-context.tsx` | Draft state + sessionStorage |
| `src/components/scheduling/program-picker.tsx` | Multi-program hub |
| `src/components/scheduling/manual-course-form.tsx` | Hand-composed manual create |
| `src/components/scheduling/intake/*.tsx` | Intake wizard steps |
| `src/helpers/intake-preview.ts` | Group preview rows by level |
| `src/app/(internal)/courses/create/**` | URL route tree |
| DELETE: `@modal/`, `course-create-form.tsx`, `intake-create-wizard.tsx`, `course-program-field-config.tsx` | Legacy removal |

---

## Task 1: `ProgramLevelSubject` model + migration

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/models.py` (after `ProgramSubject`)
- Create: `schedjuice-reimagined-be/app_course/migrations/0082_programlevelsubject.py`
- Test: `schedjuice-reimagined-be/app_course/tests/test_program_intake.py`

- [ ] **Step 1: Write the failing test**

Add to `test_program_intake.py`:

```python
from app_course.models import ProgramLevelSubject

def test_program_level_subject_unique_per_level(self):
    with schema_context(self.schema_name):
        program = Program.objects.create(
            name=f"K12 {uuid4().hex[:6]}",
            course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            subject_strategy=Program.SubjectStrategy.MULTI,
        )
        level = ProgramLevel.objects.create(program=program, name="Year 6")
        subject = Subject.objects.create(name=f"Math {uuid4().hex[:4]}")
        ProgramLevelSubject.objects.create(level=level, subject=subject, sort_order=0)
        with self.assertRaises(Exception):
            ProgramLevelSubject.objects.create(level=level, subject=subject, sort_order=1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_program_intake.ProgramIntakeTest.test_program_level_subject_unique_per_level -v 2`

Expected: FAIL — `ImportError: cannot import name 'ProgramLevelSubject'`

- [ ] **Step 3: Add model**

In `models.py` after `ProgramSubject`:

```python
class ProgramLevelSubject(BaseModel):
    level = models.ForeignKey(
        ProgramLevel, on_delete=models.CASCADE, related_name="level_subjects"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="program_level_subjects"
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["level", "subject"],
                name="uniq_program_level_subject_level_subject",
            )
        ]
```

Run: `python manage.py makemigrations app_course --name programlevelsubject`

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test app_course.tests.test_program_intake.ProgramIntakeTest.test_program_level_subject_unique_per_level -v 2`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_course/models.py app_course/migrations/0082_programlevelsubject.py app_course/tests/test_program_intake.py
git commit -m "feat: add ProgramLevelSubject model for per-level curriculum"
```

---

## Task 2: ProgramLevelSubject API (serializer + views + urls)

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/serializers.py`
- Modify: `schedjuice-reimagined-be/app_course/views.py`
- Modify: `schedjuice-reimagined-be/app_course/urls.py`

- [ ] **Step 1: Add serializer** (mirror `ProgramSubjectSerializer`)

```python
class ProgramLevelSubjectSerializer(BaseModelSerializer):
    class Meta:
        model = models.ProgramLevelSubject
        fields = "__all__"
        expandable_fields = {
            "level": "app_course.serializers.ProgramLevelSerializer",
            "subject": "app_course.serializers.SubjectSerializer",
        }
```

- [ ] **Step 2: Add views** (copy pattern from `ProgramSubjectListView` / `ProgramSubjectDetailsView`)

```python
class ProgramLevelSubjectListView(BaseListView):
    name = "ProgramLevelSubject list view"
    model = models.ProgramLevelSubject
    serializer = serializers.ProgramLevelSubjectSerializer

class ProgramLevelSubjectDetailsView(BaseDetailsView):
    name = "ProgramLevelSubject details view"
    model = models.ProgramLevelSubject
    serializer = serializers.ProgramLevelSubjectSerializer
```

- [ ] **Step 3: Register urls** (after `program-subjects` block)

```python
path("program-level-subjects", views.ProgramLevelSubjectListView.as_view(), name="program-level-subject-list"),
path(
    "program-level-subjects/<int:obj_id>",
    views.ProgramLevelSubjectDetailsView.as_view(),
    name="program-level-subject-details",
),
```

- [ ] **Step 4: Smoke test via Django shell**

Run: `python manage.py shell -c "from app_course.models import ProgramLevelSubject; print(ProgramLevelSubject._meta.db_table)"`

Expected: prints table name without error

- [ ] **Step 5: Commit**

```bash
git add app_course/serializers.py app_course/views.py app_course/urls.py
git commit -m "feat: add program-level-subjects CRUD endpoints"
```

---

## Task 3: Per-level generation in `intake_services`

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/intake_services.py`
- Test: `schedjuice-reimagined-be/app_course/tests/test_program_intake.py`

- [ ] **Step 1: Write failing test**

```python
def test_generate_intake_courses_uses_level_subject_ids(self):
    with schema_context(self.schema_name):
        category = Category.objects.first()
        program = Program.objects.create(
            name=f"K12 gen {uuid4().hex[:6]}",
            course_creation_method=Program.CourseCreationMethod.INTAKE_BASED,
            subject_strategy=Program.SubjectStrategy.MULTI,
        )
        y6 = ProgramLevel.objects.create(program=program, name="Year 6")
        y7 = ProgramLevel.objects.create(program=program, name="Year 7")
        ProgramLevelSection.objects.create(level=y6, name="A")
        ProgramLevelSection.objects.create(level=y7, name="A")
        s_math = Subject.objects.create(name=f"Math {uuid4().hex[:4]}")
        s_phys = Subject.objects.create(name=f"Phys {uuid4().hex[:4]}")
        intake = Intake.objects.create(
            name="T1", program=program,
            start_date="2026-01-01", end_date="2026-06-30",
        )
        from app_course.intake_services import generate_intake_courses
        from app_course.models import CourseSubject

        def _create(payload):
            return CourseSerializer(context={}).create(payload)

        ids = generate_intake_courses(
            intake,
            overrides=None,
            defaults={
                "category_id": category.id,
                "level_subject_ids": {
                    str(y6.id): [s_math.id],
                    str(y7.id): [s_math.id, s_phys.id],
                },
            },
            course_serializer_create=_create,
        )
        self.assertEqual(len(ids), 2)
        y6_course = Course.objects.get(level_id=y6.id)
        y7_course = Course.objects.get(level_id=y7.id)
        self.assertEqual(CourseSubject.objects.filter(course=y6_course).count(), 1)
        self.assertEqual(CourseSubject.objects.filter(course=y7_course).count(), 2)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `python manage.py test app_course.tests.test_program_intake.ProgramIntakeTest.test_generate_intake_courses_uses_level_subject_ids -v 2`

- [ ] **Step 3: Update `generate_intake_courses`**

Replace the `subject_ids` block with:

```python
level_subject_ids = defaults.get("level_subject_ids") or {}
# reject legacy flat bundle for multi strategy
if program.subject_strategy == Program.SubjectStrategy.MULTI:
    if defaults.get("subject_ids"):
        raise ValueError(
            "Use defaults.level_subject_ids for multi subject strategy; subject_ids is deprecated."
        )

# inside the per-row loop, after course = course_serializer_create(payload):
if program.subject_strategy == Program.SubjectStrategy.MULTI:
    level_key = str(level_id) if level_id else None
    subject_ids = (
        level_subject_ids.get(level_key)
        or level_subject_ids.get(level_id)
        or []
    )
    for i, sid in enumerate(subject_ids):
        CourseSubject.objects.create(
            course_id=course.id, subject_id=int(sid), sort_order=i
        )
```

Remove the old flat `subject_ids` loop entirely.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add app_course/intake_services.py app_course/tests/test_program_intake.py
git commit -m "feat: generate CourseSubjects from per-level subject map"
```

---

## Task 4: `program_count` and `intake_count` API fields

**Files:**
- Modify: `schedjuice-reimagined-be/app_organization/serializers.py`
- Modify: `schedjuice-reimagined-be/app_course/serializers.py`

- [ ] **Step 1: Add `program_count` to OrganizationSerializer**

```python
program_count = serializers.SerializerMethodField(read_only=True)

def get_program_count(self, obj):
    from app_course.models import Program
    return Program.objects.filter(is_active=True).count()
```

Add `"program_count"` to serializer `Meta.fields` via explicit `fields` list or ensure it's not excluded.

- [ ] **Step 2: Add `intake_count` to ProgramSerializer**

```python
intake_count = serializers.SerializerMethodField(read_only=True)

def get_intake_count(self, obj):
    return obj.intakes.count()
```

- [ ] **Step 3: Update frontend types**

In `src/types/organization.ts`, add to schema:

```typescript
program_count: z.number().optional(),
```

In `src/types/program.ts`, extend `programSchema`:

```typescript
intake_count: z.number().optional(),
```

Add:

```typescript
export const programLevelSubjectSchema = z.object({
  id: z.number(),
  level: z.number(),
  subject: z.union([z.number(), z.object({ id: z.number(), name: z.string() })]),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});
```

- [ ] **Step 4: Verify org public returns count**

Run backend, hit `GET organizations/public` on tenant domain; confirm `program_count` present.

- [ ] **Step 5: Commit (both repos' type files + backend serializers)**

```bash
git commit -m "feat: expose program_count and intake_count for create flow routing"
```

---

## Task 5: Delete modal create + simplify courses layout

**Files:**
- Delete: `src/app/(internal)/courses/@modal/(.)create/page.tsx` and `@modal` directory
- Modify: `src/app/(internal)/courses/layout.tsx`
- Modify: `src/app/(internal)/courses/page.tsx`

- [ ] **Step 1: Delete modal route directory**

```bash
rm -rf src/app/(internal)/courses/@modal
```

- [ ] **Step 2: Replace `courses/layout.tsx`**

```tsx
export default function CoursesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Fix courses list button**

In `page.tsx`, replace:

```typescript
const openCreateModal = () => {
  router.push("/courses/create?modal=create");
};
```

with:

```typescript
const openCreate = () => {
  router.push("/courses/create");
};
```

Update `onClick={openCreate}` and button label to **Add classes** (optional copy tweak).

- [ ] **Step 4: Grep for leftover modal references**

Run: `rg "@modal|modal=create|isModal" src/`

Expected: no matches (fix any stragglers)

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: remove course create modal parallel route"
```

---

## Task 6: `CreateFlowProvider` + create layout

**Files:**
- Create: `src/components/scheduling/create-flow-context.tsx`
- Create: `src/components/scheduling/create-flow-chrome.tsx`
- Create: `src/app/(internal)/courses/create/layout.tsx`

- [ ] **Step 1: Create context**

```typescript
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { IntakePreviewCourseRow } from "@/types/intake";

const STORAGE_KEY = "schedjuice:create-flow";

export type CreateFlowState = {
  programId?: number;
  intakeName?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: number;
  intakeId?: number;
  levelSubjectOverrides?: Record<number, number[]>;
  previewRows?: IntakePreviewCourseRow[];
  titleEdits?: Record<string, string>;
  excluded?: Record<string, boolean>;
};

type CreateFlowContextValue = {
  state: CreateFlowState;
  setState: (patch: Partial<CreateFlowState>) => void;
  reset: () => void;
};

const CreateFlowContext = createContext<CreateFlowContextValue | null>(null);

function loadState(): CreateFlowState {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CreateFlowState) : {};
  } catch {
    return {};
  }
}

export function CreateFlowProvider({ children }: { children: ReactNode }) {
  const [state, setStateInner] = useState<CreateFlowState>({});

  useEffect(() => {
    setStateInner(loadState());
  }, []);

  const setState = useCallback((patch: Partial<CreateFlowState>) => {
    setStateInner((prev) => {
      const next = { ...prev, ...patch };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setStateInner({});
  }, []);

  const value = useMemo(
    () => ({ state, setState, reset }),
    [state, setState, reset],
  );

  return (
    <CreateFlowContext.Provider value={value}>
      {children}
    </CreateFlowContext.Provider>
  );
}

export function useCreateFlow() {
  const ctx = useContext(CreateFlowContext);
  if (!ctx) throw new Error("useCreateFlow must be used within CreateFlowProvider");
  return ctx;
}
```

- [ ] **Step 2: Create chrome** (breadcrumb + cancel)

`create-flow-chrome.tsx` — renders `BackButton`, program name from query, Cancel → `/courses` + `reset()`.

- [ ] **Step 3: Create layout**

```tsx
import { CreateFlowProvider } from "@/components/scheduling/create-flow-context";
import { CreateFlowChrome } from "@/components/scheduling/create-flow-chrome";

export default function CourseCreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CreateFlowProvider>
      <div className="space-y-6 p-6 max-w-4xl">
        <CreateFlowChrome />
        {children}
      </div>
    </CreateFlowProvider>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add CreateFlowProvider for URL-driven create wizard"
```

---

## Task 7: Program gate + picker pages

**Files:**
- Create: `src/components/scheduling/program-picker.tsx`
- Modify: `src/app/(internal)/courses/create/page.tsx`
- Create: `src/app/(internal)/courses/create/program/[programId]/page.tsx`

- [ ] **Step 1: Program picker component**

Fetch active programs via `useGetAllEntitiesQuery("programs", { fields: [...], filter is_active })`. Render clickable cards → `router.push(/courses/create/program/${id})`.

- [ ] **Step 2: `/courses/create/page.tsx`**

```tsx
"use client";

import { useTenant } from "@/hooks/useTenant";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProgramPicker } from "@/components/scheduling/program-picker";
import { useGetAllEntitiesQuery } from "@/components/form/entity-combobox";

export default function CourseCreateGatePage() {
  const { tenant } = useTenant();
  const router = useRouter();
  const programCount = tenant?.program_count;

  const programsQuery = useGetAllEntitiesQuery("programs", {
    fields: ["id", "name", "is_active"],
    sorts: ["name"],
  });
  const activePrograms = (programsQuery.data?.data?.data ?? []).filter(
    (p: { is_active?: boolean }) => p.is_active !== false,
  );

  useEffect(() => {
    const count = programCount ?? activePrograms.length;
    if (count === 1 && activePrograms[0]?.id) {
      router.replace(`/courses/create/program/${activePrograms[0].id}`);
    }
  }, [programCount, activePrograms, router]);

  if ((programCount ?? activePrograms.length) === 1) return null;

  if (activePrograms.length === 0) {
    return <p>No programs configured. Create a program first.</p>;
  }

  return <ProgramPicker programs={activePrograms} />;
}
```

- [ ] **Step 3: Program redirect hub**

`program/[programId]/page.tsx` — fetch program with `intake_count`, `course_creation_method`; `redirect()` to `/manual` or `/intake/structure` or `/intake/dates`.

Use `fetchEntity("programs", programId)` in client component + `useEffect` redirect, or server component with async fetch if API supports SSR cookies.

- [ ] **Step 4: Manual QA** — multi-program tenant shows picker; single-program redirects.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add program gate and redirect hub for create flow"
```

---

## Task 8: Manual course form (hand-composed)

**Files:**
- Create: `src/components/scheduling/manual-course-form.tsx`
- Create: `src/app/(internal)/courses/create/program/[programId]/manual/page.tsx`
- Delete later: `src/components/course/course-create-form.tsx`

- [ ] **Step 1: Create page wrapper**

```tsx
"use client";

import { ManualCourseForm } from "@/components/scheduling/manual-course-form";
import { useParams } from "next/navigation";

export default function ManualCourseCreatePage() {
  const { programId } = useParams<{ programId: string }>();
  return <ManualCourseForm programId={programId} />;
}
```

- [ ] **Step 2: Implement `ManualCourseForm`**

Single `useForm` with `partiallyOmittedCourseSchema` + `zodResolver`. Explicit sections:

- Read-only program name (`fetchEntity`)
- Identity: title, description, category (`EntityCombobox`)
- Program fields: inline JSX using `shouldShowCourseProgramField` / `isCourseProgramFieldRequired` — copy combobox patterns from `course-program-field-config.tsx` but **without** `AutoFormInputComponentProps`
- Schedule: `YearMonthSelector` or date pickers + duration presets (port from old form)
- Details: iterate org `course_fields` excluding program-scoped keys already rendered
- Submit: `validateCourseProgramFields` → `sanitizeCoursePayloadForProgram` → `makePostRequest("courses", payload)` → `router.push(/courses/${id}/edit)`

- [ ] **Step 3: Remove dependency on `getObjectFormSchema` / `AutoFormObject`**

Form must not import from `@/components/ui/auto-form`.

- [ ] **Step 4: Manual QA** — create manual-program course end-to-end.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add hand-composed manual course create form"
```

---

## Task 9: Intake wizard — layout guards + dates/subjects steps

**Files:**
- Create: `src/app/(internal)/courses/create/program/[programId]/intake/layout.tsx`
- Create: `src/components/scheduling/intake/intake-step-nav.tsx`
- Create: `src/components/scheduling/intake/dates-step.tsx`
- Create: `src/components/scheduling/intake/level-subjects-step.tsx`
- Create: `src/app/(internal)/courses/create/program/[programId]/intake/dates/page.tsx`
- Create: `src/app/(internal)/courses/create/program/[programId]/intake/subjects/page.tsx`

- [ ] **Step 1: Intake layout with guards**

Client layout loads program; if path includes `/structure` and `intake_count > 0` → `router.replace(.../dates)`; if path includes `/dates` and first intake + zero levels → `router.replace(.../structure)`.

- [ ] **Step 2: Dates step**

Fields: intake name, start/end date, default category. On Continue → `setState({ intakeName, startDate, endDate, categoryId })` → navigate to next step (`subjects` for first intake after structure, or `subjects` after dates for returning — see spec order).

**First intake order:** structure → subjects → dates → preview → confirm  
**Returning order:** dates → subjects → preview → confirm

Implement `intake-step-nav.tsx` with `getIntakeSteps(program.intake_count)` returning ordered paths.

- [ ] **Step 3: Level subjects step**

For each level (fetch `program-levels` filtered by program):
- Load existing `program-level-subjects` filtered by level
- Render chip multi-select per level
- "+ Add subject" → `EntityCombobox` on `subjects` entity; on select POST `program-level-subjects`
- On Continue → `setState({ levelSubjectOverrides: { [levelId]: subjectIds } })`

Pre-fill from DB; overrides stored in context for generate payload.

- [ ] **Step 4: Wire pages** to step components.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add intake dates and per-level subjects steps"
```

---

## Task 10: Intake structure step (first intake only)

**Files:**
- Create: `src/components/scheduling/intake/structure-step.tsx`
- Create: `src/app/(internal)/courses/create/program/[programId]/intake/structure/page.tsx`

- [ ] **Step 1: Extract reusable editor**

Refactor `ProgramLevelsEditor` + `ProgramLevelSectionEditor` internals into shared `ProgramStructureEditor` used by both program settings and intake structure step — **or** import existing editors directly with `programId` prop (minimal diff).

- [ ] **Step 2: Structure page**

Render editor + Continue → `/intake/subjects`.

- [ ] **Step 3: Guard** — page redirects to `/intake/dates` if `intake_count > 0`.

- [ ] **Step 4: QA** — first intake can add Year 6/A,B inline.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add first-intake structure step to create flow"
```

---

## Task 11: Preview + confirm steps

**Files:**
- Create: `src/helpers/intake-preview.ts`
- Create: `src/components/scheduling/intake/course-preview-step.tsx`
- Create: `src/components/scheduling/intake/confirm-step.tsx`
- Create: `src/app/(internal)/courses/create/program/[programId]/intake/preview/page.tsx`
- Create: `src/app/(internal)/courses/create/program/[programId]/intake/confirm/page.tsx`

- [ ] **Step 1: Helper to group rows**

```typescript
import type { IntakePreviewCourseRow } from "@/types/intake";

export type GroupedPreview = {
  levelId?: number;
  levelName?: string;
  subjectLabels?: string[];
  rows: IntakePreviewCourseRow[];
};

export function groupPreviewRows(
  rows: IntakePreviewCourseRow[],
  levelsById: Record<number, string>,
): GroupedPreview[] {
  const byLevel = new Map<number | "flat", IntakePreviewCourseRow[]>();
  for (const row of rows) {
    const key = row.level_id ?? ("flat" as const);
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key)!.push(row);
  }
  // ... return sorted groups
}
```

- [ ] **Step 2: Preview step on mount**

If `!state.intakeId`, POST `intakes` with dates from context → save `intakeId` → POST `intakes/${id}/preview-courses` → save `previewRows`.

Render grouped checkboxes + title inputs; sync `excluded` / `titleEdits` to context.

For `multi`, show level header with subject labels from `levelSubjectOverrides`.

- [ ] **Step 3: Confirm step**

Summary count → POST `intakes/${id}/generate-courses`:

```typescript
{
  overrides: previewRows.map((row) => ({
    key: row.key,
    included: state.excluded?.[row.key] !== false,
    title: state.titleEdits?.[row.key] ?? row.title,
  })),
  defaults: {
    category_id: state.categoryId,
    start_date: state.startDate,
    end_date: state.endDate,
    level_subject_ids: Object.fromEntries(
      Object.entries(state.levelSubjectOverrides ?? {}).map(([k, v]) => [k, v]),
    ),
  },
}
```

On success: `reset()` → `router.push(/intakes/${intakeId})`.

- [ ] **Step 4: QA** — checkbox exclude works; Year 6 vs Year 7 get different CourseSubjects on generated courses.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add intake preview and confirm steps with per-level subjects"
```

---

## Task 12: Program settings — level subjects editor

**Files:**
- Create: `src/components/program/program-level-subjects-editor.tsx`
- Modify: `src/app/(internal)/programs/[id]/settings/page.tsx`

- [ ] **Step 1: Editor component**

Only shown when `subject_strategy === multi`. For each level from `ProgramLevelsEditor`, show subject chip list (same UX as intake subjects step).

- [ ] **Step 2: Add card to program settings** below Levels card.

- [ ] **Step 3: QA** — defaults set in settings appear pre-filled in intake subjects step.

- [ ] **Step 4: Commit**

- [ ] **Step 5: Commit message**

```bash
git commit -m "feat: manage per-level subjects in program settings"
```

---

## Task 13: Legacy cleanup + redirects

**Files:**
- Delete: `src/components/course/course-create-form.tsx`
- Delete: `src/components/course/course-program-field-config.tsx`
- Delete: `src/components/intake/intake-create-wizard.tsx`
- Modify: `src/app/(internal)/intakes/create/page.tsx`

- [ ] **Step 1: Replace `/intakes/create`**

```tsx
import { redirect } from "next/navigation";

export default function IntakeCreateRedirectPage() {
  redirect("/courses/create");
}
```

- [ ] **Step 2: Delete legacy components** listed above.

- [ ] **Step 3: Grep for broken imports**

Run: `rg "course-create-form|intake-create-wizard|course-program-field-config" src/`

Fix any remaining imports.

- [ ] **Step 4: Run typecheck + lint**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: remove legacy course create stepper and intake wizard"
```

---

## Task 14: End-to-end verification

- [ ] **Step 1: Backend tests**

Run: `cd schedjuice-reimagined-be && python manage.py test app_course.tests.test_program_intake -v 2`

Expected: all PASS

- [ ] **Step 2: Frontend dev smoke**

Run: `npm run dev` in `schedjuice-reimagined-fe`

Checklist:
- [ ] `/courses/create` — single program auto-redirects
- [ ] `/courses/create` — multi program shows picker
- [ ] Manual program — single page save works
- [ ] First intake — structure → subjects → dates → preview → confirm
- [ ] Second intake — skips structure
- [ ] No modal overlay on courses list
- [ ] `/intakes/create` redirects to `/courses/create`
- [ ] Browser back preserves draft fields

- [ ] **Step 3: Fix any failures found**

- [ ] **Step 4: Final commit if fixes needed**

- [ ] **Step 5: Update spec checklist** — mark migration items done in design spec §10

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Unified Add classes entry | 7 |
| URL-driven steps | 6–11 |
| No auto-form in create | 8 |
| program_count gate | 4, 7 |
| First vs later intake | 9, 10 |
| Per-level ProgramLevelSubject | 1–3 |
| level_subject_ids payload | 3, 11 |
| Modal deleted | 5, 13 |
| Manual single page | 8 |
| Preview checkbox grouped by level | 11 |
| Hybrid defaults in settings | 12 |
| sessionStorage draft | 6 |
| `/intakes/create` redirect | 13 |

No TBD placeholders remain.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-program-centered-course-create.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
