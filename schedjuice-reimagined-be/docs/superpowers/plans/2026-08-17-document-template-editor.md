# Document Template Editor + Certificate Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-only block document template library and Docs-like editor (draft/publish, org vs private), retire the certificate-template product, and make Award titles Design-launcher-only.

**Architecture:** New tenant app `app_documents` stores `DocumentTemplate` (draft JSON + published snapshot). The editor is a scrolling flow document, not the award canvas. Certificates are deleted (schema drop, no data copy). Launcher Design tiles no longer require a sidebar nav child.

**Tech Stack:** Django 4.2 + DRF, tenant schemas, RBAC `document_template.manage`, Next.js App Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-document-template-editor-design.md`

**Slices:** Tasks 1–4 ship without documents (certs gone, award titles launcher-only). Tasks 5–11 add documents.

## Global Constraints

- v1 is authoring only: no generate/PDF, no teacher picker, no Code view, no camera/zoom/Fit, no autosave, no multi-page.
- Save writes `document` (draft). Publish copies draft → `published_document`. No version history table.
- Locked `{{key}}` palettes. Unknown tokens/blocks/table columns → 400.
- Someone else’s private template → **404**, not 403. Missing `document_template.manage` → **403**.
- Do **not** touch `Organization.certificate_id`, private-key uploads, Graph “certificate” errors, or `sdec-schedjuice-ms-certificate.pem`.
- Keep award + ID-card canvas editors and `composite()` for those kinds.
- `app_certificates` stays in `TENANT_APPS` as a **migrations stub** after DeleteModel so existing tenants can drop tables. Product views/urls/tests go away.
- BE tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`).
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- High-value tests only. No happy-path-only “renders” / Save-200 smoke.
- Do not touch the Railway/dev database.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `schedjuice-reimagined-fe/src/config/app-launcher.ts` | Modify | Standalone Design tiles (title/icon/perms) without a nav child |
| `schedjuice-reimagined-fe/src/config/nav-routes.tsx` | Modify | Remove Certificates (Academics) and Award titles (Setup) |
| `schedjuice-reimagined-fe/src/config/route-permissions.ts` | Modify | Drop certificate prefixes; add `/documents` and `/templates/document` |
| `schedjuice-reimagined-fe/src/lib/image-template/types.ts` | Modify | `TemplateKind` = `"award" \| "id_card"`; rename `AwardOrCertificateDocument` → `AwardDocument` |
| `schedjuice-reimagined-fe/src/lib/image-template/palette.ts` | Modify | Drop certificate palette |
| `schedjuice-reimagined-fe/src/lib/image-template/insert-chrome.ts` | Modify | Drop certificate branch |
| `schedjuice-reimagined-fe/src/lib/image-template/composite.ts` | Modify | Remove `compositeCertificateGraphics` |
| `schedjuice-reimagined-fe/src/lib/image-template/adapters/certificate.ts` | Delete | |
| Certificate FE routes, editor, generate, client-api, store, helpers | Delete | Product gone |
| `schedjuice-reimagined-be/app_rbac/catalog.py` | Modify | Add `document_template.manage`; remove `certificate.*` |
| `schedjuice-reimagined-be/app_rbac/defaults.py` | Modify | Admin + manager get `document_template.manage`; drop `certificate.*` |
| `schedjuice-reimagined-be/app_rbac/migrations/` | Create | Delete leftover `RolePermission` rows; grant new code |
| `schedjuice-reimagined-be/app_certificates/` | Strip | DeleteModel migration; remove views/urls/admin/tests |
| `schedjuice-reimagined-be/schedjuice_backend/urls.py` | Modify | Drop `app_certificates.urls`; add `app_documents.urls` |
| `schedjuice-reimagined-be/app_documents/` | Create | Models, validator, services, API, tests |
| `schedjuice-reimagined-fe/src/lib/document-template/` | Create | Types, empty doc, token extract, status, sample binder |
| `schedjuice-reimagined-fe/src/lib/documents-api.ts` | Create | CRUD + publish/duplicate/promote/assets |
| `schedjuice-reimagined-fe/src/app/(internal)/documents/page.tsx` | Create | Library |
| `schedjuice-reimagined-fe/src/app/(template-editor)/templates/document/[templateId]/page.tsx` | Create | Editor |
| `schedjuice-reimagined-fe/src/components/document-editor/` | Create | Shell + scrolling page + insert stack |

---

### Task 1: Launcher-only Design tiles + drop sidebar Certificates / Award titles

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/app-launcher.ts`
- Modify: `schedjuice-reimagined-fe/src/config/__tests__/app-launcher.test.ts`
- Modify: `schedjuice-reimagined-fe/src/config/nav-routes.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/app-launcher/app-launcher-trigger.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/app-launcher/app-launcher-dialog.test.tsx`

**Interfaces:**
- Consumes: existing `isChildVisible` for finance tiles that still live in nav
- Produces: `AppLauncherTileDef` may include `title`, `icon`, `requiredPermissions` for launcher-only tiles

Today `buildVisibleLauncherGroups` **skips** a tile if `findNavChildByHref` misses. Award titles and Documents must not depend on the sidebar.

- [ ] **Step 1: Write the failing launcher tests**

Replace `every tile href matches a navLinks child` and the certificate filter cases in `app-launcher.test.ts`:

```ts
it("finance tiles match a navLinks child; design tiles may be standalone", () => {
  const hrefs = hrefsInNav();
  for (const tile of APP_LAUNCHER_TILES) {
    if (tile.title) continue;
    expect(hrefs.has(tile.href), tile.href).toBe(true);
  }
});

it("omits Award titles and Staff Payments without their permissions", () => {
  const groups = buildVisibleLauncherGroups({
    checker: makePermissionChecker(["course.view"]),
    tenant,
    user: { roles: [role.teacher] } as accountType,
  });
  const hrefs = groups.flatMap((g) => g.tiles.map((t) => t.href));
  expect(hrefs).not.toContain("/award-titles");
  expect(hrefs).not.toContain("/certificates");
  expect(hrefs).not.toContain("/finances/staff-payments");
});
```

In `filterLauncherGroups` sample, drop `"certificate.view"`. Change the CERTIFICATE query test to query `"award"` only (already covered) or `"document"` after Task 9. For this task, change it to:

```ts
it("is case-insensitive and treats empty query as no filter", () => {
  const upper = filterLauncherGroups(sample, "AWARD");
  expect(upper.flatMap((g) => g.tiles.map((t) => t.href))).toEqual([
    "/award-titles",
  ]);
  expect(filterLauncherGroups(sample, "   ")).toEqual(sample);
});
```

Add:

```ts
it("keeps Award titles in Design after it leaves the sidebar", () => {
  const setup = navLinks.find((s) => s.title === "Setup");
  expect(setup?.children?.some((c) => c.href === "/award-titles")).toBe(false);
  const groups = buildVisibleLauncherGroups({
    checker: makePermissionChecker(["award_title.manage"]),
    tenant,
    user: { roles: [role.admin] } as accountType,
  });
  expect(groups.find((g) => g.id === "design")?.tiles.map((t) => t.href)).toEqual([
    "/award-titles",
  ]);
});
```

If `app-launcher-trigger.test.tsx` uses `{ href: "/certificates", title: "Certificates" }`, switch the fixture to Award titles (`/award-titles`). Leave dialog tests that click Award titles as they are.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/app-launcher.test.ts`

Expected: FAIL on Setup still containing `/award-titles` and/or tiles still requiring nav children.

- [ ] **Step 3: Implement standalone tiles + nav cuts**

In `app-launcher.ts`:

```ts
export type AppLauncherTileDef = {
  group: AppLauncherGroupId;
  href: string;
  title?: string;
  icon?: navLinkType["icon"];
  requiredPermissions?: string[];
};
```

Import `Star` from `iconoir-react` (or reuse the same icon the Setup item used).

```ts
export const APP_LAUNCHER_TILES: AppLauncherTileDef[] = [
  { group: "finance", href: "/finances" },
  { group: "finance", href: "/finances/student-payments" },
  { group: "finance", href: "/finances/unpaid-students" },
  { group: "finance", href: "/finances/staff-payments" },
  {
    group: "design",
    href: "/award-titles",
    title: "Award titles",
    icon: Star,
    requiredPermissions: ["award_title.manage"],
  },
];
```

In `buildVisibleLauncherGroups`, before `findNavChildByHref`:

```ts
if (def.title && def.icon && def.requiredPermissions) {
  if (!args.checker.canAny(def.requiredPermissions)) continue;
  const tiles = byGroup.get(def.group) ?? [];
  tiles.push({
    group: def.group,
    href: def.href,
    title: def.title,
    icon: def.icon,
  });
  byGroup.set(def.group, tiles);
  continue;
}
```

In `nav-routes.tsx`: delete the Academics child `{ title: "Certificates", href: "/certificates", ... }` and the Setup child `{ title: "Award titles", href: "/award-titles", ... }`. Do not delete `/award-titles` pages.

- [ ] **Step 4: Re-run launcher tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/app-launcher.test.ts src/components/app-launcher/app-launcher-trigger.test.tsx src/components/app-launcher/app-launcher-dialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/config/app-launcher.ts src/config/__tests__/app-launcher.test.ts src/config/nav-routes.tsx src/components/app-launcher
git commit -m "feat(nav): launcher-only award titles; drop certificates from nav"
```

---

### Task 2: Delete the certificate-template frontend

**Files:**
- Delete: `src/app/(internal)/certificates/**`
- Delete: `src/app/(template-editor)/templates/certificate/**`
- Delete: `src/components/template-editor/certificate-editor.tsx`
- Delete: `src/lib/image-template/adapters/certificate.ts`
- Delete: `src/lib/image-template/adapters/certificate.test.ts`
- Delete: `src/lib/image-template/adapters/certificate-save-guard.test.ts`
- Delete: `src/helpers/image-editor/generate-via-composite.test.ts`
- Delete: `src/app/client-api/certificate-templates.ts`
- Delete: `src/store/certificate.ts`
- Delete: `src/types/certificate-template.ts`
- Delete: `src/types/certificate.ts` (only if it is the school-template type, not TLS)
- Delete: `src/helpers/certificate-template.ts`, `src/helpers/certificate.ts` if they only serve this product
- Delete: `src/components/image-editor/generate-container.tsx`
- Delete: `src/components/certificates/**` if unimported after the pages go
- Modify: `src/config/route-permissions.ts` — remove `/certificates` and `/templates/certificate`
- Modify: `src/config/__tests__/route-permissions.test.ts` — drop those cases if present
- Modify: `src/lib/image-template/types.ts`, `palette.ts`, `palette.test.ts`, `insert-chrome.ts`, `insert-chrome.test.ts`, `composite.ts`, `award-document.ts`, `award-editor.tsx`, and any file importing `AwardOrCertificateDocument`
- Modify: `src/helpers/image-editor/functions.ts` — remove `generateCertificates` if nothing else imports it
- Grep `src/` for `certificate` and remove **template** usages only. Leave org `certificate_id` / Microsoft copy.

**Interfaces:**
- Produces: `TemplateKind = "award" | "id_card"`; `AwardDocument` with `kind: "award"`; no `compositeCertificateGraphics`

- [ ] **Step 1: Write the failing kind/import tests**

Delete the `certificate menu does not include award photo` case from `palette.test.ts`. Add `src/lib/image-template/certificate-gone.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") return [];
      return walk(p);
    }
    return p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}

describe("certificate template product gone", () => {
  it("src has no certificate adapter or templates/certificate route", () => {
    const root = join(process.cwd(), "src");
    const hits: string[] = [];
    for (const file of walk(root)) {
      const text = readFileSync(file, "utf8");
      if (
        text.includes("adapters/certificate") ||
        text.includes("kind: \"certificate\"") ||
        text.includes("kind === \"certificate\"")
      ) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
```

Delete `insert-chrome.test.ts` case `omits Photo for certificates`.

- [ ] **Step 2: Run the new test — expect FAIL** (adapter still exists)

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template/certificate-gone.test.ts`

- [ ] **Step 3: Delete product code and retarget types**

1. Delete the files listed above.
2. `TemplateKind = "award" | "id_card"`.
3. Rename `AwardOrCertificateDocument` → `AwardDocument` with `kind: "award"` only. Update `award-document.ts`, `award-editor.tsx`, `composite.ts`.
4. `paletteForKind`: drop `CERTIFICATE_PALETTE` and the `certificate` branch.
5. Remove `compositeCertificateGraphics` and its `certificateGraphicsToDocument` import.
6. Remove route-permission rows for `/certificates` and `/templates/certificate`.
7. If `functions.ts` `generateCertificates` is unused, delete it.

Grep `src` for `Certificates`, `/certificates`, `certificate.view`, `certificate.manage` (template product). Do not remove org-settings `certificate_id`.

- [ ] **Step 4: Run unit tests for image-template + launcher + route-permissions**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/image-template src/config/__tests__/app-launcher.test.ts src/config/__tests__/route-permissions.test.ts src/components/template-editor`

Expected: PASS. Award editor tests still pass.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add -A src
git commit -m "feat(certs): remove certificate template editor and generate"
```

Do not `git add -A` if unrelated dirty files exist (fonts, named-person). Add only certificate-removal and type-rename paths.

---

### Task 3: RBAC — drop `certificate.*`, add `document_template.manage`

**Files:**
- Modify: `schedjuice-reimagined-be/app_rbac/catalog.py`
- Modify: `schedjuice-reimagined-be/app_rbac/defaults.py`
- Modify: `schedjuice-reimagined-be/app_rbac/tests/test_catalog.py`
- Create: data migration via `makemigrations app_rbac --name drop_certificate_perms`

**Interfaces:**
- Produces: catalog code `document_template.manage`; admin + manager defaults include it; `certificate.view|manage|generate` absent from catalog and `DEFAULT_MATRIX`

`seed_rbac()` **only adds** RolePermission rows. Existing tenants need a data migration to delete old codes and grant the new one.

- [ ] **Step 1: Write failing catalog tests**

Add to `test_catalog.py`:

```python
def test_document_template_manage_exists(self):
    self.assertIn("document_template.manage", catalog.ALL_CODES)
    perm = catalog.BY_CODE["document_template.manage"]
    self.assertEqual(perm.tier, catalog.SCHOOL)
    self.assertEqual(perm.data_class, "Operational")

def test_certificate_codes_removed(self):
    for code in ("certificate.view", "certificate.manage", "certificate.generate"):
        self.assertNotIn(code, catalog.ALL_CODES)
```

Add to `test_seeding.py` (or catalog tests) that `"document_template.manage"` is in `defaults.DEFAULT_MATRIX["admin"]` and `["manager"]`, and no matrix list contains a `certificate.` prefix.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_rbac.tests.test_catalog app_rbac.tests.test_seeding`

- [ ] **Step 3: Update catalog + defaults**

Replace the three `_p("certificate...` entries in `catalog.py` with:

```python
_p(
    "document_template.manage",
    "Manage document templates",
    "manage document templates",
    "Operational",
),
```

In `defaults.py`:
- admin: remove the three `certificate.*` lines; add `"document_template.manage"` next to `"award_title.manage"`
- manager: remove `"certificate.view"`; add `"document_template.manage"` next to `"award_title.manage"`

Grep `schedjuice-reimagined-be` for `certificate.view` / `certificate.manage` / `certificate.generate` and update tests (e.g. `app_certificates/tests` still exists until Task 4).

- [ ] **Step 4: Data migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_rbac --name drop_certificate_perms
```

Edit the migration operations to include `RunPython`:

```python
OLD = ("certificate.view", "certificate.manage", "certificate.generate")
NEW = "document_template.manage"
GRANT_SLUGS = ("admin", "manager")

def forwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    RolePermission.objects.filter(permission_code__in=OLD).delete()
    for slug in GRANT_SLUGS:
        role = Role.objects.filter(slug=slug).first()
        if role is None:
            continue
        RolePermission.objects.get_or_create(role=role, permission_code=NEW)

def backwards(apps, schema_editor):
    pass
```

- [ ] **Step 5: Re-run catalog/seeding tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_rbac.tests.test_catalog app_rbac.tests.test_seeding`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-be
git add app_rbac/catalog.py app_rbac/defaults.py app_rbac/tests app_rbac/migrations
git commit -m "feat(rbac): replace certificate perms with document_template.manage"
```

---

### Task 4: Drop certificate API and tables

**Files:**
- Create: `app_certificates/migrations/0003_delete_certificate_models.py` via makemigrations after emptying models
- Modify: `app_certificates/models.py` — empty (no models)
- Delete: `app_certificates/views.py`, `urls.py`, `admin.py`, `serializers.py`, `tests/`
- Modify: `schedjuice_backend/urls.py` — remove `path("api/v1/", include("app_certificates.urls"))`
- Keep: `app_certificates/apps.py` and `TENANT_APPS` / `INSTALLED_APPS` entries so the DeleteModel migration still applies

**Interfaces:**
- Produces: `/api/v1/certificate-templates` → 404; tables dropped on migrate

- [ ] **Step 1: Write a 404 regression in `app_awards` or a tiny `app_rbac` test is the wrong home.** Add `schedjuice-reimagined-be/app_certificates/tests/test_retired.py` **before** deleting the tests package — then after urls are removed, move this test to `app_documents/tests/test_certificate_retired.py` in Task 5. For this task, put it in `app_awards/tests/test_certificate_routes_retired.py` so it survives deleting `app_certificates/tests`:

```python
@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CertificateRoutesRetiredTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def test_list_404(self):
        with schema_context(self.schema_name):
            seed_rbac()
            admin = User.objects.create_user(
                email=f"adm-{uuid4().hex[:6]}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            client = APIClient()
            client.force_authenticate(user=admin)
            client.credentials(HTTP_TENANT=self.schema_name)
            with self.settings(RBAC_ENFORCE="enforce"):
                resp = client.get("/api/v1/certificate-templates")
        self.assertEqual(resp.status_code, 404)
```

Copy the `_database_reachable` / imports pattern from `test_award_templates.py`.

- [ ] **Step 2: Run — expect FAIL** (still 200/403, not 404)

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_certificate_routes_retired`

- [ ] **Step 3: Unhook URLs, delete product modules, DeleteModel**

1. Remove the include from `schedjuice_backend/urls.py`.
2. Delete views, urls, admin, serializers, old tests (`test_rbac_certificates.py`).
3. Empty `models.py` (file may be empty or a comment). Then:

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_certificates --name delete_certificate_models
```

Confirm the migration contains `DeleteModel` for `CertificateTemplate` and `CertificateTemplateCategory`.

4. Leave `AppCertificatesConfig` installed.

- [ ] **Step 4: Run 404 test + award template tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_awards.tests.test_certificate_routes_retired app_awards.tests.test_award_templates`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_certificates schedjuice_backend/urls.py app_awards/tests/test_certificate_routes_retired.py
git commit -m "feat(certs): drop certificate template API and models"
```

---

### Task 5: `validate_document` + empty document + untitled names

**Files:**
- Create: `schedjuice-reimagined-be/app_documents/apps.py`
- Create: `schedjuice-reimagined-be/app_documents/document.py`
- Create: `schedjuice-reimagined-be/app_documents/tests/test_document.py`
- Modify: `schedjuice_backend/settings.py` — add `"app_documents"` to `TENANT_APPS` and `INSTALLED_APPS` (next to `app_awards`)

**Interfaces:**
- Produces: `EMPTY_DOCUMENT: dict`, `next_untitled_name(names: list[str]) -> str` (copy the award algorithm), `INLINE_VARIABLE_KEYS`, `TABLE_COLUMN_KEYS`, `validate_document(document, *, for_publish: bool = False) -> None`

- [ ] **Step 1: Write failing validator tests** in `app_documents/tests/test_document.py` (no DB):

```python
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from app_documents.document import (
    EMPTY_DOCUMENT,
    next_untitled_name,
    validate_document,
)

class NextUntitledNameTests(SimpleTestCase):
    def test_untitled_then_numbered(self):
        self.assertEqual(next_untitled_name([]), "Untitled")
        self.assertEqual(next_untitled_name(["Untitled"]), "Untitled 2")

class ValidateDocumentTests(SimpleTestCase):
    def test_rejects_unknown_token(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [
            {"id": "t1", "type": "text", "text": "Hi {{not_a_key}}", "align": "left"}
        ]
        with self.assertRaises(ValidationError) as ctx:
            validate_document(doc)
        self.assertIn("blocks", ctx.exception.detail)

    def test_rejects_unknown_block_type(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [{"id": "x", "type": "video"}]
        with self.assertRaises(ValidationError):
            validate_document(doc)

    def test_rejects_nested_columns(self):
        doc = dict(EMPTY_DOCUMENT)
        inner = {"id": "c2", "type": "columns", "columns": [[], []]}
        doc["blocks"] = [{"id": "c1", "type": "columns", "columns": [[inner], []]}]
        with self.assertRaises(ValidationError):
            validate_document(doc)

    def test_rejects_table_inside_column(self):
        doc = dict(EMPTY_DOCUMENT)
        table = {"id": "g", "type": "grades_table", "columns": [{"key": "mark", "label": "Mark"}]}
        doc["blocks"] = [{"id": "c1", "type": "columns", "columns": [[table], []]}]
        with self.assertRaises(ValidationError):
            validate_document(doc)

    def test_save_allows_empty_image_url(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [{"id": "i", "type": "image", "url": None, "width": 40, "align": "left"}]
        validate_document(doc)

    def test_publish_rejects_empty_image_url(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [{"id": "i", "type": "image", "url": None, "width": 40, "align": "left"}]
        with self.assertRaises(ValidationError):
            validate_document(doc, for_publish=True)

    def test_publish_rejects_empty_grades_columns(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [{"id": "g", "type": "grades_table", "columns": []}]
        with self.assertRaises(ValidationError):
            validate_document(doc, for_publish=True)

    def test_rejects_output_data_url(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [
            {"id": "i", "type": "image", "url": "data:image/png;base64,xx", "width": 40, "align": "left"}
        ]
        with self.assertRaises(ValidationError):
            validate_document(doc)
```

- [ ] **Step 2: Run — expect FAIL** (app/module missing)

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_documents.tests.test_document`

- [ ] **Step 3: Implement `document.py`**

```python
import copy
import re
from rest_framework.exceptions import ValidationError

TOKEN_RE = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")

INLINE_VARIABLE_KEYS = frozenset(
    {
        "school_name",
        "student_name",
        "registration",
        "course_name",
        "period",
        "academic_year",
        "current_date",
        "mt_name",
        "pronoun",
    }
)
TABLE_COLUMN_KEYS = frozenset({"subject_name", "mark", "letter_grade", "comment"})
BLOCK_TYPES = frozenset({"text", "image", "columns", "grades_table"})
COLUMN_CHILD_TYPES = frozenset({"text", "image"})
PAGE_PRESETS = {
    "a4_portrait": (210.0, 297.0),
    "a4_landscape": (297.0, 210.0),
    "letter_portrait": (215.9, 279.4),
}

EMPTY_DOCUMENT = {
    "version": 1,
    "page": {"preset": "a4_portrait", "width": 210, "height": 297, "unit": "mm"},
    "blocks": [],
}

def next_untitled_name(names: list[str]) -> str:
    used = {n.strip().lower() for n in names}
    if "untitled" not in used:
        return "Untitled"
    n = 2
    while f"untitled {n}" in used:
        n += 1
    return f"Untitled {n}"
```

Implement `validate_document`:
- `document` must be a dict, `version == 1`, `page.unit == "mm"`, preset in `PAGE_PRESETS` or `"custom"`.
- `width`/`height` finite, `1 <= side <= 1000`.
- Named presets may snap/check approx equality (tolerance 0.05 mm) against `PAGE_PRESETS`.
- Walk `blocks` (and column children) with a path like `blocks.0`.
- Unknown `type` → 400. `columns` must be a list of **exactly two** lists. Nested `columns` or `grades_table` in a column → 400. Column children only `text`/`image`.
- Extract tokens from every `text` field; key not in `INLINE_VARIABLE_KEYS` → 400.
- `grades_table.columns[].key` must be in `TABLE_COLUMN_KEYS`.
- Recursively reject strings starting with `data:image` or `data:application/pdf`.
- If `for_publish`: every `image.url` is a non-empty str; every `grades_table.columns` has length ≥ 1.

Register the app in both `TENANT_APPS` and `INSTALLED_APPS`. `apps.py` like `app_awards`.

- [ ] **Step 4: Re-run validator tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_documents.tests.test_document`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_documents schedjuice_backend/settings.py
git commit -m "feat(documents): validate block document JSON"
```

---

### Task 6: `DocumentTemplate` model

**Files:**
- Create: `schedjuice-reimagined-be/app_documents/models.py`
- Create: `schedjuice-reimagined-be/app_documents/tests/test_models.py`
- Create: migration `app_documents/migrations/0001_initial.py` via makemigrations

**Interfaces:**
- Produces: `DocumentTemplate` (`name`, `scope` org|user, `owner`, `document`, `published_document`, `created_by`); `DocumentTemplateAsset` (`template` FK, `image` ImageField)

- [ ] **Step 1: Failing uniqueness tests** (same tenant TestCase pattern as `AwardTemplateModelTests`)

```python
def test_org_duplicate_name_case_insensitive(self):
    with schema_context(self.schema_name):
        DocumentTemplate.objects.create(
            name="Offer",
            scope=DocumentTemplate.Scope.ORG,
            document=dict(EMPTY_DOCUMENT),
        )
        with self.assertRaises(IntegrityError):
            DocumentTemplate.objects.create(
                name="offer",
                scope=DocumentTemplate.Scope.ORG,
                document=dict(EMPTY_DOCUMENT),
            )

def test_two_owners_may_share_private_name(self):
    with schema_context(self.schema_name):
        a = User.objects.create_user(...)
        b = User.objects.create_user(...)
        DocumentTemplate.objects.create(
            name="Mine",
            scope=DocumentTemplate.Scope.USER,
            owner=a,
            document=dict(EMPTY_DOCUMENT),
        )
        DocumentTemplate.objects.create(
            name="Mine",
            scope=DocumentTemplate.Scope.USER,
            owner=b,
            document=dict(EMPTY_DOCUMENT),
        )
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_documents.tests.test_models`

- [ ] **Step 3: Model + migration**

```python
class DocumentTemplate(BaseModel):
    class Scope(models.TextChoices):
        ORG = "org", "org"
        USER = "user", "user"

    name = models.CharField(max_length=128)
    scope = models.CharField(max_length=8, choices=Scope.choices)
    owner = models.ForeignKey("app_auth.User", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    document = models.JSONField(default=dict)
    published_document = models.JSONField(null=True, blank=True)
    created_by = models.ForeignKey("app_auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
```

Constraints:
- Unique `Lower("name")` where `scope=org`
- Unique `owner`, `Lower("name")` where `scope=user`
- Check: `(scope=org AND owner IS NULL) OR (scope=user AND owner IS NOT NULL)`

`DocumentTemplateAsset`: `template` CASCADE, `ImageField` `upload_to` `{schema}/document_templates/{filename}` with `PublicMediaStorage` like awards.

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_documents --name initial
```

- [ ] **Step 4: Re-run model tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_documents.tests.test_models`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_documents
git commit -m "feat(documents): DocumentTemplate model and uniqueness"
```

---

### Task 7: CRUD API (list/create/get/patch/delete)

**Files:**
- Create: `app_documents/services.py`
- Create: `app_documents/serializers.py`
- Create: `app_documents/views.py`
- Create: `app_documents/urls.py`
- Modify: `schedjuice_backend/urls.py` — `include("app_documents.urls")`
- Create: `app_documents/tests/test_api.py`

**Interfaces:**
- Produces:
  - `visible_queryset(user) -> QuerySet` = org ∪ `owner=user`
  - `get_template_for(user, id) -> DocumentTemplate | None` (None → 404)
  - `create_document_template(*, scope, name, actor) -> DocumentTemplate`
  - `save_document_template(template, *, name=None, document=None) -> DocumentTemplate`
  - `derived_status(template) -> "draft" | "published"`
  - Routes: `GET/POST /document-templates`, `GET/PATCH/DELETE /document-templates/<id>`

- [ ] **Step 1: Failing API tests** in `test_api.py` using the same `xschedjuice` / `seed_rbac` / `RBAC_ENFORCE=enforce` setup as award templates.

Create `self.admin` (ADMIN), `self.manager` (MANAGER), `self.teacher` (TEACHER), `self.student` (STUDENT).

```python
def test_teacher_cannot_list(self):
    with self.settings(RBAC_ENFORCE="enforce"):
        resp = self._client(self.teacher).get(f"{self.api_prefix}/document-templates")
    self.assertEqual(resp.status_code, 403)

def test_student_cannot_create(self):
    with self.settings(RBAC_ENFORCE="enforce"):
        resp = self._client(self.student).post(
            f"{self.api_prefix}/document-templates",
            {"scope": "org"},
            format="json",
        )
    self.assertEqual(resp.status_code, 403)

def test_post_draft_published_null(self):
    resp = self._client(self.admin).post(
        f"{self.api_prefix}/document-templates",
        {"scope": "org"},
        format="json",
    )
    self.assertEqual(resp.status_code, 201, resp.content)
    body = resp.json()["data"]
    self.assertIsNone(body["published_document"])
    self.assertEqual(body["status"], "draft")
    self.assertEqual(body["scope"], "org")

def test_unknown_token_patch_400(self):
    created = self._client(self.admin).post(..., {"scope": "org"}, format="json")
    tid = created.json()["data"]["id"]
    doc = dict(EMPTY_DOCUMENT)
    doc["blocks"] = [{"id": "t", "type": "text", "text": "{{nope}}", "align": "left"}]
    resp = self._client(self.admin).patch(
        f"{self.api_prefix}/document-templates/{tid}",
        {"document": doc},
        format="json",
    )
    self.assertEqual(resp.status_code, 400)
    self.assertTrue(resp.json().get("details") or resp.json())

def test_private_of_other_user_404(self):
    # admin A creates private; admin B GET → 404
    ...

def test_duplicate_org_name_400(self):
    ...
```

Use two admin users for the 404 case. PATCH with `document` must not set `published_document`.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_documents.tests.test_api`

- [ ] **Step 3: Implement services/views**

`create_document_template`: resolve name via `next_untitled_name` within the uniqueness set (org names vs that owner’s private names). `document=dict(EMPTY_DOCUMENT)`, `published_document=None`. `scope=user` → `owner=actor`. Duplicate iexact name → `ValidationError({"name": ...})`.

`save_document_template`: if `document` is not None, `validate_document(document)` then assign. Name trim required if provided.

`derived_status`: `"published"` iff `published_document is not None` and `published_document == document`; else `"draft"`.

Views: `required_permissions` all methods `document_template.manage`. `get_template_for` returns None for other people’s private rows → `not_found`. Serializer fields: `id`, `name`, `scope`, `owner_id`, `document`, `published_document`, `status`, `updated_at`, `created_by_id`.

List GET: org + mine, order by name.

- [ ] **Step 4: Re-run API tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_documents.tests.test_api`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_documents schedjuice_backend/urls.py
git commit -m "feat(documents): document template CRUD API"
```

---

### Task 8: Publish, duplicate, promote, assets

**Files:**
- Modify: `app_documents/services.py`, `views.py`, `urls.py`, `tests/test_api.py`

**Interfaces:**
- Produces:
  - `publish_document_template(template) -> DocumentTemplate` — `validate_document(..., for_publish=True)` then `published_document = copy.deepcopy(document)`
  - `duplicate_to_private(template, actor) -> DocumentTemplate` — org only; new `scope=user`, copy `document`, `published_document=None`
  - `promote_to_org(template, actor) -> DocumentTemplate` — caller must be owner; new org draft; name clash → 400
  - `POST /document-templates/:id/publish|duplicate|promote`
  - `POST /document-templates/:id/assets` multipart `file` → `{ url }`

- [ ] **Step 1: Failing tests**

```python
def test_publish_null_image_400(self):
    # create, patch image url null, POST publish → 400; GET still published_document null

def test_publish_idempotent_when_equal(self):
    # publish empty blocks (valid), publish again → 200, status published

def test_duplicate_org_to_private_clears_published(self):
    # publish org, POST duplicate, copy is scope=user, owner=caller, published_document null, document equal

def test_promote_name_collision_400(self):
    # org named "Offer"; private named "Offer"; promote → 400

def test_promote_creates_unpublished_org(self):
    # private with document; promote; new org row published_document null
```

Duplicate of private → 400. Promote of org → 400.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_documents.tests.test_api.DocumentTemplateApiTests.test_publish_null_image_400`

- [ ] **Step 3: Implement endpoints**

Publish already-equal: still 200, rewrite `published_document = deepcopy(document)`.

Assets: `DocumentTemplateAsset.objects.create(template=..., image=file)`; return absolute/media URL the same way `AwardTemplateSerializer.get_background_url` does. 400 if missing file. Same 404 visibility as GET.

- [ ] **Step 4: Re-run `test_api`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_documents
git commit -m "feat(documents): publish, duplicate, promote, and image assets"
```

---

### Task 9: FE library + Documents launcher tile

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/document-template/types.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/status.ts`
- Create: `schedjuice-reimagined-fe/src/lib/document-template/status.test.ts`
- Create: `schedjuice-reimagined-fe/src/lib/documents-api.ts`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/documents/page.tsx`
- Modify: `src/config/app-launcher.ts` — add Documents standalone tile
- Modify: `src/config/route-permissions.ts` — `{ prefix: "/documents", anyOf: ["document_template.manage"] }`
- Modify: `src/config/__tests__/app-launcher.test.ts`
- Modify: `src/config/__tests__/route-permissions.test.ts`

**Interfaces:**
- Produces: `derivedStatus({ document, published_document })` → `"draft" | "published"` matching the BE dict-equality rule (use `JSON.stringify` of parsed objects, or a stable `deepEqual`)
- `listDocumentTemplates`, `createDocumentTemplate`, `deleteDocumentTemplate`, `duplicateDocumentTemplate`, `promoteDocumentTemplate`

- [ ] **Step 1: Failing tests**

```ts
it("is published only when published_document deeply equals document", () => {
  const document = { version: 1, page: {}, blocks: [] };
  expect(derivedStatus({ document, published_document: null })).toBe("draft");
  expect(derivedStatus({ document, published_document: document })).toBe("published");
  expect(
    derivedStatus({ document, published_document: { ...document, blocks: [{ id: "x" }] } }),
  ).toBe("draft");
});
```

Launcher: teacher checker has no `/documents` tile; admin with `document_template.manage` sees `/documents` and `/award-titles` in Design. Setup still has no Award titles.

Route: `ruleForPath("/documents")` and `ruleForPath("/templates/document/1")` → `document_template.manage`.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/document-template/status.test.ts src/config/__tests__/app-launcher.test.ts src/config/__tests__/route-permissions.test.ts`

- [ ] **Step 3: Implement library page**

Follow `/award-titles/page.tsx`: `PageContainer`, `usePageHeader`, table. Two sections: **Org templates** and **My templates** (filter `scope`). Row menu: Edit → `/templates/document/${id}` (page may 404 until Task 10 — still link it). Duplicate (org rows), Promote (mine), Delete with confirm.

New: dialog org vs private, optional name, POST, `router.push(/templates/document/${id})`.

API wrappers use the same `axiosClient` + envelope pattern as `awards-api.ts`.

Launcher tile: `Page` (or `MultiplePages`) icon, `href: "/documents"`, `requiredPermissions: ["document_template.manage"]`. Place **after** Award titles in `APP_LAUNCHER_TILES`.

- [ ] **Step 4: Re-run those unit tests**

Expected: PASS (library page needs no “renders” test)

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/document-template src/lib/documents-api.ts src/app/\(internal\)/documents src/config
git commit -m "feat(documents): library page and Design launcher tile"
```

---

### Task 10: Editor session — Back / Save / Publish / dirty confirm

**Files:**
- Create: `src/lib/document-template/should-confirm-close.ts` (copy award helper) + test
- Create: `src/lib/document-template/tokens.ts` + `tokens.test.ts` — extract keys; `unknownTokens(text)` 
- Create: `src/components/document-editor/document-editor-shell.tsx` + test for dirty Back
- Create: `src/app/(template-editor)/templates/document/[templateId]/page.tsx`

**Interfaces:**
- Reuse `(template-editor)/layout.tsx` (already dark full-bleed)
- Shell props: `title`, `onTitleChange`, `status: "draft" | "published"`, `onBack`, `onSave`, `onPublish`, `saveDisabled`, `children` (the scrolling page)
- **No** Fit/zoom/camera controls in the shell (assert in test: queryByText `/Fit|100%/` is null)

- [ ] **Step 1: Failing tests**

```ts
it("confirms Back when dirty and not accepted", () => {
  expect(shouldConfirmClose({ dirty: true, userAccepted: false })).toBe(true);
  expect(shouldConfirmClose({ dirty: true, userAccepted: true })).toBe(false);
});

it("unknownTokens reports keys outside the locked palette", () => {
  expect(unknownTokens("Hi {{nope}}")).toEqual(["nope"]);
  expect(unknownTokens("Hi {{student_name}}")).toEqual([]);
});
```

Shell test: render with `onBack`. After marking dirty (expose a test hook or type in the title), click Back → confirm dialog. Cancel keeps the session (onBack not called with navigate). **No** `Fit` button.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/document-template src/components/document-editor`

- [ ] **Step 3: Implement shell + page**

Chrome: cream `data-theme="light"` header like `editor-shell.tsx` (Back, `Documents / {title}`, Draft/Published badge, Save, Publish). Pasteboard `data-theme="dark"` `overflow-y-auto`. **No** pan/zoom chip.

Page: GET template; keep `draft` state; Save PATCH `{ name, document }`; Publish POST; dirty flag on edits. `window.confirm` on Back when dirty (same as award editor). Cmd/Ctrl+S save.

If GET 403/404, show a simple error + Back to `/documents`.

Insert stack and block editing can be stubs that still persist `document.blocks` as returned from the API (empty array) — Task 11 fills them in. Save must send the in-memory document.

Client Save: if `unknownTokens` in any text block, block the PATCH and show an inline error (do not rely only on 400).

- [ ] **Step 4: Re-run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/document-template src/components/document-editor src/app/\(template-editor\)/templates/document
git commit -m "feat(documents): full-screen editor session without camera"
```

---

### Task 11: Blocks — text, variables, image, columns, grades table

**Files:**
- Create: `src/lib/document-template/empty.ts` — `emptyDocument()` matching `EMPTY_DOCUMENT`
- Create: `src/lib/document-template/sample-binder.ts` — sample strings for preview chips
- Create: `src/lib/document-template/insert.ts` — append block helpers
- Create: `src/lib/document-template/insert.test.ts`
- Modify: `src/components/document-editor/` — page, insert stack, text block with chips, image placeholder, two columns, grades table preview rows

**Interfaces:**
- `insertBlock(document, type)` appends a default block (`text` empty string; `image` url null; `columns` `[[],[]]`; `grades_table` columns `[{key:"subject_name",label:"Subject"},{key:"mark",label:"Mark"}]`)
- `insertVariable(text, caret, key) -> { text, caret }` using `{{key}}`
- Preview: replace tokens with sample binder for **display**; stored JSON keeps tokens

- [ ] **Step 1: Failing insert tests**

```ts
it("inserts grades_table without student rows", () => {
  const next = insertBlock(emptyDocument(), "grades_table");
  const table = next.blocks.at(-1);
  expect(table?.type).toBe("grades_table");
  expect(table && "rows" in table ? table.rows : undefined).toBeUndefined();
  expect(table?.type === "grades_table" && table.columns.length).toBeGreaterThan(0);
});

it("insertVariable uses locked keys only", () => {
  expect(INLINE_VARIABLE_KEYS.has("student_name")).toBe(true);
  expect(INLINE_VARIABLE_KEYS.has("award_title")).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/document-template/insert.test.ts`

- [ ] **Step 3: Implement the scrolling page**

Floating insert stack (text-led, left of the page): Text, Image, Layout, Table, Variables (menu of `INLINE_VARIABLE_KEYS`). Variables disabled unless a text caret exists.

White A4 frame (`aspect-ratio: 210/297` or height from page mm), scroll the pasteboard. ContentEditable or textarea-per-text-block is fine; chips are CSS on `{{key}}` spans. **Do not** add Fit/zoom.

Image: file input → `POST .../assets` → set `url`. Empty state allowed until Publish (Publish uses API 400).

Grades table: header from columns; **three sample rows** from `sample-binder` subjects — not stored.

Fonts: Noto Sans default; picker Noto Sans / Fraunces / Adobe Caslon Pro like awards.

Reorder: up/down handles on each block (enough; drag optional). Delete block when selected and caret not in text.

- [ ] **Step 4: Re-run document-template unit tests**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/document-template src/components/document-editor`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/document-template src/components/document-editor
git commit -m "feat(documents): text, image, columns, variables, and grades table"
```

---

## Self-review (spec coverage)

| Spec item | Task |
|---|---|
| Launcher-only Documents + Award titles | 1, 9 |
| Certificates removed from nav/launcher/editor/API/models/perms | 1–4 |
| TLS / `certificate_id` untouched | 2 (grep exception) |
| Block JSON + palettes + Save vs Publish | 5, 7, 8 |
| Org vs private, 404 not 403 | 6, 7 |
| Duplicate / promote | 8, 9 |
| Docs-like scroll, no camera | 10, 11 |
| Teacher 403 / no tile | 7, 9 |
| Issued-PDF freeze | contract only (no task — v1 non-goal) |

No `TBD` / “add validation later”. `AwardOrCertificateDocument` rename is in Task 2. `app_certificates` remains a migration stub on purpose.
