# DVR Custom Fields (Form Designer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let DVR create include active form-designer custom user fields alongside the existing ten built-ins, and let verify edit/save those fields into `User.custom_data`.

**Architecture:** Keep the fixed built-in catalog. Expand create validation and the create picker with active `source=custom` `FieldDefinition` keys. Verify keeps GenericForm/Zod for built-ins and adds a form-config/`FieldRenderer` path for custom keys. Scoped backend allowlist lets the verifying user write DVR-selected `filled_by=admin` keys without opening ordinary self-edit.

**Tech Stack:** Django + DRF (`app_auth`, `app_custom_fields`), Next.js client components, Vitest, existing `useFieldDefinitions` / `useFormConfig` / `FieldRenderer` / `collectGroupPayload`, BE `./scripts/run_backend_tests.sh` with `--keepdb`.

**Spec:** `docs/superpowers/specs/2026-07-21-dvr-custom-fields-design.md`

## Global Constraints

- Keep the ten built-in DVR fields; only **add** active `source=custom` user definitions.
- Ignore `filled_by` / roles / `show_on_*` in the create picker.
- Custom fields default selected with `required: false`.
- Inactive/deleted custom definitions are omitted on verify (no error); skip required checks for those names.
- `fields[]` shape stays `[{ name, required }]`; custom `name` = bare `field_key`.
- Do not weaken ordinary user self-edit for `filled_by=admin` fields.
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>`.
- FE unit tests: `cd schedjuice-reimagined-fe && bun run test:unit -- <path>`.
- High-value tests only (auth/edge/required/inactive); no happy-path-only smoke.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `schedjuice-reimagined-be/app_auth/dvr.py` | Modify | Active custom keys helper; expand validate + missing-required |
| `schedjuice-reimagined-be/app_auth/tests/test_dvr.py` | Modify | Catalog/custom/missing/inactive tests |
| `schedjuice-reimagined-be/app_custom_fields/validation.py` | Modify | `allow_user_admin_keys` exception on write |
| `schedjuice-reimagined-be/app_custom_fields/tests/test_policy_validation.py` | Modify | Allowlist exception unit tests |
| `schedjuice-reimagined-be/app_auth/serializers.py` | Modify | Wire custom keys + `dvr_verify_id` allowlist; fix self-edit actor id check |
| `schedjuice-reimagined-be/app_auth/tests/test_dvr.py` | Modify | Serializer verify-write allowlist tests |
| `schedjuice-reimagined-fe/src/helpers/dvr.ts` | Modify | Builtin constant, partition, merge defaults, resolve verify fields |
| `schedjuice-reimagined-fe/src/helpers/dvr.test.ts` | Modify | Unit tests for new helpers |
| `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/create/page.tsx` | Modify | Custom field picker under built-ins |
| `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/page.tsx` | Modify | Label custom fields from definitions |
| `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/verify/page.tsx` | Modify | Dual-path verify + `custom_data` + `dvr_verify_id` submit |
| `schedjuice-reimagined-fe/src/components/dvr/dvr-verify-form.tsx` | Create | Composed verify form (built-in + custom) |

---

### Task 1: Backend — expand DVR field allowlist

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/dvr.py`
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_dvr.py`
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py` (only if `validate_fields` needs to pass keys — keep call site working)

**Interfaces:**
- Consumes: `active_definitions_qs`, `ENTITY_TYPE_USER`, `SOURCE_CUSTOM`
- Produces:
  - `active_custom_user_field_keys() -> set[str]`
  - `validate_dvr_fields(raw, *, custom_keys: Iterable[str] | None = None) -> list[dict]`

- [ ] **Step 1: Write the failing tests**

In `ValidateDvrFieldsTests` (keep existing cases; they pass `custom_keys=set()` implicitly via updated default — see Step 3):

```python
def test_accepts_active_custom_key_when_provided(self):
    out = validate_dvr_fields(
        [{"name": "employee_id", "required": False}],
        custom_keys={"employee_id"},
    )
    self.assertEqual(out[0]["name"], "employee_id")

def test_rejects_custom_key_not_in_provided_set(self):
    with self.assertRaises(ValidationError):
        validate_dvr_fields(
            [{"name": "employee_id", "required": False}],
            custom_keys=set(),
        )

def test_rejects_custom_key_colliding_with_builtin(self):
    with self.assertRaises(ValidationError):
        validate_dvr_fields(
            [{"name": "phone_number", "required": False}],
            custom_keys={"phone_number"},
        )
```

Note: collision case — if `phone_number` is in `DVR_FIELD_CATALOG`, it is already allowed as built-in; the collision reject applies only when validating that a **custom definition key** must not equal a built-in name when discovering keys. Implement as: `active_custom_user_field_keys` never returns keys in `DVR_FIELD_CATALOG`, and `validate_dvr_fields` treats catalog membership as built-in (allowed). Drop the colliding test above; replace with:

```python
def test_builtin_still_allowed_when_custom_keys_empty(self):
    out = validate_dvr_fields(
        [{"name": "phone_number", "required": True}],
        custom_keys=set(),
    )
    self.assertEqual(out[0]["name"], "phone_number")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_dvr.ValidateDvrFieldsTests -v 2`

Expected: FAIL (`custom_keys` unexpected kwarg or unknown field).

- [ ] **Step 3: Implement**

In `app_auth/dvr.py`:

```python
from app_custom_fields.constants import ENTITY_TYPE_USER, SOURCE_CUSTOM
from app_custom_fields.validation import active_definitions_qs

def active_custom_user_field_keys() -> set[str]:
    keys = set(
        active_definitions_qs(ENTITY_TYPE_USER)
        .filter(source=SOURCE_CUSTOM)
        .values_list("field_key", flat=True)
    )
    return keys - DVR_FIELD_CATALOG

def validate_dvr_fields(raw: Any, *, custom_keys: Iterable[str] | None = None) -> list[dict]:
    fields = normalize_dvr_fields(raw)
    if not fields:
        raise ValidationError({"fields": "Select at least one field."})
    names = [f["name"] for f in fields]
    if len(names) != len(set(names)):
        raise ValidationError({"fields": "Duplicate field names are not allowed."})
    allowed = set(DVR_FIELD_CATALOG)
    if custom_keys is None:
        allowed |= active_custom_user_field_keys()
    else:
        allowed |= set(custom_keys) - DVR_FIELD_CATALOG
    unknown = [n for n in names if n not in allowed]
    if unknown:
        raise ValidationError({"fields": f"Unknown fields: {', '.join(unknown)}"})
    return fields
```

Update existing `ValidateDvrFieldsTests` that reject unknown fields to pass `custom_keys=set()` so they stay DB-free `SimpleTestCase`s. Update `test_accepts_catalog_fields` similarly with `custom_keys=set()`.

Serializer `validate_fields` can keep calling `validate_dvr_fields(value)` (default loads DB keys).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_dvr.ValidateDvrFieldsTests -v 2`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/dvr.py app_auth/tests/test_dvr.py
git commit -m "$(cat <<'EOF'
feat(dvr): allow active custom field keys in DVR catalog validation

EOF
)"
```

---

### Task 2: Backend — required checks for `custom_data`

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/dvr.py`
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_dvr.py`
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py` (call site for `user_missing_required_fields` if signature gains kwargs — default OK)

**Interfaces:**
- Consumes: `_is_empty_value` from `app_custom_fields.validation`
- Produces: `user_missing_required_fields(user, fields, *, active_custom_keys: set[str] | None = None) -> list[str]`

- [ ] **Step 1: Write the failing tests**

In `RequiredFieldChecksTests`:

```python
def test_missing_required_custom_reads_custom_data(self):
    user = SimpleNamespace(custom_data={})
    fields = [{"name": "employee_id", "required": True}]
    self.assertEqual(
        user_missing_required_fields(
            user, fields, active_custom_keys={"employee_id"}
        ),
        ["employee_id"],
    )

def test_present_custom_not_missing(self):
    user = SimpleNamespace(custom_data={"employee_id": "E-1"})
    fields = [{"name": "employee_id", "required": True}]
    self.assertEqual(
        user_missing_required_fields(
            user, fields, active_custom_keys={"employee_id"}
        ),
        [],
    )

def test_inactive_required_custom_skipped(self):
    user = SimpleNamespace(custom_data={})
    fields = [{"name": "employee_id", "required": True}]
    self.assertEqual(
        user_missing_required_fields(
            user, fields, active_custom_keys=set()
        ),
        [],
    )
```

Update existing `test_missing_required` to pass `active_custom_keys=set()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_dvr.RequiredFieldChecksTests -v 2`

Expected: FAIL (kwargs / always uses getattr).

- [ ] **Step 3: Implement**

```python
from app_custom_fields.validation import _is_empty_value, active_definitions_qs

def user_missing_required_fields(
    user: Any,
    fields: Iterable[dict],
    *,
    active_custom_keys: set[str] | None = None,
) -> list[str]:
    if active_custom_keys is None:
        active_custom_keys = active_custom_user_field_keys()
    missing: list[str] = []
    for name in required_field_names(fields):
        if name in DVR_FIELD_CATALOG:
            value = getattr(user, name, None)
        elif name in active_custom_keys:
            data = getattr(user, "custom_data", None) or {}
            value = data.get(name)
        else:
            continue
        if _is_empty_value(value):
            missing.append(name)
    return missing
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_dvr.RequiredFieldChecksTests -v 2`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/dvr.py app_auth/tests/test_dvr.py
git commit -m "$(cat <<'EOF'
feat(dvr): check required custom fields via custom_data

EOF
)"
```

---

### Task 3: Backend — scoped verify write for `filled_by=admin`

**Files:**
- Modify: `schedjuice-reimagined-be/app_custom_fields/validation.py`
- Modify: `schedjuice-reimagined-be/app_custom_fields/tests/test_policy_validation.py`
- Modify: `schedjuice-reimagined-be/app_auth/dvr.py` (helper to resolve allowlist from DVR id + user)
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py`
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_dvr.py`

**Interfaces:**
- Consumes: pending `UserDataVerificationRequest`, DVR `fields`
- Produces:
  - `validate_custom_data_for_write(..., allow_user_admin_keys: Iterable[str] | None = None)`
  - `validate_user_custom_data_for_write(..., allow_user_admin_keys=...)`
  - `dvr_verify_allow_user_admin_keys(*, user, dvr_id) -> set[str]` — empty if no pending owned UDVR
  - `UserSerializer.validate` pops `dvr_verify_id` from attrs/initial_data and passes allowlist

- [ ] **Step 1: Write failing validation unit test**

In `app_custom_fields/tests/test_policy_validation.py` (same mock style as `test_admin_only_field_rejected_for_user_actor`):

```python
def test_admin_only_allowed_when_key_in_allowlist(self):
    d = _def("internal_note", filled_by=FILLED_BY_ADMIN)
    with patch(
        "app_custom_fields.validation.active_definitions_qs", return_value=[d]
    ):
        out = validate_user_custom_data_for_write(
            incoming={"internal_note": "secret"},
            existing={},
            partial=True,
            actor="user",
            allow_user_admin_keys={"internal_note"},
        )
    self.assertEqual(out.get("internal_note"), "secret")

def test_admin_only_still_rejected_without_allowlist(self):
    d = _def("internal_note", filled_by=FILLED_BY_ADMIN)
    with patch(
        "app_custom_fields.validation.active_definitions_qs", return_value=[d]
    ):
        with self.assertRaises(Exception):
            validate_user_custom_data_for_write(
                incoming={"internal_note": "secret"},
                existing={},
                partial=True,
                actor="user",
                allow_user_admin_keys=None,
            )
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_custom_fields.tests.test_policy_validation -v 2`

Expected: FAIL on allowlist kwargs / still rejected.

- [ ] **Step 3: Implement validation allowlist**

In `validate_custom_data_for_write`, add `allow_user_admin_keys: Iterable[str] | None = None`. Change the filled_by check to:

```python
allow = set(allow_user_admin_keys or ())
...
if (
    actor == FILLED_BY_USER
    and defs[k].filled_by == FILLED_BY_ADMIN
    and k not in allow
):
    field_validation_error(
        f"custom_data.{k}", "This field can only be set by staff."
    )
```

Thread the kwarg through `validate_user_custom_data_for_write`.

- [ ] **Step 4: Run validation tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_custom_fields.tests.test_policy_validation -v 2`

Expected: PASS

- [ ] **Step 5: Add DVR resolve helper + serializer wiring tests**

In `app_auth/dvr.py`:

```python
def dvr_verify_allow_user_admin_keys(*, user: Any, dvr_id: int) -> set[str]:
    from app_auth.models import UserDataVerificationRequest

    udvr = (
        UserDataVerificationRequest.objects.select_related(
            "data_verification_request"
        )
        .filter(
            user_id=user.id,
            data_verification_request_id=dvr_id,
            status=UserDataVerificationRequest.Status.PENDING,
        )
        .first()
    )
    if udvr is None:
        return set()
    fields = normalize_dvr_fields(udvr.data_verification_request.fields)
    names = {f["name"] for f in fields}
    return names & active_custom_user_field_keys()
```

In `UserSerializer.validate` (self-edit branch):

1. Fix actor detection to compare ids (required so ordinary self-edit is actually `actor="user"`):

```python
req_user = getattr(request, "user", None)
if (
    inst is not None
    and req_user is not None
    and getattr(req_user, "id", None) is not None
    and getattr(inst, "id", None) == getattr(req_user, "id", None)
):
    actor = "user"
```

2. Resolve allowlist from `dvr_verify_id` in `self.initial_data` (not a model field — pop before save):

```python
allow_user_admin_keys = None
raw_dvr_id = None
if isinstance(self.initial_data, dict):
    raw_dvr_id = self.initial_data.get("dvr_verify_id")
if raw_dvr_id is not None and actor == "user" and inst is not None:
    try:
        allow_user_admin_keys = dvr_verify_allow_user_admin_keys(
            user=inst, dvr_id=int(raw_dvr_id)
        )
    except (TypeError, ValueError):
        allow_user_admin_keys = set()
# pass allow_user_admin_keys into validate_user_custom_data_for_write
# ensure dvr_verify_id is not left in attrs
attrs.pop("dvr_verify_id", None)
```

Add a `TestCase` in `test_dvr.py` that creates user + admin-only `FieldDefinition` + pending UDVR, PATCHes via `UserSerializer` with `dvr_verify_id` and asserts `custom_data` updates; and a case without `dvr_verify_id` that rejects the same write when actor is user.

- [ ] **Step 6: Run DVR + policy tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_dvr app_custom_fields.tests.test_policy_validation -v 2`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd schedjuice-reimagined-be
git add app_custom_fields/validation.py app_custom_fields/tests/test_policy_validation.py app_auth/dvr.py app_auth/serializers.py app_auth/tests/test_dvr.py
git commit -m "$(cat <<'EOF'
feat(dvr): allow verify-scoped writes to admin-filled custom fields

EOF
)"
```

---

### Task 4: FE helpers — partition, defaults, resolve verify fields

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/dvr.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/dvr.test.ts`

**Interfaces:**
- Produces:
  - `DVR_BUILTIN_FIELD_NAMES: readonly string[]` (same ten as BE)
  - `isDvrBuiltinField(name: string): boolean`
  - `mergeCustomFieldDefaults(selected: DvrFieldConfig[], customKeys: string[]): DvrFieldConfig[]`
  - `resolveDvrVerifyFields(rawFields: unknown, activeCustomKeys: Set<string>): { builtins: DvrFieldConfig[]; customs: DvrFieldConfig[] }`

- [ ] **Step 1: Write failing unit tests**

```ts
import {
  DVR_BUILTIN_FIELD_NAMES,
  mergeCustomFieldDefaults,
  resolveDvrVerifyFields,
} from "./dvr";

describe("mergeCustomFieldDefaults", () => {
  it("appends missing custom keys without wiping existing toggles", () => {
    const selected = [{ name: "phone_number", required: true }];
    expect(
      mergeCustomFieldDefaults(selected, ["employee_id", "phone_number"]),
    ).toEqual([
      { name: "phone_number", required: true },
      { name: "employee_id", required: false },
    ]);
  });
});

describe("resolveDvrVerifyFields", () => {
  it("keeps builtins and only active customs", () => {
    const raw = [
      { name: "phone_number", required: true },
      { name: "employee_id", required: true },
      { name: "gone_field", required: true },
    ];
    expect(resolveDvrVerifyFields(raw, new Set(["employee_id"]))).toEqual({
      builtins: [{ name: "phone_number", required: true }],
      customs: [{ name: "employee_id", required: true }],
    });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/dvr.test.ts`

Expected: FAIL (exports missing).

- [ ] **Step 3: Implement helpers**

```ts
export const DVR_BUILTIN_FIELD_NAMES = [
  "communication_email",
  "alternative_name",
  "date_of_birth",
  "phone_number",
  "house_number",
  "street",
  "township",
  "city",
  "region",
  "country",
] as const;

const BUILTIN_SET = new Set<string>(DVR_BUILTIN_FIELD_NAMES);

export function isDvrBuiltinField(name: string): boolean {
  return BUILTIN_SET.has(name);
}

export function mergeCustomFieldDefaults(
  selected: DvrFieldConfig[],
  customKeys: string[],
): DvrFieldConfig[] {
  const have = new Set(selected.map((f) => f.name));
  const next = [...selected];
  for (const key of customKeys) {
    if (BUILTIN_SET.has(key)) continue;
    if (have.has(key)) continue;
    next.push({ name: key, required: false });
  }
  return next;
}

export function resolveDvrVerifyFields(
  rawFields: unknown,
  activeCustomKeys: Set<string>,
): { builtins: DvrFieldConfig[]; customs: DvrFieldConfig[] } {
  const configs = normalizeDvrFields(rawFields);
  const builtins: DvrFieldConfig[] = [];
  const customs: DvrFieldConfig[] = [];
  for (const c of configs) {
    if (isDvrBuiltinField(c.name)) builtins.push(c);
    else if (activeCustomKeys.has(c.name)) customs.push(c);
  }
  return { builtins, customs };
}
```

Keep `defaultDvrFieldConfigs()` as built-ins-only; create page merges customs after definitions load.

- [ ] **Step 4: Run tests**

Run: `cd schedjuice-reimagined-fe && bun run test:unit -- src/helpers/dvr.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/dvr.ts src/helpers/dvr.test.ts
git commit -m "$(cat <<'EOF'
feat(dvr): helpers for custom field defaults and verify resolve

EOF
)"
```

---

### Task 5: FE create page — list custom fields

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/create/page.tsx`

**Interfaces:**
- Consumes: `useFieldDefinitions(CUSTOM_FIELD_ENTITY_USER)`, `mergeCustomFieldDefaults`, `isDvrBuiltinField`

- [ ] **Step 1: Load definitions and merge defaults**

```tsx
const { data: definitions, isLoading: defsLoading, isError: defsError } =
  useFieldDefinitions(CUSTOM_FIELD_ENTITY_USER);

const customDefs = useMemo(
  () =>
    (definitions ?? []).filter(
      (d) => d.source === "custom" && d.is_active && !isDvrBuiltinField(d.field_key),
    ),
  [definitions],
);

useEffect(() => {
  if (customDefs.length === 0) return;
  setSelectedFields((prev) =>
    mergeCustomFieldDefaults(
      prev,
      customDefs.map((d) => d.field_key),
    ),
  );
}, [customDefs]);
```

- [ ] **Step 2: Extend `DvrFieldsFieldType` UI**

Keep built-in list from `DVR_FIELD_PATHS` / `DVR_BUILTIN_FIELD_NAMES`. Below it, render a “Custom fields” subsection:

- While `defsLoading`: small skeleton rows.
- On `defsError`: muted error text (“Could not load custom fields”).
- Else: same Checkbox + Required pattern as built-ins, label = `field_label || field_key`.

Wrap each row in `Field.Root` (same Base UI pattern as the FieldRootContext fix).

- [ ] **Step 3: Manual check**

Open `/data-verification-requests/create` with at least one active custom user field in form designer. Confirm it appears selected under built-ins and submits in `fields`.

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/(internal)/data-verification-requests/create/page.tsx
git commit -m "$(cat <<'EOF'
feat(dvr): include form-designer custom fields on create picker

EOF
)"
```

---

### Task 6: FE detail — show custom field labels

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/page.tsx`

- [ ] **Step 1: Load definitions and label**

Use `useFieldDefinitions` (or a label map from already-fetched defs). For each `normalizeDvrFields` entry:

- If built-in: existing humanized `name.replaceAll("_", " ")`.
- Else if definition found: `field_label`.
- Else: bare `field_key`.

Keep `Field.Root` wrapper around the list.

- [ ] **Step 2: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/(internal)/data-verification-requests/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(dvr): show custom field labels on DVR detail

EOF
)"
```

---

### Task 7: FE verify — dual-path form + submit

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/dvr/dvr-verify-form.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/verify/page.tsx`

**Interfaces:**
- Consumes: `resolveDvrVerifyFields`, `useFormConfig` or definitions → `filterConfigToKeys`, `buildConfigSchema`, `FieldRenderer` / `GroupSection`, `collectGroupPayload`, `updateEntity`
- Produces: `DvrVerifyForm` props `{ user, dvrId, rawFields, onVerified }`

- [ ] **Step 1: Build `DvrVerifyForm`**

Behavior:

1. `useFieldDefinitions` → `activeCustomKeys` = custom active keys.
2. `resolveDvrVerifyFields(rawFields, activeCustomKeys)`.
3. If both arrays empty → render “No fields to verify”.
4. Load `useFormConfig("edit", user.roles)` and `filterConfigToKeys(config, customKeySet)`.
5. Render:
   - Built-ins: existing Zod/`GenericForm` **or** equivalent AutoForm pick for builtin configs only (required flags from DVR).
   - Custom: map filtered groups through `GroupSection` / `FieldRenderer`. For read-only checks call `isFieldReadOnly(field, "admin")` so `filled_by=admin` fields stay editable on verify (product choice). Apply DVR required by marking those keys required in the custom zod/schema layer (override `required_at` for selected keys).
6. Submit:
   - Merge builtin payload + `collectGroupPayload` custom values into one PATCH body.
   - Include `dvr_verify_id: dvrId`.
   - `updateEntity("users", user.id, body)`.
   - On success → mark UserDVR verified (same as today) via callback.

If only built-ins remain, it is OK to keep the current `GenericForm` path inside the component for that branch to minimize risk.

- [ ] **Step 2: Wire verify page**

Replace inline `GenericForm` with:

```tsx
<DvrVerifyForm
  user={user}
  dvrId={Number(id)}
  rawFields={data.data.data[0].data_verification_request.fields}
  onVerified={() => {
    dvrUpdateMutation.mutate(
      { status: DataVerificationRequestStatus.VERIFIED },
      { onSuccess: () => router.push("/profile") },
    );
  }}
/>
```

Only call `onVerified` after user PATCH succeeds.

- [ ] **Step 3: Manual verification**

1. Create DVR including a custom field + one built-in; mark custom required.
2. As targeted user, open verify — both fields show; admin-filled custom is editable.
3. Submit updates `custom_data` and clears banner / marks verified.
4. Deactivate the custom definition; reopen verify — custom omitted; built-in still works.

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/dvr/dvr-verify-form.tsx src/app/(internal)/data-verification-requests/[id]/verify/page.tsx
git commit -m "$(cat <<'EOF'
feat(dvr): verify form supports form-designer custom fields

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Create allowlist = builtins ∪ active custom | Task 1 |
| `fields[]` bare `field_key` | Tasks 1, 5 |
| Defaults include customs selected | Tasks 4, 5 |
| Ignore `filled_by` in picker | Task 5 |
| Required check via `custom_data`; skip inactive | Task 2 |
| Scoped verify write for admin-filled | Task 3 |
| Create UI custom block | Task 5 |
| Detail labels | Task 6 |
| Verify omit inactive; dual-path UI; submit `custom_data` | Task 7 |
| High-value BE tests | Tasks 1–3 |
| FE helper tests | Task 4 |

## Self-review notes

- No TBD placeholders; collision handling clarified (strip catalog keys from custom key set).
- Actor id fix is intentional and required for “ordinary self-edit still blocks”.
- `dvr_verify_id` is request-only (initial_data), never persisted on User.
