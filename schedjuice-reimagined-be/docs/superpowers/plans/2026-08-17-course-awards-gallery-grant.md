# Course Awards Gallery + Grant Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers grant awards from an in-flow composer (batch, checkboxes), see grant-centric Gallery/List with certificate thumbnails when a template exists, download PNGs/zip, and keep Studio rail links on Award titles.

**Architecture:** `AwardGrant` stays title-only. Board GET adds `display_template` on grant titles and `has_display_template` on picker titles. New grade-gated `display-template` GET and batch grant POST. FE filters the existing roster payload, composites thumbnails client-side, and zips like ID cards. Studio rail passes serializable permission booleans.

**Tech Stack:** Django 4.2 + DRF, tenant schemas, Next.js App Router, Vitest, Testing Library, `jszip`, `bindAwardPreview` + `composite`, `revealBar` from `src/lib/sj/motion.ts`.

**Spec:** `docs/superpowers/specs/2026-08-17-course-awards-gallery-grant-design.md`

## Global Constraints

- Do not add `template_id` on `AwardGrant`. Display template = oldest `AwardTemplate` (`created_at`, then `id`).
- Live grants: insert = award, delete = undo. No draft/publish. Family/duplicate/period rules unchanged (academic ties allowed).
- Grant chrome is an in-flow composer (`revealBar`). No centered `Dialog` for the grant form. Title picker is Combobox/Popover. Buttons are text (`Grant award`, `Add award`, `Download`, `Download all`, `Cancel`, `Grant`).
- Teachers use grade perms (`assignment.grade` / `grade.manage`), not `award_title.manage`. Never call catalog `GET /award-titles/:id/templates` from the board.
- Zero grants this period → empty state + Grant award (both views). After grants, Gallery/List omit students with none.
- Downloads: client PNG/zip only for grants with a display template. Zip failure → no partial file.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- High-value tests only. No happy-path-only “renders” / `status_code == 200` smoke.
- Do not touch the Railway/dev database.
- Two git repos: commit BE files in `schedjuice-reimagined-be`, FE files in `schedjuice-reimagined-fe`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `schedjuice-reimagined-fe/src/config/studio-record-nav.ts` | Modify | Filter nav with `{ canDocuments, canAwards }` booleans |
| `schedjuice-reimagined-fe/src/config/__tests__/studio-record-nav.test.ts` | Modify | Boolean-flag cases |
| `schedjuice-reimagined-fe/src/components/studio/record/studio-section-rail.tsx` | Modify | Consume booleans |
| `schedjuice-reimagined-fe/src/components/studio/record/studio-section-rail.test.tsx` | Create | `/award-titles` still lists Documents + Award titles |
| `schedjuice-reimagined-fe/src/components/studio/record/studio-mobile-sections.tsx` | Modify | Same flags |
| `schedjuice-reimagined-fe/src/components/studio/record/studio-record-rail-provider.tsx` | Modify | Pass serializable flags into `useContextRail` |
| `schedjuice-reimagined-be/app_awards/services.py` | Modify | `serialize_display_template`, `grant_awards_batch`, board/picker fields |
| `schedjuice-reimagined-be/app_awards/views.py` | Modify | Display-template GET + batch POST |
| `schedjuice-reimagined-be/app_awards/urls.py` | Modify | Two routes |
| `schedjuice-reimagined-be/app_awards/tests/test_services.py` | Modify | Batch + oldest template |
| `schedjuice-reimagined-be/app_awards/tests/test_rbac_awards.py` | Modify | API 403/400/200 partial / teacher template access |
| `schedjuice-reimagined-fe/src/types/award.ts` | Modify | `display_template`, `has_display_template`, batch types |
| `schedjuice-reimagined-fe/src/lib/awards-api.ts` | Modify | Batch + display-template fetch |
| `schedjuice-reimagined-fe/src/lib/awards/board-students.ts` | Create | Grant-centric filters |
| `schedjuice-reimagined-fe/src/lib/awards/board-students.test.ts` | Create | Empty / omit-empty-students |
| `schedjuice-reimagined-fe/src/lib/awards/award-download.ts` | Create | Filenames + zip (no partial) |
| `schedjuice-reimagined-fe/src/lib/awards/award-download.test.ts` | Create | Caller-contract zip |
| `schedjuice-reimagined-fe/src/components/primitives/empty/empty-copy-presets.ts` | Modify | `noAwardsThisPeriod` |
| `schedjuice-reimagined-fe/src/components/course/awards/award-grant-composer.tsx` | Create | `revealBar` composer |
| `schedjuice-reimagined-fe/src/components/course/awards/award-grant-composer.test.tsx` | Create | Pre-check, not Dialog, partial errors |
| `schedjuice-reimagined-fe/src/components/course/awards/course-awards-board.tsx` | Modify | Empty / gallery / list / downloads / composer slot |

---

### Task 1: Studio rail serializable flags

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/studio-record-nav.ts`
- Modify: `schedjuice-reimagined-fe/src/config/__tests__/studio-record-nav.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/studio/record/studio-section-rail.tsx`
- Create: `schedjuice-reimagined-fe/src/components/studio/record/studio-section-rail.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/studio/record/studio-mobile-sections.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/studio/record/studio-record-rail-provider.tsx`

**Interfaces:**
- Consumes: `STUDIO_RECORD_NAV_ENTRIES`
- Produces: `visibleStudioRecordNavEntries({ canDocuments, canAwards })`

- [ ] **Step 1: Rewrite the nav-visibility tests for boolean flags**

Replace the `canAny` callback tests in `studio-record-nav.test.ts`:

```ts
describe("visibleStudioRecordNavEntries", () => {
  it("omits Award titles without award_title.manage", () => {
    const entries = visibleStudioRecordNavEntries({
      canDocuments: true,
      canAwards: false,
    });
    expect(entries.map((e) => e.id)).toEqual(["documents"]);
  });

  it("omits Documents without document_template.manage", () => {
    const entries = visibleStudioRecordNavEntries({
      canDocuments: false,
      canAwards: true,
    });
    expect(entries.map((e) => e.id)).toEqual(["award_titles"]);
  });

  it("includes both when both permissions are held", () => {
    const entries = visibleStudioRecordNavEntries({
      canDocuments: true,
      canAwards: true,
    });
    expect(entries.map((e) => e.href)).toEqual(["/studio", "/award-titles"]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (signature still takes `canAny`)**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/studio-record-nav.test.ts`

Expected: FAIL (wrong argument type / `.includes` on boolean)

- [ ] **Step 3: Change the helper to booleans**

In `studio-record-nav.ts`:

```ts
export type StudioNavFlags = {
  canDocuments: boolean;
  canAwards: boolean;
};

export function visibleStudioRecordNavEntries(
  flags: StudioNavFlags,
): StudioRecordNavEntry[] {
  return STUDIO_RECORD_NAV_ENTRIES.filter((entry) =>
    entry.id === "documents" ? flags.canDocuments : flags.canAwards,
  );
}
```

- [ ] **Step 4: Re-run nav tests — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/studio-record-nav.test.ts`

Expected: PASS

- [ ] **Step 5: Write the rail component test (Award titles still shows both links)**

Create `studio-section-rail.test.tsx` (mirror `finance-section-rail.test.tsx` motion/router mocks):

```tsx
it("lists Documents and Award titles on /award-titles when both flags are true", () => {
  render(
    <StudioSectionRail
      pathname="/award-titles"
      canDocuments={true}
      canAwards={true}
    />,
  );
  expect(screen.getByRole("link", { name: "Documents" }).getAttribute("href")).toBe(
    "/studio",
  );
  expect(
    screen.getByRole("link", { name: "Award titles" }).getAttribute("href"),
  ).toBe("/award-titles");
});

it("omits Documents when canDocuments is false", () => {
  render(
    <StudioSectionRail
      pathname="/award-titles"
      canDocuments={false}
      canAwards={true}
    />,
  );
  expect(screen.queryByRole("link", { name: "Documents" })).toBeNull();
  expect(screen.getByRole("link", { name: "Award titles" })).toBeTruthy();
});
```

- [ ] **Step 6: Run rail test — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/studio/record/studio-section-rail.test.tsx`

Expected: FAIL (`canAny` still required)

- [ ] **Step 7: Wire rail, mobile, provider**

`StudioSectionRail` / `StudioMobileSections` props: `{ pathname, canDocuments, canAwards }`. Call `visibleStudioRecordNavEntries({ canDocuments, canAwards })`.

`StudioRecordRailProvider`:

```ts
const canDocuments = canAny(["document_template.manage"]);
const canAwards = canAny(["award_title.manage"]);
useContextRail(
  StudioSectionRail,
  () => ({ pathname, canDocuments, canAwards }),
  STUDIO_CONTEXT_PARENT,
);
```

Pass the same booleans into `StudioMobileSections`. Do not pass `canAny` into `getProps`.

- [ ] **Step 8: Re-run rail + nav tests — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/studio-record-nav.test.ts src/components/studio/record/studio-section-rail.test.tsx`

Expected: PASS

- [ ] **Step 9: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/config/studio-record-nav.ts src/config/__tests__/studio-record-nav.test.ts \
  src/components/studio/record/studio-section-rail.tsx \
  src/components/studio/record/studio-section-rail.test.tsx \
  src/components/studio/record/studio-mobile-sections.tsx \
  src/components/studio/record/studio-record-rail-provider.tsx
git commit -m "$(cat <<'EOF'
fix: keep Studio rail links on award titles

EOF
)"
```

---

### Task 2: Display template on board + course-scoped GET

**Files:**
- Modify: `schedjuice-reimagined-be/app_awards/services.py`
- Modify: `schedjuice-reimagined-be/app_awards/views.py`
- Modify: `schedjuice-reimagined-be/app_awards/urls.py`
- Modify: `schedjuice-reimagined-be/app_awards/tests/test_services.py`
- Modify: `schedjuice-reimagined-be/app_awards/tests/test_rbac_awards.py`

**Interfaces:**
- Consumes: `AwardTemplate`, `AwardTemplateSerializer`, `_assert_title_usable`
- Produces: `serialize_display_template(title, request=None) -> dict | None`, `course_awards_board(..., request=None)` grant titles with `display_template`, picker titles with `has_display_template`, `GET /api/v1/courses/<id>/award-titles/<id>/display-template`

- [ ] **Step 1: Write failing service tests**

In `test_services.py` import `AwardTemplate`, `EMPTY_AWARD_DOCUMENT`, `serialize_display_template`. Add (inside the existing class, using `_setup()`):

```python
def test_display_template_is_oldest(self):
    with schema_context(self.schema_name):
        teacher, student, course, top1, top2, today = self._setup()
        newer = AwardTemplate.objects.create(
            title=top1,
            name="New",
            document=dict(EMPTY_AWARD_DOCUMENT),
        )
        older = AwardTemplate.objects.create(
            title=top1,
            name="Old",
            document=dict(EMPTY_AWARD_DOCUMENT),
        )
        AwardTemplate.objects.filter(pk=older.pk).update(
            created_at=newer.created_at - timedelta(days=1)
        )
        older.refresh_from_db()
        payload = serialize_display_template(top1)
        self.assertEqual(payload["id"], older.id)
        self.assertEqual(payload["name"], "Old")
        self.assertIn("document", payload)
        self.assertIn("background_url", payload)

def test_display_template_none_for_local_or_missing(self):
    with schema_context(self.schema_name):
        teacher, student, course, top1, top2, today = self._setup()
        local = AwardTitle.objects.create(
            name="One-off",
            origin=AwardTitle.Origin.LOCAL,
            course=course,
        )
        self.assertIsNone(serialize_display_template(local))
        self.assertIsNone(serialize_display_template(top1))
```

`_setup()` already returns `teacher, student, course, top1, top2, today`. Unpack that tuple in the new tests. For extra students, generate a fresh email with `uuid4().hex[:6]`.

- [ ] **Step 2: Run service tests — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_services.AwardGrantServiceTests.test_display_template_is_oldest`

Expected: FAIL (`serialize_display_template` missing)

- [ ] **Step 3: Implement serialization + board fields**

```python
def serialize_display_template(title: AwardTitle, request=None) -> dict | None:
    if title.course_id is not None:
        return None
    template = (
        AwardTemplate.objects.filter(title=title)
        .order_by("created_at", "id")
        .first()
    )
    if template is None:
        return None
    from app_awards.serializers import AwardTemplateSerializer

    data = AwardTemplateSerializer(template, context={"request": request}).data
    return {
        "id": data["id"],
        "name": data["name"],
        "document": data["document"],
        "background_url": data.get("background_url"),
    }


def serialize_title(
    title: AwardTitle,
    *,
    has_display_template: bool | None = None,
    display_template=None,
    include_display_template: bool = False,
) -> dict:
    payload = {
        "id": title.id,
        "name": title.name,
        "family": title.family,
        "origin": title.origin,
        "is_pinned": title.is_pinned,
    }
    if has_display_template is not None:
        payload["has_display_template"] = has_display_template
    if include_display_template:
        payload["display_template"] = display_template
    return payload
```

In `typeahead_groups`, after collecting pinned/top10/local/other lists:

```python
ids = [t.id for t in pinned + top10 + local + other]
with_tmpl = set(
    AwardTemplate.objects.filter(title_id__in=ids).values_list("title_id", flat=True)
)

def _pick(titles):
    return [
        serialize_title(t, has_display_template=t.id in with_tmpl) for t in titles
    ]
```

In `course_awards_board`, add `request=None`. When appending grants:

```python
"title": serialize_title(
    grant.title,
    include_display_template=True,
    display_template=serialize_display_template(grant.title, request),
)
```

Prefetch templates on the grant queryset: `.select_related("title").prefetch_related("title__templates")` — `serialize_display_template` still queries unless you pass a cached map. Build a map of title_id → oldest template from the prefetched related manager to avoid N+1:

```python
def _oldest_template(title):
    templates = list(title.templates.all())
    if not templates or title.course_id is not None:
        return None
    templates.sort(key=lambda t: (t.created_at, t.id))
    return templates[0]
```

Then serialize that instance with `AwardTemplateSerializer`.

Pass `request` from `CourseAwardsBoardView.get` into `course_awards_board`.

- [ ] **Step 4: Re-run service tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_services.AwardGrantServiceTests.test_display_template_is_oldest app_awards.tests.test_services.AwardGrantServiceTests.test_display_template_none_for_local_or_missing`

Expected: PASS

- [ ] **Step 5: Write failing API tests**

In `AwardBoardApiTests`:

```python
def _display_url(self, title_id):
    return (
        f"{self.api_prefix}/courses/{self.course.id}"
        f"/award-titles/{title_id}/display-template"
    )

def test_board_grant_includes_oldest_display_template(self):
    from app_awards.document import EMPTY_AWARD_DOCUMENT
    from app_awards.models import AwardTemplate

    with schema_context(self.schema_name):
        AwardTemplate.objects.create(
            title=self.top1, name="B", document=dict(EMPTY_AWARD_DOCUMENT)
        )
        older = AwardTemplate.objects.create(
            title=self.top1, name="A", document=dict(EMPTY_AWARD_DOCUMENT)
        )
        AwardTemplate.objects.filter(pk=older.pk).update(
            created_at=timezone.now() - timedelta(days=1)
        )
        grant_award(
            course=self.course,
            title=self.top1,
            user=self.student,
            period_kind="overall",
            granted_by=self.teacher,
        )
        resp = self._client(self.teacher).get(
            self._board_url(period_kind="overall")
        )
    self.assertEqual(resp.status_code, 200, resp.content)
    row = next(
        s for s in resp.json()["data"]["students"] if s["id"] == self.student.id
    )
    tmpl = row["grants"][0]["title"]["display_template"]
    self.assertEqual(tmpl["id"], older.id)
    self.assertTrue(
        resp.json()["data"]["picker"]["pinned"][0]["has_display_template"]
        or any(
            t["id"] == self.top1.id and t["has_display_template"]
            for t in resp.json()["data"]["picker"]["pinned"]
        )
    )

def test_teacher_display_template_ok_catalog_templates_forbidden(self):
    from app_awards.document import EMPTY_AWARD_DOCUMENT
    from app_awards.models import AwardTemplate

    with schema_context(self.schema_name):
        AwardTemplate.objects.create(
            title=self.top1, name="A", document=dict(EMPTY_AWARD_DOCUMENT)
        )
        client = self._client(self.teacher)
        ok = client.get(self._display_url(self.top1.id))
        denied = client.get(
            f"{self.api_prefix}/award-titles/{self.top1.id}/templates"
        )
    self.assertEqual(ok.status_code, 200, ok.content)
    self.assertEqual(ok.json()["data"]["name"], "A")
    self.assertEqual(denied.status_code, 403, denied.content)

def test_student_forbidden_on_display_template(self):
    with schema_context(self.schema_name):
        resp = self._client(self.student).get(self._display_url(self.top1.id))
    self.assertEqual(resp.status_code, 403, resp.content)

def test_display_template_404_for_other_course_local(self):
    with schema_context(self.schema_name):
        other = Course.objects.create(
            title=f"Other {self.suffix}",
            category=self.cat,
            program=self.prog,
            start_date=self.today,
            end_date=self.today + timedelta(days=10),
        )
        local = AwardTitle.objects.create(
            name=f"Local {self.suffix}",
            origin=AwardTitle.Origin.LOCAL,
            course=other,
        )
        resp = self._client(self.teacher).get(self._display_url(local.id))
    self.assertEqual(resp.status_code, 404, resp.content)
```

- [ ] **Step 6: Run API tests — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_teacher_display_template_ok_catalog_templates_forbidden`

Expected: FAIL (404/URL missing)

- [ ] **Step 7: Add view + url**

`urls.py`:

```python
path(
    "courses/<int:course_id>/award-titles/<int:obj_id>/display-template",
    views.CourseAwardDisplayTemplateView.as_view(),
    name="course-award-display-template",
),
```

View (`rbac_decision = "authenticated_only"`):

```python
class CourseAwardDisplayTemplateView(RBACView):
    name = "Course award display template"
    rbac_decision = "authenticated_only"

    def get(self, request, course_id: int, obj_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.not_found("Course not found.")
        title = models.AwardTitle.objects.filter(pk=obj_id).first()
        if title is None:
            return self.not_found("Award title not found.")
        try:
            services._assert_title_usable(course, title)
        except ValidationError:
            return self.not_found("Award title not found.")
        return self.ok(services.serialize_display_template(title, request))
```

Local titles: `_assert_title_usable` allows this course’s local; `serialize_display_template` returns `None` → **200 with `data: null`**. Other course’s local → 404.

- [ ] **Step 8: Re-run API tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_board_grant_includes_oldest_display_template app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_teacher_display_template_ok_catalog_templates_forbidden app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_student_forbidden_on_display_template app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_display_template_404_for_other_course_local`

Expected: PASS

- [ ] **Step 9: Commit (BE repo)**

```bash
cd schedjuice-reimagined-be
git add app_awards/services.py app_awards/views.py app_awards/urls.py \
  app_awards/tests/test_services.py app_awards/tests/test_rbac_awards.py
git commit -m "$(cat <<'EOF'
feat: expose oldest award display template to graders

EOF
)"
```

---

### Task 3: Batch grant API

**Files:**
- Modify: `schedjuice-reimagined-be/app_awards/services.py`
- Modify: `schedjuice-reimagined-be/app_awards/views.py`
- Modify: `schedjuice-reimagined-be/app_awards/urls.py`
- Modify: `schedjuice-reimagined-be/app_awards/tests/test_services.py`
- Modify: `schedjuice-reimagined-be/app_awards/tests/test_rbac_awards.py`

**Interfaces:**
- Consumes: `resolve_title_for_grant`, `grant_award`, `delete_grant` cleanup (local with zero grants)
- Produces: `grant_awards_batch(...) -> { title, granted, errors }`

- [ ] **Step 1: Write failing service tests**

```python
from app_awards.services import grant_awards_batch
from app_auth.models import User

def test_batch_partial_family_clash(self):
    with schema_context(self.schema_name):
        teacher, student, course, top1, top2, today = self._setup()
        suffix = uuid4().hex[:6]
        other = User.objects.create_user(
            email=f"s2-{suffix}@example.com",
            password="x",
            name="S2",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[User.UserRole.STUDENT],
        )
        UserCourse.objects.create(
            user=other,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        grant_award(
            course=course,
            title=top1,
            user=student,
            period_kind="overall",
            granted_by=teacher,
        )
        result = grant_awards_batch(
            course=course,
            title_id=top2.id,
            name=None,
            user_ids=[student.id, other.id],
            period_kind="overall",
            year=None,
            month=None,
            granted_by=teacher,
        )
        self.assertEqual(len(result["granted"]), 1)
        self.assertEqual(result["granted"][0]["user"], other.id)
        self.assertEqual(len(result["errors"]), 1)
        self.assertEqual(result["errors"][0]["user"], student.id)
        self.assertIn(top1.name, result["errors"][0]["message"])

def test_batch_academic_ties_both_granted(self):
    with schema_context(self.schema_name):
        teacher, student, course, top1, top2, today = self._setup()
        suffix = uuid4().hex[:6]
        other = User.objects.create_user(
            email=f"s2-{suffix}@example.com",
            password="x",
            name="S2",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[User.UserRole.STUDENT],
        )
        UserCourse.objects.create(
            user=other,
            course=course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        result = grant_awards_batch(
            course=course,
            title_id=top1.id,
            name=None,
            user_ids=[student.id, other.id],
            period_kind="overall",
            year=None,
            month=None,
            granted_by=teacher,
        )
        self.assertEqual(len(result["granted"]), 2)
        self.assertEqual(result["errors"], [])

def test_batch_empty_user_ids_raises(self):
    with schema_context(self.schema_name):
        teacher, student, course, top1, top2, today = self._setup()
        with self.assertRaises(ValidationError) as cm:
            grant_awards_batch(
                course=course,
                title_id=top1.id,
                name=None,
                user_ids=[],
                period_kind="overall",
                year=None,
                month=None,
                granted_by=teacher,
            )
        self.assertIn("user_ids", cm.exception.detail)

def test_batch_local_all_fail_deletes_title(self):
    with schema_context(self.schema_name):
        teacher, student, course, top1, top2, today = self._setup()
        suffix = uuid4().hex[:6]
        result = grant_awards_batch(
            course=course,
            title_id=None,
            name=f"One-off {suffix}",
            user_ids=[99999999],
            period_kind="overall",
            year=None,
            month=None,
            granted_by=teacher,
        )
        self.assertEqual(result["granted"], [])
        self.assertTrue(result["errors"])
        self.assertFalse(
            AwardTitle.objects.filter(
                course=course, name__iexact=f"One-off {suffix}"
            ).exists()
        )
```

Keep unpacking `_setup()` as `teacher, student, course, top1, top2, today`. Do not rewrite existing tests to a dict.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_services.AwardGrantServiceTests.test_batch_partial_family_clash`

Expected: FAIL (`grant_awards_batch` missing)

- [ ] **Step 3: Implement `grant_awards_batch`**

```python
def first_validation_message(exc: ValidationError) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        for value in detail.values():
            if isinstance(value, list) and value:
                return str(value[0])
            return str(value)
    if isinstance(detail, list) and detail:
        return str(detail[0])
    return str(detail)


def grant_awards_batch(
    *,
    course,
    title_id,
    name,
    user_ids,
    period_kind,
    granted_by,
    year=None,
    month=None,
):
    if not isinstance(user_ids, list) or len(user_ids) == 0:
        raise ValidationError({"user_ids": "Select at least one student."})
    ids = []
    for raw in user_ids:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            raise ValidationError({"user_ids": "Each id must be an integer."})
    from app_auth.models import User

    title = resolve_title_for_grant(
        course, title_id=title_id, name=name, actor=granted_by
    )
    created_local = (
        title.origin == AwardTitle.Origin.LOCAL
        and not AwardGrant.objects.filter(title=title).exists()
    )
    title_payload = serialize_title(title)
    granted = []
    errors = []
    for uid in ids:
        user = User.objects.filter(pk=uid).first()
        try:
            if user is None:
                raise ValidationError({"user": "Student not found."})
            grant = grant_award(
                course=course,
                title=title,
                user=user,
                period_kind=period_kind,
                year=year,
                month=month,
                granted_by=granted_by,
            )
            granted.append(
                {
                    "id": grant.id,
                    "user": uid,
                    "title": serialize_title(grant.title),
                }
            )
        except ValidationError as exc:
            errors.append({"user": uid, "message": first_validation_message(exc)})
    if created_local and not granted:
        if not AwardGrant.objects.filter(title=title).exists():
            title.delete()
    return {"title": title_payload, "granted": granted, "errors": errors}
```

- [ ] **Step 4: Re-run service tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_services.AwardGrantServiceTests.test_batch_partial_family_clash app_awards.tests.test_services.AwardGrantServiceTests.test_batch_academic_ties_both_granted app_awards.tests.test_services.AwardGrantServiceTests.test_batch_empty_user_ids_raises app_awards.tests.test_services.AwardGrantServiceTests.test_batch_local_all_fail_deletes_title`

Expected: PASS

- [ ] **Step 5: Write failing API tests**

```python
def _batch_url(self):
    return f"{self.api_prefix}/courses/{self.course.id}/award-grants/batch"

def test_teacher_batch_two_students(self):
    with schema_context(self.schema_name):
        other = User.objects.create_user(
            email=f"aw-stu2-{self.suffix}@example.com",
            password="x",
            name="Student2",
            phone_number="-",
            date_of_birth=date(1990, 1, 1),
            roles=[User.UserRole.STUDENT],
        )
        UserCourse.objects.create(
            user=other,
            course=self.course,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        resp = self._client(self.teacher).post(
            self._batch_url(),
            {
                "title_id": self.top1.id,
                "user_ids": [self.student.id, other.id],
                "period_kind": "overall",
            },
            format="json",
        )
    self.assertEqual(resp.status_code, 200, resp.content)
    self.assertEqual(len(resp.json()["data"]["granted"]), 2)

def test_student_forbidden_on_batch(self):
    with schema_context(self.schema_name):
        resp = self._client(self.student).post(
            self._batch_url(),
            {
                "title_id": self.top1.id,
                "user_ids": [self.student.id],
                "period_kind": "overall",
            },
            format="json",
        )
    self.assertEqual(resp.status_code, 403, resp.content)

def test_batch_empty_user_ids_400(self):
    with schema_context(self.schema_name):
        resp = self._client(self.teacher).post(
            self._batch_url(),
            {"title_id": self.top1.id, "user_ids": [], "period_kind": "overall"},
            format="json",
        )
    self.assertEqual(resp.status_code, 400, resp.content)
    self.assertIn("user_ids", resp.json().get("details", {}))

def test_batch_unresolvable_title_400(self):
    with schema_context(self.schema_name):
        resp = self._client(self.teacher).post(
            self._batch_url(),
            {"title_id": 99999999, "user_ids": [self.student.id], "period_kind": "overall"},
            format="json",
        )
    self.assertEqual(resp.status_code, 400, resp.content)

def test_no_grade_forbidden_on_batch(self):
    with schema_context(self.schema_name):
        teacher_role = Role.objects.filter(slug="teacher", is_system=True).first()
        RolePermission.objects.filter(
            role=teacher_role,
            permission_code__in=["assignment.grade", "grade.manage"],
        ).delete()
        bump_matrix_generation(self.schema_name)
        resp = self._client(self.teacher).post(
            self._batch_url(),
            {
                "title_id": self.top1.id,
                "user_ids": [self.student.id],
                "period_kind": "overall",
            },
            format="json",
        )
    self.assertEqual(resp.status_code, 403, resp.content)
```

- [ ] **Step 6: Run — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_batch_empty_user_ids_400`

Expected: FAIL (URL missing)

- [ ] **Step 7: View + url**

```python
path(
    "courses/<int:course_id>/award-grants/batch",
    views.CourseAwardGrantBatchView.as_view(),
    name="course-award-grant-batch",
),
```

Place this path **before** `courses/<int:course_id>/award-grants` if the router could collide (it should not — different suffix). Keep both.

```python
class CourseAwardGrantBatchView(RBACView):
    name = "Course award grant batch"
    rbac_decision = "authenticated_only"

    def post(self, request, course_id: int):
        denied = _forbid_unless_can_grade(self, request)
        if denied is not None:
            return denied
        course = Course.objects.filter(pk=course_id).first()
        if course is None:
            return self.not_found("Course not found.")
        body = request.data or {}
        try:
            payload = services.grant_awards_batch(
                course=course,
                title_id=body.get("title_id"),
                name=body.get("name"),
                user_ids=body.get("user_ids"),
                period_kind=body.get("period_kind"),
                year=body.get("year"),
                month=body.get("month"),
                granted_by=acting_user(request),
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.ok(payload)
```

`user_ids` missing (`None`) must 400 via `grant_awards_batch` (`not a list`).

- [ ] **Step 8: Re-run API tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_teacher_batch_two_students app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_student_forbidden_on_batch app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_batch_empty_user_ids_400 app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_batch_unresolvable_title_400 app_awards.tests.test_rbac_awards.AwardBoardApiTests.test_no_grade_forbidden_on_batch`

Expected: PASS

- [ ] **Step 9: Commit (BE repo)**

```bash
cd schedjuice-reimagined-be
git add app_awards/services.py app_awards/views.py app_awards/urls.py \
  app_awards/tests/test_services.py app_awards/tests/test_rbac_awards.py
git commit -m "$(cat <<'EOF'
feat: batch grant awards with per-student errors

EOF
)"
```

---

### Task 4: FE types, API, board filters, download helpers

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/award.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/awards-api.ts`
- Create: `schedjuice-reimagined-fe/src/lib/awards/board-students.ts`
- Create: `schedjuice-reimagined-fe/src/lib/awards/board-students.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/awards/award-download.ts`
- Create: `schedjuice-reimagined-fe/src/lib/awards/award-download.test.ts`

**Interfaces:**
- Consumes: Task 2/3 JSON shapes
- Produces: `studentsWithGrants`, `hasAnyGrant`, `awardPngFileName`, `awardsZipFileName`, `collectAwardPngs`, `createAwardGrantBatch`, `getAwardDisplayTemplate`

- [ ] **Step 1: Write failing helper tests**

`board-students.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasAnyGrant, studentsWithGrants } from "./board-students";
import type { AwardBoardStudent } from "@/types/award";

const empty: AwardBoardStudent = { id: 1, name: "A", grants: [] };
const awarded: AwardBoardStudent = {
  id: 2,
  name: "B",
  grants: [{ id: 9, title: { id: 1, name: "Top 1", family: null, origin: "admin", is_pinned: true } }],
};

it("hasAnyGrant is false when every student has an empty grants list", () => {
  expect(hasAnyGrant([empty])).toBe(false);
  expect(hasAnyGrant([])).toBe(false);
});

it("studentsWithGrants omits students with no grants", () => {
  expect(studentsWithGrants([empty, awarded]).map((s) => s.id)).toEqual([2]);
});
```

`award-download.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  awardPngFileName,
  awardsZipFileName,
  collectAwardPngs,
} from "./award-download";

it("sanitizes png and zip names", () => {
  expect(awardPngFileName({ studentName: "Hla Hla", titleName: "Top 1", periodKey: "2026-8" })).toBe(
    "hla-hla_top-1_2026-8.png",
  );
  expect(awardsZipFileName("IG 19", "overall")).toBe("ig-19-awards-overall.zip");
});

it("omits grants without display_template", async () => {
  const composite = vi.fn();
  const result = await collectAwardPngs(
    [
      {
        studentName: "A",
        titleName: "Local",
        periodKey: "overall",
        display_template: null,
      },
    ],
    composite,
  );
  expect(result).toEqual({ ok: true, files: [] });
  expect(composite).not.toHaveBeenCalled();
});

it("returns ok false and no files when any composite fails", async () => {
  const composite = vi.fn()
    .mockResolvedValueOnce("data:image/png;base64,aaa")
    .mockRejectedValueOnce(new Error("boom"));
  const tmpl = { id: 1, name: "T", document: {}, background_url: null };
  const result = await collectAwardPngs(
    [
      { studentName: "A", titleName: "Top 1", periodKey: "overall", display_template: tmpl },
      { studentName: "B", titleName: "Top 1", periodKey: "overall", display_template: tmpl },
    ],
    composite,
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.files).toBeUndefined();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/awards/board-students.test.ts src/lib/awards/award-download.test.ts`

Expected: FAIL (modules missing)

- [ ] **Step 3: Implement helpers + types + API**

`AwardTitleSummary` add `has_display_template?: boolean`. Grant title:

```ts
export type AwardDisplayTemplate = {
  id: number;
  name: string;
  document: unknown;
  background_url: string | null;
};

export type AwardGrantChip = {
  id: number;
  title: AwardTitleSummary & { display_template: AwardDisplayTemplate | null };
};
```

```ts
export function studentsWithGrants(students: AwardBoardStudent[]): AwardBoardStudent[] {
  return students.filter((row) => row.grants.length > 0);
}

export function hasAnyGrant(students: AwardBoardStudent[]): boolean {
  return students.some((row) => row.grants.length > 0);
}
```

```ts
function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "award";
}

export function awardPngFileName(input: {
  studentName: string;
  titleName: string;
  periodKey: string;
}): string {
  return `${slugPart(input.studentName)}_${slugPart(input.titleName)}_${slugPart(input.periodKey)}.png`;
}

export function awardsZipFileName(courseTitle: string, periodKey: string): string {
  return `${slugPart(courseTitle)}-awards-${slugPart(periodKey)}.zip`;
}

export type AwardPngInput = {
  studentName: string;
  titleName: string;
  periodKey: string;
  display_template: AwardDisplayTemplate | null;
};

export async function collectAwardPngs(
  rows: AwardPngInput[],
  compositeRow: (row: AwardPngInput & { display_template: AwardDisplayTemplate }) => Promise<string>,
): Promise<{ ok: true; files: Array<{ name: string; pngDataUrl: string }> } | { ok: false }> {
  const renderable = rows.filter(
    (row): row is AwardPngInput & { display_template: AwardDisplayTemplate } =>
      row.display_template != null,
  );
  const files: Array<{ name: string; pngDataUrl: string }> = [];
  try {
    for (const row of renderable) {
      const pngDataUrl = await compositeRow(row);
      files.push({
        name: awardPngFileName(row),
        pngDataUrl,
      });
    }
    return { ok: true, files };
  } catch {
    return { ok: false };
  }
}

export async function downloadPngDataUrl(pngDataUrl: string, filename: string): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");
  downloadFile(pngDataUrl, filename);
}

export async function downloadAwardsZip(args: {
  files: Array<{ name: string; pngDataUrl: string }>;
  zipName: string;
}): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of args.files) {
    const idx = file.pngDataUrl.indexOf("base64,") + "base64,".length;
    zip.file(file.name, file.pngDataUrl.substring(idx), { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, args.zipName);
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

`awards-api.ts`:

```ts
export async function createAwardGrantBatch(
  courseId: number | string,
  input: {
    title_id?: number | null;
    name?: string | null;
    user_ids: number[];
    period_kind: "month" | "overall";
    year?: number;
    month?: number;
  },
): Promise<{
  title: AwardTitleSummary;
  granted: Array<{ id: number; user: number; title: AwardTitleSummary }>;
  errors: Array<{ user: number; message: string }>;
}> {
  const res = await axiosClient.post(
    `courses/${courseId}/award-grants/batch`,
    input,
  );
  return res.data.data;
}

export async function getAwardDisplayTemplate(
  courseId: number | string,
  titleId: number,
): Promise<AwardDisplayTemplate | null> {
  const res = await axiosClient.get(
    `courses/${courseId}/award-titles/${titleId}/display-template`,
  );
  return res.data.data ?? null;
}
```

Keep `createAwardGrant` (single) for compatibility; the composer must call **batch** only.

- [ ] **Step 4: Re-run helper tests — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/awards/board-students.test.ts src/lib/awards/award-download.test.ts`

Expected: PASS

- [ ] **Step 5: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/types/award.ts src/lib/awards-api.ts src/lib/awards/board-students.ts \
  src/lib/awards/board-students.test.ts src/lib/awards/award-download.ts \
  src/lib/awards/award-download.test.ts
git commit -m "$(cat <<'EOF'
feat: add award board filters and download helpers

EOF
)"
```

---

### Task 5: Empty state, Gallery/List, composer, downloads on the board

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/primitives/empty/empty-copy-presets.ts`
- Create: `schedjuice-reimagined-fe/src/components/course/awards/award-grant-composer.tsx`
- Create: `schedjuice-reimagined-fe/src/components/course/awards/award-grant-composer.test.tsx`
- Create: `schedjuice-reimagined-fe/src/components/course/awards/course-awards-board.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/course/awards/course-awards-board.tsx`

**Interfaces:**
- Consumes: `hasAnyGrant`, `studentsWithGrants`, `createAwardGrantBatch`, `getAwardDisplayTemplate`, `collectAwardPngs`, `downloadAwardsZip`, `revealBar`
- Produces: Grant-centric board UI matching the spec

- [ ] **Step 1: Add empty preset**

```ts
noAwardsThisPeriod: {
  enBefore: "No awards ",
  enHighlight: "this period",
  enAfter: "",
  myBefore: "ယခုကာလ ",
  myHighlight: "ဆုများ",
  myAfter: " မရှိသေးပါ",
} satisfies EmptyCopySlots,
```

- [ ] **Step 2: Write composer tests (not Dialog; pre-check; partial errors)**

Mock `getAwardDisplayTemplate` to `null`. Render `AwardGrantComposer` with two students.

```tsx
it("does not render a dialog role", () => {
  render(
    <AwardGrantComposer
      open
      periodLabel="Aug 2026"
      students={roster}
      picker={groups}
      orgTitles={[]}
      localTitles={[]}
      precheckedIds={[11]}
      pending={false}
      onCancel={() => {}}
      onGrant={async () => ({ granted: [], errors: [] })}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  const box = screen.getByRole("checkbox", { name: "Hla Hla" });
  expect(box.getAttribute("data-checked") ?? box.getAttribute("aria-checked")).toBeTruthy();
});

it("shows per-student batch errors and disables Grant until a title and a student", async () => {
  const onGrant = vi.fn().mockResolvedValue({
    granted: [{ id: 1, user: 11, title: { id: 1, name: "Top 1" } }],
    errors: [{ user: 12, message: "This student already has Top 1 in the same family for this period." }],
  });
  // pick title, check two students, submit, assert message under student 12
});
```

Use `userEvent` against the existing title combobox pattern (buttons in the picker list). Grant button `getByRole("button", { name: "Grant" })` must be disabled with no title.

- [ ] **Step 3: Run composer tests — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/course/awards/award-grant-composer.test.tsx`

Expected: FAIL (module missing)

- [ ] **Step 4: Implement `AwardGrantComposer`**

- Wrap with `motion.div` `variants={revealBar}` (reduced → `crossfadeInstant`).
- Title: reuse the current `Popover` + `Input` + grouped buttons from `AddAwardPicker` (move that JSX here; delete the row-level popover).
- Students: `Checkbox` + label for every roster student. `precheckedIds` start checked. Students who already have the selected title this period: checked + `disabled` + accessible name includes “Already granted”.
- Preview region: min-height reserved. If `has_display_template` on the picked title, `getAwardDisplayTemplate(courseId, titleId)` then `composite` for the first enabled checked student (or `"Student"` placeholder). Else copy: `This grant is recorded only. No certificate image.`
- Footer: **Cancel** / **Grant**. Grant disabled without title (picked id or typed name) or without ≥1 enabled checked student.
- `onGrant({ title_id, name, user_ids })`. On result: map `errors` under those ids; uncheck+disable users in `granted`. If `granted.length === 0` and `errors.length > 0`, keep open (parent toasts only when the parent sees every selected id in errors).
- No `Dialog` import.

- [ ] **Step 5: Re-run composer tests — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/course/awards/award-grant-composer.test.tsx`

Expected: PASS

- [ ] **Step 6: Write board tests**

Mock `useCourseHub`, `useTenant`, `getCourseAwards`.

```tsx
it("shows empty copy and Grant award when no grants exist, in both views", async () => {
  getCourseAwards.mockResolvedValue({
    students: [{ id: 1, name: "Hla Hla", grants: [] }],
    picker: { pinned: [], top10: [], local: [], other: [] },
  });
  render(<CourseAwardsBoard />);
  expect(await screen.findByText(/this period/i)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Grant award" }).length).toBeGreaterThan(0);
  expect(screen.queryByText("Hla Hla")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "List" }));
  expect(screen.queryByText("Hla Hla")).toBeNull();
});

it("omits students without grants after the first grant", async () => {
  getCourseAwards.mockResolvedValue({
    students: [
      { id: 1, name: "Hla Hla", grants: [{ id: 9, title: { id: 1, name: "Top 1", family: null, origin: "admin", is_pinned: true, display_template: null } }] },
      { id: 2, name: "Kyaw Thu", grants: [] },
    ],
    picker: { pinned: [], top10: [], local: [], other: [] },
  });
  render(<CourseAwardsBoard />);
  expect(await screen.findByText("Hla Hla")).toBeTruthy();
  expect(screen.queryByText("Kyaw Thu")).toBeNull();
});

it("opens the composer from Grant award, not a dialog", async () => {
  getCourseAwards.mockResolvedValue({
    students: [{ id: 1, name: "Hla Hla", grants: [] }],
    picker: { pinned: [], top10: [], local: [], other: [] },
  });
  render(<CourseAwardsBoard />);
  await userEvent.click(await screen.findByRole("button", { name: "Grant award" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText(/Award title/i)).toBeTruthy();
});

it("omits Download all on the empty state", async () => {
  getCourseAwards.mockResolvedValue({
    students: [{ id: 1, name: "Hla Hla", grants: [] }],
    picker: { pinned: [], top10: [], local: [], other: [] },
  });
  render(<CourseAwardsBoard />);
  await screen.findByRole("button", { name: "Grant award" });
  expect(screen.queryByRole("button", { name: "Download all" })).toBeNull();
});
```

- [ ] **Step 7: Run board tests — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/course/awards/course-awards-board.test.tsx`

Expected: FAIL (roster still listed when empty)

- [ ] **Step 8: Restructure `CourseAwardsBoard`**

Keep period chips. Add toolbar:

```tsx
<ToolbarSegmentGroup aria-label="View mode">
  <ToolbarSegmentToggle active={view === "gallery"} onClick={() => setView("gallery")}>
    Gallery
  </ToolbarSegmentToggle>
  <ToolbarSegmentToggle active={view === "list"} onClick={() => setView("list")}>
    List
  </ToolbarSegmentToggle>
</ToolbarSegmentGroup>
{hasAnyGrant(students) ? (
  <Button
    variant="secondary"
    size="sm"
    disabled={!hasRenderable}
    onClick={() => void onDownloadAll()}
  >
    Download all
  </Button>
) : null}
<Button size="sm" onClick={() => openComposer([])}>Grant award</Button>
```

Default `view` `"gallery"`. Not persisted.

If `!hasAnyGrant(students)`: `EmptyCopy {...EMPTY_COPY_PRESETS.noAwardsThisPeriod}` + **Grant award** (same `openComposer([])`). No table.

Else Gallery: flatten grants newest-first (`grant.id` descending). Card: if `display_template`, composite thumbnail (lazy; skip offscreen if easy, otherwise compose when mounted). Else info card with `title.name` + `formatAwardFamily`. × → `deleteAwardGrant`. Local overflow Promote. **Download** when template exists → `collectAwardPngs` one row + `downloadPngDataUrl`. Click thumbnail → existing full-screen image viewer if one is already used on student photos; otherwise open the same PNG in a new tab via `downloadFile` is wrong — use the photo gallery viewer component (`FullScreenImageViewer`) with the object URL. If wiring the viewer is large, show the composited image in a `Popover` (ephemeral, allowed). Prefer `FullScreenImageViewer`.

List: `studentsWithGrants` table. Keep chips + **Add award** visibility class. Add award → `openComposer([student.id])`. Chip overflow **Download image** when template exists.

Composer: `{composerOpen && <AwardGrantComposer ... />}` above the body, `AnimatePresence`. `onGrant` calls `createAwardGrantBatch` with board period. Parent: if every requested user is in `errors`, toast; always apply per-student messages via composer props. On full success (`errors.length === 0`), close composer and invalidate `["course-awards", courseId]`.

`onDownloadAll`: flatten renderable grants, `collectAwardPngs` with a composite that uses `bindAwardPreview` + `composite` + `canvas.toDataURL("image/png")`. If `!result.ok`, toast, do not zip. If `result.files.length === 0`, disable already handled. Else `downloadAwardsZip`. Busy flag on the button.

Remove the old row `AddAwardPicker` popover.

Do not import `Dialog` in this folder except if `FullScreenImageViewer` already uses one internally.

- [ ] **Step 9: Re-run board + composer + helper tests — expect PASS**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/components/course/awards src/lib/awards/board-students.test.ts src/lib/awards/award-download.test.ts src/lib/awards/add-award-visibility.test.ts`

Expected: PASS

- [ ] **Step 10: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/components/primitives/empty/empty-copy-presets.ts \
  src/components/course/awards
git commit -m "$(cat <<'EOF'
feat: grant-centric awards board with composer and downloads

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec item | Task |
|---|---|
| Studio rail booleans / links on `/award-titles` | 1 |
| Oldest `display_template` on board grants | 2 |
| `has_display_template` on picker | 2 |
| Grade-gated display-template GET; catalog templates 403 for teachers | 2 |
| Batch POST, partial errors, empty 400, local all-fail delete | 3 |
| Academic ties both granted | 3 |
| Gallery/List, empty CTA, omit students without grants | 4 filters + 5 UI |
| Composer `revealBar`, checkboxes, title-first, local create | 5 |
| Downloads PNG + zip, no partial, omit empty Download all | 4 helpers + 5 UI |
| No Dialog for grant form | 5 tests |
| No `template_id` | all tasks |

No TBD. Types: `AwardDisplayTemplate`, `grant_awards_batch`, `createAwardGrantBatch`, `StudioNavFlags` used consistently.
