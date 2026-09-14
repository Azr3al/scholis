# Award Title Single Certificate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce at most one certificate (`AwardTemplate`) per org `AwardTitle`, with title-scoped certificate CRUD, a first-class `/award-titles/:id/certificate` editor, and simplified display-template resolution.

**Architecture:** Change `AwardTemplate.title` to `OneToOneField` with a data migration that keeps the newest duplicate per title. Replace list/template-id endpoints with `/award-titles/:id/certificate`. FE edit page shows Create/Edit certificate CTAs; `AwardEditor` loads by title id with a read-only award name in the shell.

**Tech Stack:** Django 4.2 + DRF + tenant schemas, Next.js App Router, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-13-award-title-single-certificate-design.md`

## Global Constraints

- At most **one** certificate per org `AwardTitle` (DB + API).
- Keep **`AwardTemplate` as its own table** — do not merge `document`/`background` onto `AwardTitle`.
- Migration keeps **newest** duplicate per title (`updated_at` desc, then `id` desc).
- Local titles (`course` set) cannot have certificates.
- Certificate editor at `/award-titles/:id/certificate`; metadata stays on `/award-titles/:id/edit`.
- Editor shell: award **name read-only**; save toast **"Certificate saved."**
- Remove `GET/POST /award-titles/:id/templates`, `GET/PATCH/DELETE /award-templates/:id`, `/templates/award/:templateId`.
- `POST` certificate when one exists → **409** `{ certificate: "This title already has a certificate." }`
- No delete button on edit page (DELETE endpoint exists for API parity only).
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- High-value tests only. Do not touch Railway/dev DB.
- Two git repos: commit BE in `schedjuice-reimagined-be`, FE in `schedjuice-reimagined-fe`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `schedjuice-reimagined-be/app_awards/migrations/0004_awardtemplate_onetoone.py` | Create | Dedupe rows; FK → OneToOne; unique on `title_id` |
| `schedjuice-reimagined-be/app_awards/models.py` | Modify | `OneToOneField`, drop name unique constraint |
| `schedjuice-reimagined-be/app_awards/services.py` | Modify | `create_award_certificate`, `save_award_certificate`, `serialize_display_template` |
| `schedjuice-reimagined-be/app_awards/views.py` | Modify | `AwardTitleCertificateView`; remove list/detail template views |
| `schedjuice-reimagined-be/app_awards/urls.py` | Modify | `/award-titles/:id/certificate` only |
| `schedjuice-reimagined-be/app_awards/tests/test_award_templates.py` | Modify | Certificate API tests (rename file optional) |
| `schedjuice-reimagined-be/app_awards/tests/test_services.py` | Modify | Drop oldest-wins; assert single template |
| `schedjuice-reimagined-be/app_awards/tests/test_rbac_awards.py` | Modify | Board/display-template against one template |
| `schedjuice-reimagined-fe/src/lib/awards-api.ts` | Modify | Certificate CRUD by title id |
| `schedjuice-reimagined-fe/src/lib/awards-api.test.ts` | Modify | `updateAwardCertificate` multipart |
| `schedjuice-reimagined-fe/src/app/(internal)/award-titles/[id]/edit/page.tsx` | Modify | Certificate section (Create / Edit) |
| `schedjuice-reimagined-fe/src/app/(internal)/award-titles/[id]/certificate/page.tsx` | Create | Full-screen certificate editor route |
| `schedjuice-reimagined-fe/src/components/template-editor/award-editor.tsx` | Modify | Load/save by `titleId` prop |
| `schedjuice-reimagined-fe/src/components/template-editor/editor-shell.tsx` | Modify | Optional `titleReadOnly` |
| `schedjuice-reimagined-fe/src/config/route-permissions.ts` | Modify | Remove `/templates/award` rule |
| `schedjuice-reimagined-fe/src/app/(template-editor)/templates/award/[templateId]/page.tsx` | Delete | Replaced by title-scoped route |
| `schedjuice-reimagined-fe/src/config/__tests__/route-permissions.test.ts` | Modify | Certificate route permission |

---

### Task 1: Data migration — dedupe and OneToOne

**Files:**
- Create: `schedjuice-reimagined-be/app_awards/migrations/0004_awardtemplate_onetoone.py`
- Modify: `schedjuice-reimagined-be/app_awards/models.py`

**Interfaces:**
- Produces: `AwardTemplate.title` as `OneToOneField(AwardTitle, related_name="template")`

- [ ] **Step 1: Write migration dedupe test**

Add to `schedjuice-reimagined-be/app_awards/tests/test_award_templates.py`:

```python
def test_migration_keeps_newest_template_per_title(self):
    suffix = uuid4().hex[:6]
    with schema_context(self.schema_name):
        title = AwardTitle.objects.create(
            name=f"Dup {suffix}",
            origin=AwardTitle.Origin.ADMIN,
            is_pinned=True,
        )
        older = AwardTemplate.objects.create(
            title=title,
            name="Older",
            document=dict(EMPTY_AWARD_DOCUMENT),
        )
        newer = AwardTemplate.objects.create(
            title=title,
            name="Newer",
            document=dict(EMPTY_AWARD_DOCUMENT),
        )
        AwardTemplate.objects.filter(pk=older.pk).update(
            updated_at=timezone.now() - timedelta(days=2)
        )
        AwardTemplate.objects.filter(pk=newer.pk).update(
            updated_at=timezone.now()
        )
        # After migration applied in test DB, only newer remains:
        remaining = list(AwardTemplate.objects.filter(title=title))
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0].pk, newer.pk)
```

Run migration in test setup or use `call_command("migrate", "app_awards", "0004", ...)` after writing migration. For TDD: write test, run migration manually once, then assert.

- [ ] **Step 2: Create migration `0004_awardtemplate_onetoone.py`**

```python
from django.db import migrations, models
import django.db.models.deletion
import app_awards.models


def dedupe_award_templates(apps, schema_editor):
    AwardTemplate = apps.get_model("app_awards", "AwardTemplate")
    from django.db.models import Count

    dup_title_ids = (
        AwardTemplate.objects.values("title_id")
        .annotate(c=Count("id"))
        .filter(c__gt=1)
        .values_list("title_id", flat=True)
    )
    for title_id in dup_title_ids:
        rows = list(
            AwardTemplate.objects.filter(title_id=title_id).order_by(
                "-updated_at", "-id"
            )
        )
        keeper_id = rows[0].id
        AwardTemplate.objects.filter(title_id=title_id).exclude(pk=keeper_id).delete()


class Migration(migrations.Migration):
    dependencies = [("app_awards", "0003_awardtemplate")]

    operations = [
        migrations.RunPython(dedupe_award_templates, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="awardtemplate",
            name="uniq_award_template_title_name",
        ),
        migrations.AlterField(
            model_name="awardtemplate",
            name="title",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="template",
                to="app_awards.awardtitle",
            ),
        ),
        migrations.AddConstraint(
            model_name="awardtemplate",
            constraint=models.UniqueConstraint(
                fields=["title"],
                name="uniq_award_template_title",
            ),
        ),
    ]
```

- [ ] **Step 3: Update `models.py`**

```python
class AwardTemplate(BaseModel):
    title = models.OneToOneField(
        AwardTitle,
        on_delete=models.CASCADE,
        related_name="template",
    )
    # ... rest unchanged; Meta.constraints drops uniq_award_template_title_name,
    # adds UniqueConstraint(fields=["title"], name="uniq_award_template_title")
```

- [ ] **Step 4: Run migration + model test**

Run: `cd schedjuice-reimagined-be && ./env/bin/python manage.py migrate app_awards --keepdb`

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_award_templates.AwardTemplateModelTests`

Expected: PASS

- [ ] **Step 5: Commit (BE)**

```bash
git add app_awards/models.py app_awards/migrations/0004_awardtemplate_onetoone.py app_awards/tests/test_award_templates.py
git commit -m "feat(awards): one-to-one AwardTemplate per AwardTitle with dedupe migration"
```

---

### Task 2: Certificate service layer

**Files:**
- Modify: `schedjuice-reimagined-be/app_awards/services.py`
- Modify: `schedjuice-reimagined-be/app_awards/tests/test_services.py`

**Interfaces:**
- Produces:
  - `create_award_certificate(title: AwardTitle, actor) -> AwardTemplate`
  - `get_award_certificate(title: AwardTitle) -> AwardTemplate | None`
  - `save_award_certificate(template, *, document=None, background=None) -> AwardTemplate`
  - `serialize_display_template(title, request=None) -> dict | None` (uses `title.template`)

- [ ] **Step 1: Replace oldest-wins test with single-template test**

In `test_services.py`, replace `test_display_template_is_oldest` with:

```python
def test_display_template_returns_linked_template(self):
    with schema_context(self.schema_name):
        top1 = AwardTitle.objects.create(
            name=f"Top {uuid4().hex[:6]}",
            origin=AwardTitle.Origin.ADMIN,
            is_pinned=True,
        )
        tmpl = AwardTemplate.objects.create(
            title=top1,
            name=top1.name,
            document=dict(EMPTY_AWARD_DOCUMENT),
        )
        payload = serialize_display_template(top1)
        self.assertEqual(payload["id"], tmpl.id)
```

Run: `./scripts/run_backend_tests.sh app_awards.tests.test_services::AwardServicesTests::test_display_template_returns_linked_template`

Expected: FAIL (`title.templates` / sort logic)

- [ ] **Step 2: Implement certificate services**

Replace `create_award_template` / simplify `save_award_template`:

```python
def serialize_display_template(title: AwardTitle, request=None) -> dict | None:
    if title.course_id is not None:
        return None
    template = getattr(title, "template", None)
    if template is None:
        try:
            template = title.template
        except AwardTemplate.DoesNotExist:
            return None
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


def create_award_certificate(title: AwardTitle, actor) -> AwardTemplate:
    if title.course_id is not None:
        raise ValidationError({"title": "Local titles cannot have templates."})
    if AwardTemplate.objects.filter(title=title).exists():
        raise ValidationError(
            {"certificate": "This title already has a certificate."}
        )
    return AwardTemplate.objects.create(
        title=title,
        name=title.name,
        document=dict(EMPTY_AWARD_DOCUMENT),
        background=None,
        created_by=actor,
    )


def get_award_certificate(title: AwardTitle) -> AwardTemplate | None:
    return AwardTemplate.objects.filter(title=title).first()


def save_award_certificate(
    template: AwardTemplate,
    *,
    document=None,
    background=None,
) -> AwardTemplate:
    if document is not None:
        validate_award_document(document)
        if not template.background and background is None:
            raise ValidationError({"background": "Background image is required."})
        template.document = document
    if background is not None:
        template.background = background
    template.save()
    return template
```

Remove old `create_award_template` and rename `save_award_template` callers to `save_award_certificate`.

- [ ] **Step 3: Update board prefetch**

In `course_awards_board`, change:

```python
.prefetch_related("title__templates")
```

to:

```python
.select_related("title__template")
```

- [ ] **Step 4: Run service tests**

Run: `./scripts/run_backend_tests.sh app_awards.tests.test_services`

Expected: PASS

- [ ] **Step 5: Commit (BE)**

```bash
git add app_awards/services.py app_awards/tests/test_services.py
git commit -m "feat(awards): title-scoped certificate services and display template"
```

---

### Task 3: Certificate API — new routes, remove old

**Files:**
- Modify: `schedjuice-reimagined-be/app_awards/views.py`
- Modify: `schedjuice-reimagined-be/app_awards/urls.py`
- Modify: `schedjuice-reimagined-be/app_awards/tests/test_award_templates.py`

**Interfaces:**
- Produces: `AwardTitleCertificateView` at `award-titles/<int:obj_id>/certificate`

- [ ] **Step 1: Write failing API tests**

Replace `/templates` paths in `test_award_templates.py`:

```python
def test_post_certificate_twice_returns_409(self):
    with schema_context(self.schema_name):
        client = self._client(self.admin)
        url = f"{self.api_prefix}/award-titles/{self.org_title.id}/certificate"
        resp1 = client.post(url, {}, format="json")
        self.assertEqual(resp1.status_code, 201, resp1.content)
        resp2 = client.post(url, {}, format="json")
        self.assertEqual(resp2.status_code, 409, resp2.content)
        self.assertIn("certificate", resp2.json().get("details", resp2.json()))

def test_get_certificate_404_when_missing(self):
    with schema_context(self.schema_name):
        resp = self._client(self.admin).get(
            f"{self.api_prefix}/award-titles/{self.org_title.id}/certificate",
        )
    self.assertEqual(resp.status_code, 404, resp.content)

def test_local_title_certificate_post_400(self):
    with schema_context(self.schema_name):
        resp = self._client(self.admin).post(
            f"{self.api_prefix}/award-titles/{self.local.id}/certificate",
            {},
            format="json",
        )
    self.assertEqual(resp.status_code, 400, resp.content)
```

Run: `./scripts/run_backend_tests.sh app_awards.tests.test_award_templates.AwardTemplateApiTests::test_post_certificate_twice_returns_409`

Expected: FAIL (404 route)

- [ ] **Step 2: Add `AwardTitleCertificateView`**

```python
from rest_framework import status

class AwardTitleCertificateView(RBACView):
    name = "Award title certificate"
    required_permissions = {
        "GET": "award_title.manage",
        "POST": "award_title.manage",
        "PATCH": "award_title.manage",
        "DELETE": "award_title.manage",
    }

    def _title(self, obj_id: int):
        return models.AwardTitle.objects.filter(pk=obj_id).first()

    def get(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        if title.course_id is not None:
            return self.validation_error(
                {"title": "Local titles cannot have templates."}
            )
        template = services.get_award_certificate(title)
        if template is None:
            return self.not_found("Certificate not found.")
        return self.ok(_template_payload(template, request))

    def post(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        try:
            template = services.create_award_certificate(title, acting_user(request))
        except ValidationError as exc:
            detail = exc.detail
            if isinstance(detail, dict) and "certificate" in detail:
                return Response(
                    {"isError": True, "message": "conflict", "details": detail},
                    status=status.HTTP_409_CONFLICT,
                )
            return self.validation_error(detail)
        return self.created(_template_payload(template, request))

    def patch(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        template = services.get_award_certificate(title)
        if template is None:
            return self.not_found("Certificate not found.")
        body = request.data or {}
        try:
            document = _parse_document(body.get("document")) if "document" in body else None
            background = body.get("background")
            if background == "" or background is None:
                background = request.FILES.get("background")
            template = services.save_award_certificate(
                template,
                document=document,
                background=background,
            )
        except ValidationError as exc:
            return self.validation_error(exc.detail)
        return self.ok(_template_payload(template, request))

    def delete(self, request, obj_id: int):
        title = self._title(obj_id)
        if title is None:
            return self.not_found("Award title not found.")
        template = services.get_award_certificate(title)
        if template is None:
            return self.not_found("Certificate not found.")
        template.delete()
        return self.deleted()
```

- [ ] **Step 3: Update `urls.py`**

```python
path(
    "award-titles/<int:obj_id>/certificate",
    views.AwardTitleCertificateView.as_view(),
    name="award-title-certificate",
),
```

Remove `award-title-templates` and `award-template-detail` paths. Delete `AwardTitleTemplateListView` and `AwardTemplateDetailsView` classes.

- [ ] **Step 4: Update remaining tests in `test_award_templates.py` and `test_rbac_awards.py`**

- Replace all `/templates` URLs with `/certificate`
- Replace all `/award-templates/{id}` PATCH URLs with `/award-titles/{title_id}/certificate`
- Remove `test_duplicate_name_on_title_raises` (name uniqueness per title no longer required) OR keep if `name` column still has no cross-title constraint
- Update `test_board_grant_includes_oldest_display_template` → assert the single linked template id

Run: `./scripts/run_backend_tests.sh app_awards.tests`

Expected: PASS

- [ ] **Step 5: Commit (BE)**

```bash
git add app_awards/views.py app_awards/urls.py app_awards/tests/
git commit -m "feat(awards): title-scoped certificate API; remove template list routes"
```

---

### Task 4: Frontend API client

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/awards-api.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/awards-api.test.ts`

**Interfaces:**
- Produces:
  - `getAwardCertificate(titleId: number): Promise<AwardTemplate | null>` (404 → null)
  - `createAwardCertificate(titleId: number): Promise<AwardTemplate>`
  - `updateAwardCertificate(titleId, input): Promise<AwardTemplate>`
  - `deleteAwardCertificate(titleId: number): Promise<void>`

- [ ] **Step 1: Update test for multipart PATCH**

```ts
describe("updateAwardCertificate", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue({
      data: {
        data: {
          id: 9,
          title: 42,
          document: { kind: "award", background: { url: null } },
          background_url: "https://cdn.example/bg.png",
        },
      },
    });
  });

  it("PATCHes award-titles/:id/certificate with multipart background", async () => {
    const file = new File(["png"], "bg.png", { type: "image/png" });
    const { updateAwardCertificate } = await import("@/lib/awards-api");
    await updateAwardCertificate(42, {
      document: { kind: "award", background: { url: null } },
      background: file,
    });
    expect(patchMock).toHaveBeenCalledWith(
      "award-titles/42/certificate",
      expect.any(FormData),
    );
    const body = patchMock.mock.calls[0][1] as FormData;
    expect(body.get("background")).toBe(file);
    expect(body.has("name")).toBe(false);
  });
});
```

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/awards-api.test.ts`

Expected: FAIL (`updateAwardTemplate` not found)

- [ ] **Step 2: Implement certificate API functions**

```ts
export async function getAwardCertificate(
  titleId: number,
): Promise<AwardTemplate | null> {
  try {
    const res = await axiosClient.get<Envelope<AwardTemplate>>(
      `award-titles/${titleId}/certificate`,
    );
    return res.data.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}

export async function createAwardCertificate(
  titleId: number,
): Promise<AwardTemplate> {
  const res = await axiosClient.post<Envelope<AwardTemplate>>(
    `award-titles/${titleId}/certificate`,
    {},
  );
  return res.data.data;
}

export async function updateAwardCertificate(
  titleId: number,
  input: { document?: unknown; background?: File },
): Promise<AwardTemplate> {
  if (input.background) {
    const body = new FormData();
    if (input.document !== undefined) {
      body.append("document", JSON.stringify(input.document));
    }
    body.append("background", input.background);
    const res = await axiosClient.patch<Envelope<AwardTemplate>>(
      `award-titles/${titleId}/certificate`,
      body,
    );
    return res.data.data;
  }
  const res = await axiosClient.patch<Envelope<AwardTemplate>>(
    `award-titles/${titleId}/certificate`,
    { document: input.document },
  );
  return res.data.data;
}

export async function deleteAwardCertificate(titleId: number): Promise<void> {
  await axiosClient.delete(`award-titles/${titleId}/certificate`);
}
```

Remove `listAwardTemplates`, `createAwardTemplate`, `getAwardTemplate`, `updateAwardTemplate`, `deleteAwardTemplate`.

- [ ] **Step 3: Run test**

Run: `npm run test:unit -- src/lib/awards-api.test.ts`

Expected: PASS

- [ ] **Step 4: Commit (FE)**

```bash
git add src/lib/awards-api.ts src/lib/awards-api.test.ts
git commit -m "feat(awards): title-scoped certificate API client"
```

---

### Task 5: Award title edit page — Certificate section

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/award-titles/[id]/edit/page.tsx`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/award-titles/[id]/edit/page.test.tsx`

**Interfaces:**
- Consumes: `getAwardCertificate`, `createAwardCertificate`

- [ ] **Step 1: Write edit page test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/awards-api", () => ({
  getAwardTitle: vi.fn().mockResolvedValue({
    id: 3,
    name: "Top 1",
    family: null,
    course: null,
    is_pinned: true,
    origin: "admin",
    retired_at: null,
    sort_order: 0,
    created_by: null,
    created_at: "",
  }),
  updateAwardTitle: vi.fn(),
  retireAwardTitle: vi.fn(),
  getAwardCertificate: vi.fn(),
  createAwardCertificate: vi.fn(),
}));

describe("AwardTitleEditPage certificate section", () => {
  it("shows Create certificate when none exists", async () => {
    const { getAwardCertificate } = await import("@/lib/awards-api");
    vi.mocked(getAwardCertificate).mockResolvedValue(null);
    const Page = (await import("./page")).default;
    render(<Page />);
    expect(await screen.findByRole("button", { name: /create certificate/i })).toBeTruthy();
  });

  it("shows Edit certificate link when one exists", async () => {
    const { getAwardCertificate } = await import("@/lib/awards-api");
    vi.mocked(getAwardCertificate).mockResolvedValue({
      id: 9,
      title: 3,
      name: "Top 1",
      document: {},
      background_url: null,
      created_by: null,
      created_at: "",
    });
    const Page = (await import("./page")).default;
    render(<Page />);
    const link = await screen.findByRole("link", { name: /edit certificate/i });
    expect(link.getAttribute("href")).toBe("/award-titles/3/certificate");
  });
});
```

Run: `npm run test:unit -- 'src/app/(internal)/award-titles/[id]/edit/page.test.tsx'`

Expected: FAIL

- [ ] **Step 2: Replace `AwardTitleTemplates` with `AwardTitleCertificate`**

```tsx
function AwardTitleCertificate({ titleId }: { titleId: number }) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const certificate = useQuery({
    queryKey: ["award-certificate", titleId],
    queryFn: () => getAwardCertificate(titleId),
    enabled: Number.isFinite(titleId),
  });

  const create = useMutation({
    mutationFn: () => createAwardCertificate(titleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["award-certificate", titleId] });
      router.push(`/award-titles/${titleId}/certificate`);
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not create certificate." });
    },
  });

  if (certificate.isLoading) return <Skeleton className="h-16 w-full" />;
  if (certificate.isError) {
    return <p className="text-sm text-danger">Could not load certificate.</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-text-primary">Certificate</h2>
      {certificate.data ? (
        <Link
          href={`/award-titles/${titleId}/certificate`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Edit certificate
        </Link>
      ) : (
        <>
          <p className="text-sm text-text-muted">No certificate yet.</p>
          <Button
            type="button"
            size="sm"
            isLoading={create.isLoading}
            onClick={() => create.mutate()}
          >
            Create certificate
          </Button>
        </>
      )}
    </section>
  );
}
```

Wire `AwardTitleCertificate` where `AwardTitleTemplates` was.

- [ ] **Step 3: Run test**

Expected: PASS

- [ ] **Step 4: Commit (FE)**

```bash
git add 'src/app/(internal)/award-titles/[id]/edit/'
git commit -m "feat(awards): certificate Create/Edit section on award title edit page"
```

---

### Task 6: Certificate editor route and AwardEditor

**Files:**
- Create: `schedjuice-reimagined-fe/src/app/(internal)/award-titles/[id]/certificate/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/template-editor/award-editor.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/template-editor/editor-shell.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/template-editor/editor-shell.test.tsx` (if exists) or `award-preview-dialog.test.tsx` patterns
- Delete: `schedjuice-reimagined-fe/src/app/(template-editor)/templates/award/[templateId]/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/config/route-permissions.ts`
- Modify: `schedjuice-reimagined-fe/src/config/__tests__/route-permissions.test.ts`

**Interfaces:**
- Consumes: `getAwardCertificate`, `updateAwardCertificate`, `getAwardTitle`
- Produces: `AwardEditor({ titleId: number })`

- [ ] **Step 1: Add `titleReadOnly` to EditorShell**

```tsx
export type EditorShellProps = {
  // ...
  titleReadOnly?: boolean;
};

// In header title area:
{titleReadOnly || !editingTitle ? (
  <span className="truncate font-medium">{displayTitle}</span>
) : (
  <input ... />
)}
// Skip onClick to edit when titleReadOnly
```

- [ ] **Step 2: Refactor `AwardEditor` to accept `titleId`**

Change from `useParams templateId` to prop `titleId: number`:

```tsx
export function AwardEditor({ titleId }: { titleId: number }) {
  const certificate = useQuery({
    queryKey: ["award-certificate", titleId],
    queryFn: () => getAwardCertificate(titleId),
    enabled: Number.isFinite(titleId),
  });
  const titleQuery = useQuery({
    queryKey: ["award-title", titleId],
    queryFn: () => getAwardTitle(titleId),
    enabled: Number.isFinite(titleId),
  });

  // On certificate 404, redirect to edit page
  useEffect(() => {
    if (certificate.isSuccess && certificate.data === null) {
      router.replace(`/award-titles/${titleId}/edit`);
    }
  }, [certificate.isSuccess, certificate.data, titleId, router]);

  const save = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("missing document");
      return updateAwardCertificate(titleId, {
        document,
        background: pendingFile ?? undefined,
      });
    },
    onSuccess: (saved) => { /* same document merge */ toast.add({ title: "Certificate saved." }); },
  });

  const displayName = titleQuery.data?.name ?? "Untitled";

  return (
    <EditorShell
      section="Award titles"
      title={displayName}
      titleReadOnly
      onTitleChange={() => {}}
      backHref={`/award-titles/${titleId}/edit`}
      ...
    />
  );
}
```

Remove `templateName` state and name from save payload.

- [ ] **Step 3: Create certificate page**

```tsx
"use client";

import { AwardEditor } from "@/components/template-editor/award-editor";
import { useParams } from "next/navigation";

export default function AwardTitleCertificatePage() {
  const { id } = useParams<{ id: string }>();
  const titleId = Number(id);
  if (!Number.isFinite(titleId)) return null;
  return <AwardEditor titleId={titleId} />;
}
```

- [ ] **Step 4: Route permissions**

Remove from `route-permissions.ts`:

```ts
{ prefix: "/templates/award", anyOf: ["award_title.manage"] },
```

Add test:

```ts
it("resolves /award-titles/:id/certificate for award_title.manage", () => {
  const rule = ruleForPath("/award-titles/3/certificate");
  expect(rule?.prefix).toBe("/award-titles");
});
```

Delete old `/templates/award` test.

- [ ] **Step 5: Grep and fix remaining imports**

Run: `rg "templates/award|getAwardTemplate|updateAwardTemplate|listAwardTemplates|createAwardTemplate" schedjuice-reimagined-fe/src`

Update any hits (editor tests, etc.).

- [ ] **Step 6: Run FE tests**

Run: `npm run test:unit -- src/components/template-editor src/config/__tests__/route-permissions.test.ts src/lib/awards-api.test.ts`

Expected: PASS

- [ ] **Step 7: Commit (FE)**

```bash
git add src/app/(internal)/award-titles/[id]/certificate/ src/components/template-editor/ src/config/ src/app/(template-editor)/templates/award/
git commit -m "feat(awards): title-scoped certificate editor route"
```

---

### Task 7: Final verification

- [ ] **Step 1: Backend full slice**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests`

Expected: PASS

- [ ] **Step 2: Frontend award-related tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/awards-api.test.ts src/app/(internal)/award-titles src/components/template-editor src/config/__tests__/route-permissions.test.ts`

Expected: PASS

- [ ] **Step 3: Manual smoke (optional)**

1. `/award-titles` → Edit org title → **Create certificate** → editor opens
2. Upload background, add text layer, Save → toast "Certificate saved."
3. Back → **Edit certificate** link works
4. Grant award on a course → gallery shows thumbnail when certificate exists

---

## Spec Self-Review (plan vs spec)

| Spec requirement | Task |
|---|---|
| OneToOne + dedupe newest | Task 1 |
| Title-scoped certificate API | Task 3 |
| Remove old template routes | Task 3, 6 |
| serialize_display_template single template | Task 2 |
| Edit page Create/Edit certificate | Task 5 |
| `/award-titles/:id/certificate` editor | Task 6 |
| Read-only name in editor | Task 6 |
| POST 409 duplicate | Task 3 |
| Local title 400 | Task 3 |
| No delete on edit page | Task 5 (no button) |
| Remove `/templates/award` | Task 6 |
| High-value tests | All tasks |

No placeholders remain. Types consistent: `titleId` everywhere on FE; `obj_id` on BE certificate view.
