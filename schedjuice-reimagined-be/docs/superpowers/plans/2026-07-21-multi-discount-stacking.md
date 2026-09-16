# Multi-Discount Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow multiple catalog discounts to stack on one enrollment, with independent-off-base math, payment line snapshots, and multi-select UX on payment upload + roster dialog.

**Architecture:** Drop the one-active `EnrollmentDiscount` constraint; keep one row per template. Extend `discount_engine` to sum period reductions off the same base (scale lines if sum > base). Snapshot lines onto new `UserPaymentDiscount` rows at payment create / invoice generation. FE pickers become multi-select against the same enrollment stack.

**Tech Stack:** Django, djmoney, tenant schemas, DRF, `./scripts/run_backend_tests.sh` (`--keepdb`), Next.js, TanStack Query, Vitest

**Spec:** `docs/superpowers/specs/2026-07-21-multi-discount-stacking-design.md` (workspace) / `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-21-multi-discount-stacking-design.md`

## Global Constraints

- Backend tests: always `./scripts/run_backend_tests.sh <target>` (includes `--keepdb --noinput`).
- High-value tests only: auth denials, duplicate template, clamp/scale, stack add/remove, snapshot lines — not happy-path-only 200 smoke.
- Non-retroactive: never recalculate existing `UserPayment` amounts when the stack changes.
- Independent-off-base stacking; duplicate catalog template blocked; no type exclusivity matrix.
- Omit `discount_ids` on payment create → leave stack unchanged; empty list / `clear_discount` → clear all.
- Commits: BE changes in `schedjuice-reimagined-be`; FE in `schedjuice-reimagined-fe`.

---

## File map

| File | Responsibility |
| --- | --- |
| `app_finance/models.py` | Constraint change; `UserPaymentDiscount` |
| `app_finance/migrations/00XX_*.py` | Schema + backfill join from `enrollment_discount` |
| `app_finance/discount_engine.py` | List actives; stacked compute; add without replace; set/remove; preview; consume per line |
| `app_finance/payment_discount_apply.py` | `discount_ids` / omit / clear; create join rows; stop writing `enrollment_discount` |
| `app_finance/serializers.py` | `discount_ids`, `discount_lines`, joined `discount_label` |
| `app_finance/views.py` | GET list; DELETE one; eligible `current` list |
| `app_finance/urls.py` | `discount/<enrollment_discount_id>` DELETE |
| `app_tasks/management/commands/generate_invoices.py` | Multi ED consume + create `UserPaymentDiscount` lines |
| `app_finance/tests/test_discount_engine.py` | Stack math / consume |
| `app_finance/tests/test_discount_api.py` | API stack behaviors |
| `app_finance/tests/test_payment_create_discount.py` | `discount_ids` + line snapshots |
| FE `payment-discount-picker.tsx` | Multi-select + `discount_ids` form append |
| FE `enrollment-discount-dialog.tsx` | Stack list + add/remove one |
| FE `remaining-amount.ts` | Multi-discount term fee preview |
| FE `payment-receipt.ts` | Multi discount lines |
| FE upload `page.tsx` + types | Wire `discountIds[]` |

---

### Task 1: Schema — multi-active constraint + `UserPaymentDiscount`

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/models.py`
- Create: migration via `makemigrations app_finance`
- Test: `schedjuice-reimagined-be/app_finance/tests/test_discount_engine.py` (constraint cases)

**Interfaces:**
- Produces: `UserPaymentDiscount` model; unique active `(user_course, discount)`; dropped `one_active_per_user_course`

- [ ] **Step 1: Write failing constraint tests**

In `test_discount_engine.py`, add:

```python
def test_two_active_enrollment_discounts_allowed_for_different_templates(self):
    with schema_context(self.schema_name):
        d1 = Discount.objects.create(
            name=f"p1-{uuid4().hex[:6]}",
            discount_type=Discount.DiscountType.PERCENT,
            percent_value=Decimal("10"),
            scope=Discount.Scope.WHOLE_ENROLLMENT,
            is_active=True,
        )
        d2 = Discount.objects.create(
            name=f"p2-{uuid4().hex[:6]}",
            discount_type=Discount.DiscountType.PERCENT,
            percent_value=Decimal("5"),
            scope=Discount.Scope.WHOLE_ENROLLMENT,
            is_active=True,
        )
        EnrollmentDiscount.objects.create(
            user_course=self.enrollment,
            discount=d1,
            snapshot_discount_type=d1.discount_type,
            snapshot_scope=d1.scope,
            snapshot_percent_value=d1.percent_value,
            applied_by=self.admin,
            is_active=True,
        )
        EnrollmentDiscount.objects.create(
            user_course=self.enrollment,
            discount=d2,
            snapshot_discount_type=d2.discount_type,
            snapshot_scope=d2.scope,
            snapshot_percent_value=d2.percent_value,
            applied_by=self.admin,
            is_active=True,
        )
        self.assertEqual(
            EnrollmentDiscount.objects.filter(
                user_course=self.enrollment, is_active=True
            ).count(),
            2,
        )

def test_duplicate_active_template_rejected(self):
    with schema_context(self.schema_name):
        d1 = Discount.objects.create(
            name=f"dup-{uuid4().hex[:6]}",
            discount_type=Discount.DiscountType.PERCENT,
            percent_value=Decimal("10"),
            scope=Discount.Scope.WHOLE_ENROLLMENT,
            is_active=True,
        )
        EnrollmentDiscount.objects.create(
            user_course=self.enrollment,
            discount=d1,
            snapshot_discount_type=d1.discount_type,
            snapshot_scope=d1.scope,
            snapshot_percent_value=d1.percent_value,
            applied_by=self.admin,
            is_active=True,
        )
        with self.assertRaises(IntegrityError):
            EnrollmentDiscount.objects.create(
                user_course=self.enrollment,
                discount=d1,
                snapshot_discount_type=d1.discount_type,
                snapshot_scope=d1.scope,
                snapshot_percent_value=d1.percent_value,
                applied_by=self.admin,
                is_active=True,
            )
```

- [ ] **Step 2: Run tests — expect fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine.DiscountEngineTests.test_two_active_enrollment_discounts_allowed_for_different_templates app_finance.tests.test_discount_engine.DiscountEngineTests.test_duplicate_active_template_rejected
```

Expected: first fails on unique-one-active constraint; second may pass or fail depending on current constraint.

- [ ] **Step 3: Update models**

In `EnrollmentDiscount.Meta.constraints`, replace the old unique with:

```python
constraints = [
    models.UniqueConstraint(
        fields=["user_course", "discount"],
        condition=models.Q(is_active=True) & models.Q(discount__isnull=False),
        name="app_finance_enrollmentdiscount_one_active_per_template",
    )
]
```

Add model (near `EnrollmentDiscount`):

```python
class UserPaymentDiscount(BaseModel):
    user_payment = models.ForeignKey(
        UserPayment,
        on_delete=models.CASCADE,
        related_name="payment_discounts",
    )
    enrollment_discount = models.ForeignKey(
        EnrollmentDiscount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_discount_lines",
    )
    label = models.CharField(max_length=255)
    amount = MoneyField(
        max_digits=19,
        decimal_places=4,
        default_currency="USD",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user_payment", "enrollment_discount"],
                condition=models.Q(enrollment_discount__isnull=False),
                name="app_finance_userpaymentdiscount_unique_ed_per_payment",
            )
        ]
```

- [ ] **Step 4: Makemigrations + data migration backfill**

```bash
./env/bin/python manage.py makemigrations app_finance
```

Add a `RunPython` in the same or follow-up migration:

```python
def backfill_payment_discount_lines(apps, schema_editor):
    UserPayment = apps.get_model("app_finance", "UserPayment")
    UserPaymentDiscount = apps.get_model("app_finance", "UserPaymentDiscount")
    for up in UserPayment.objects.filter(enrollment_discount_id__isnull=False).iterator():
        ed = up.enrollment_discount
        label = "Discount"
        if ed is not None:
            # Prefer related Discount.name if present
            disc = getattr(ed, "discount", None)
            if disc is not None and getattr(disc, "name", None):
                label = disc.name
        amount = up.discount_amount
        if amount is None:
            continue
        UserPaymentDiscount.objects.get_or_create(
            user_payment_id=up.id,
            enrollment_discount_id=up.enrollment_discount_id,
            defaults={"label": label, "amount": amount},
        )
```

Use `schema_editor.connection` / tenant-aware migration patterns already used in this app (mirror recent finance migrations). If tenant migrations run per-schema automatically via `migrate_schemas`, keep `RunPython` simple.

- [ ] **Step 5: Re-run constraint tests — expect pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine.DiscountEngineTests.test_two_active_enrollment_discounts_allowed_for_different_templates app_finance.tests.test_discount_engine.DiscountEngineTests.test_duplicate_active_template_rejected
```

- [ ] **Step 6: Commit (BE)**

```bash
git add app_finance/models.py app_finance/migrations/ app_finance/tests/test_discount_engine.py
git commit -m "$(cat <<'EOF'
feat(finance): allow multiple active enrollment discounts per template uniqueness

EOF
)"
```

---

### Task 2: Engine — stacked compute, add without replace, set/remove, preview, consume

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/discount_engine.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_discount_engine.py`

**Interfaces:**
- Consumes: multi-active `EnrollmentDiscount` rows from Task 1
- Produces:
  - `get_active_enrollment_discounts(user_course) -> list[EnrollmentDiscount]`
  - `InvoicedAmountResult` gains `lines: list[DiscountLineResult]` where `DiscountLineResult(enrollment_discount_id: int | None, label: str, amount: Money)`
  - `apply_enrollment_discount` no longer deactivates siblings; raises `ValueError("already_applied")` on duplicate template
  - `remove_enrollment_discount` clears **all** actives
  - `remove_enrollment_discount_by_id(user_course, enrollment_discount_id, removed_by)`
  - `set_enrollment_discounts(user_course, discount_ids, applied_by, org, as_of=None, reason="")`
  - `consume_discount_state_after_invoice` still per-ED; callers pass each line’s amount
  - `preview_invoiced_amounts` simulates all actives with independent credit state

- [ ] **Step 1: Write failing engine tests**

```python
def test_stack_two_percents_independent_off_base(self):
    # base 500; 10% + 5% → discount 50+25=75; invoiced 425
    ...

def test_stack_scales_when_sum_exceeds_base(self):
    # base 100; 60% + 60% → raw 120; scale to lines summing 100; invoiced 0
    ...

def test_apply_second_does_not_deactivate_first(self):
    # apply d1 then d2; both active
    ...

def test_apply_duplicate_template_raises(self):
    # apply d1 twice → ValueError
    ...

def test_set_enrollment_discounts_reconciles(self):
    # active [d1]; set [d2,d3] → d1 inactive, d2+d3 active
    ...

def test_consume_two_fixed_whole_enrollment_independently(self):
    # two fixed whole-enrollment EDs; after period 0 consume, each remaining_credit drops by its line amount
    ...
```

Use existing `setUp` fixtures (`self.plan` price 500, `self.enrollment`, `self.admin`, `self.org`).

- [ ] **Step 2: Run — expect fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine
```

- [ ] **Step 3: Implement engine helpers**

Replace singular getter usage for stacking paths:

```python
@dataclass(frozen=True)
class DiscountLineResult:
    enrollment_discount_id: int | None
    label: str
    amount: Money


@dataclass(frozen=True)
class InvoicedAmountResult:
    base_amount: Money
    discount_amount: Money
    invoiced_amount: Money
    lines: tuple[DiscountLineResult, ...] = ()


def get_active_enrollment_discounts(user_course: UserCourse) -> list[EnrollmentDiscount]:
    prefetched = getattr(user_course, "active_enrollment_discount_list", None)
    if prefetched is not None:
        return sorted([ed for ed in prefetched if ed.is_active], key=lambda e: e.id or 0)
    return list(
        EnrollmentDiscount.objects.filter(user_course=user_course, is_active=True)
        .select_related("discount")
        .order_by("id")
    )


def get_active_enrollment_discount(user_course: UserCourse) -> EnrollmentDiscount | None:
    """Compat: first active by id. Prefer get_active_enrollment_discounts."""
    eds = get_active_enrollment_discounts(user_course)
    return eds[0] if eds else None
```

Extract `_line_discount_for_ed(ed, base, billing_period_index) -> Money` from current single-ED branch.

In `compute_invoiced_amount`:

```python
eds = get_active_enrollment_discounts(user_course)
base = resolve_base_price(...)  # any active ED → plan price (update resolve_base_price to use get_active_enrollment_discounts)
if not eds:
    return InvoicedAmountResult(base, Money(0, base.currency), base, ())

raw_lines: list[DiscountLineResult] = []
for ed in eds:
    amt = _line_discount_for_ed(ed, base, billing_period_index)
    label = (ed.discount.name if ed.discount_id and ed.discount else "Discount")
    raw_lines.append(DiscountLineResult(ed.id, label, amt))

raw_sum = sum((ln.amount for ln in raw_lines), Money(0, base.currency))
if raw_sum.amount > base.amount:
    scale = base.amount / raw_sum.amount
    scaled = []
    running = Decimal("0")
    for i, ln in enumerate(raw_lines):
        if i == len(raw_lines) - 1:
            amt = _money_round(Money(base.amount - running, base.currency))
        else:
            amt = _money_round(Money(ln.amount.amount * scale, base.currency))
            running += amt.amount
        scaled.append(DiscountLineResult(ln.enrollment_discount_id, ln.label, amt))
    lines = tuple(scaled)
    discount_amt = base
else:
    lines = tuple(raw_lines)
    discount_amt = _money_round(raw_sum)

invoiced = _money_round(base - discount_amt)
if invoiced.amount < 0:
    invoiced = Money(0, base.currency)
return InvoicedAmountResult(base, discount_amt, invoiced, lines)
```

`apply_enrollment_discount`: **delete** the `deactivate_enrollment_discount(...)` call. Before create:

```python
if EnrollmentDiscount.objects.filter(
    user_course=user_course, discount=discount, is_active=True
).exists():
    raise ValueError("already_applied")
```

`deactivate_enrollment_discount` / `remove_enrollment_discount`: deactivate **all** actives (loop).

Add:

```python
def remove_enrollment_discount_by_id(*, user_course, enrollment_discount_id, removed_by) -> None:
    ed = EnrollmentDiscount.objects.filter(
        id=enrollment_discount_id, user_course=user_course, is_active=True
    ).first()
    if not ed:
        raise LookupError("enrollment_discount_not_found")
    ed.is_active = False
    ed.removed_by = removed_by
    ed.removed_at = timezone.now()
    ed.save(update_fields=["is_active", "removed_by", "removed_at", "updated_at"])


@transaction.atomic
def set_enrollment_discounts(*, user_course, discount_ids: list[int], applied_by, org, as_of=None, reason="") -> list[EnrollmentDiscount]:
    if len(discount_ids) != len(set(discount_ids)):
        raise ValueError("duplicate_discount_ids")
    wanted = set(discount_ids)
    active = get_active_enrollment_discounts(user_course)
    for ed in active:
        if ed.discount_id not in wanted:
            remove_enrollment_discount_by_id(
                user_course=user_course,
                enrollment_discount_id=ed.id,
                removed_by=applied_by,
            )
    current_ids = {ed.discount_id for ed in get_active_enrollment_discounts(user_course)}
    result = []
    for did in discount_ids:
        if did in current_ids:
            result.append(next(ed for ed in get_active_enrollment_discounts(user_course) if ed.discount_id == did))
            continue
        discount = Discount.objects.get(id=did, is_active=True)
        result.append(
            apply_enrollment_discount(
                user_course=user_course,
                discount=discount,
                applied_by=applied_by,
                org=org,
                reason=reason,
                as_of=as_of,
            )
        )
    return get_active_enrollment_discounts(user_course)
```

Update `preview_invoiced_amounts` to clone **all** actives’ credit state each period and call `compute_invoiced_amount`, then advance each ED’s simulated remaining/first_period from `result.lines`.

Update existing tests that assumed replace-on-apply (e.g. apply second deactivates first) to match new semantics.

- [ ] **Step 4: Run engine tests — expect pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine
```

- [ ] **Step 5: Commit (BE)**

```bash
git add app_finance/discount_engine.py app_finance/tests/test_discount_engine.py
git commit -m "$(cat <<'EOF'
feat(finance): stack enrollment discounts independently off base

EOF
)"
```

---

### Task 3: Payment create — `discount_ids` + line snapshots

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_discount_apply.py`
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py`
- Modify: `schedjuice-reimagined-be/app_finance/views.py` (OCR multipart path ~1260)
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_payment_create_discount.py`

**Interfaces:**
- Consumes: `set_enrollment_discounts`, `compute_invoiced_amount(...).lines`
- Produces: payment kwargs without writing `enrollment_discount`; creates `UserPaymentDiscount` rows after payment save

- [ ] **Step 1: Write failing payment-create tests**

```python
def test_payment_create_discount_ids_sets_stack_and_snapshots_lines(self):
    # POST ocr-payment-screenshot with discount_ids=[d1,d2]
    # → both EDs active; payment.payment_discounts.count()==2
    # → discount_amount == sum of lines; enrollment_discount is None on new payment

def test_payment_create_omitted_discount_ids_leaves_stack(self):
    # pre-apply d1; POST without discount_ids/clear → d1 still active; lines snapshotted

def test_payment_create_rejects_discount_id_and_discount_ids_together(self):
    # 400

def test_payment_create_clear_discount_clears_all(self):
    # two actives; clear_discount → none active
```

Follow existing multipart/OCR fixtures in `test_payment_create_discount.py`.

- [ ] **Step 2: Run — expect fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount
```

- [ ] **Step 3: Implement apply helpers + serializer**

Rewrite `apply_payment_create_discount` / `apply_discount_and_amount_fields` signatures:

```python
def apply_discount_and_amount_fields(
    *,
    user,
    course,
    request_user,
    org,
    discount_id=None,           # deprecated singular
    discount_ids=None,          # None = omitted; list = set exactly
    clear_discount: bool = False,
    as_of=None,
) -> dict:
    ...
    if discount_ids is not None and discount_id is not None:
        raise ValueError("Provide discount_ids or discount_id, not both")
    if clear_discount:
        discount_ids = []
    elif discount_ids is None and discount_id is not None:
        discount_ids = [discount_id]

    if discount_ids is not None:
        set_enrollment_discounts(
            user_course=user_course,
            discount_ids=discount_ids,
            applied_by=request_user,
            org=org,
            as_of=as_of,
        )

    result = compute_payment_amount_breakdown(...)
    return {
        "invoiced_amount": result.invoiced_amount,
        "base_amount": result.base_amount,
        "discount_amount": result.discount_amount,
        # do NOT set enrollment_discount
        "_discount_lines": result.lines,  # consumed after UserPayment save
    }
```

Add helper:

```python
def persist_payment_discount_lines(*, user_payment, lines) -> None:
    from app_finance.models import UserPaymentDiscount
    UserPaymentDiscount.objects.filter(user_payment=user_payment).delete()
    UserPaymentDiscount.objects.bulk_create([
        UserPaymentDiscount(
            user_payment=user_payment,
            enrollment_discount_id=ln.enrollment_discount_id,
            label=ln.label,
            amount=ln.amount,
        )
        for ln in lines
        if ln.amount.amount > 0 or True  # keep zero lines only if useful; prefer amount > 0
    ])
```

Prefer creating a line when `amount.amount > 0` **or** when there was an active ED that applied 0 this period (YAGNI: only `amount > 0`).

In `UserPaymentSerializer.create`, after saving payment, call `persist_payment_discount_lines` if `_discount_lines` present. Same for OCR view path that uses `apply_discount_and_amount_fields`.

Serializer fields:

```python
discount_ids = ListField(child=IntegerField(), required=False, allow_null=True, write_only=True)
discount_id = IntegerField(required=False, allow_null=True, write_only=True)
clear_discount = BooleanField(required=False, default=False, write_only=True)
discount_lines = SerializerMethodField()

def get_discount_label(self, obj):
    lines = getattr(obj, "_prefetched_payment_discounts", None)
    if lines is None:
        lines = list(obj.payment_discounts.all())
    if not lines:
        # fallback legacy FK for old rows without join
        ed = getattr(obj, "enrollment_discount", None)
        ...
    labels = [ln.label for ln in lines if ln.label]
    return " + ".join(labels) if labels else None

def get_discount_lines(self, obj):
    lines = list(obj.payment_discounts.all())
    return [
        {
            "enrollment_discount_id": ln.enrollment_discount_id,
            "label": ln.label,
            "amount": str(ln.amount.amount) if ln.amount else None,
        }
        for ln in lines
    ]
```

Prefetch `payment_discounts` on admin-report / list querysets alongside (or instead of) `enrollment_discount`.

OCR multipart: parse repeated `discount_ids` from `request.data.getlist("discount_ids")` when present; treat missing key as omitted (`None`), empty list as clear-via-set.

- [ ] **Step 4: Run payment-create tests — expect pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount
```

- [ ] **Step 5: Commit (BE)**

```bash
git add app_finance/payment_discount_apply.py app_finance/serializers.py app_finance/views.py app_finance/tests/test_payment_create_discount.py
git commit -m "$(cat <<'EOF'
feat(finance): snapshot stacked discounts on payment create

EOF
)"
```

---

### Task 4: Enrollment discount APIs + invoice cron

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py`
- Modify: `schedjuice-reimagined-be/app_finance/urls.py`
- Modify: `schedjuice-reimagined-be/app_tasks/management/commands/generate_invoices.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_discount_api.py`

**Interfaces:**
- `GET …/discount` → list (array in `data`)
- `DELETE …/discount/<enrollment_discount_id>` → remove one
- `GET …/eligible-discounts` → `current: EnrollmentDiscount[]`
- Invoice create: persist lines + consume each line amount

- [ ] **Step 1: Write failing API tests**

```python
def test_get_enrollment_discounts_returns_list(self):
    # apply two; GET → list length 2

def test_add_second_discount_keeps_first(self):
    # POST d1; POST d2; both active

def test_add_duplicate_template_400(self):
    # POST d1 twice → 400

def test_delete_one_enrollment_discount(self):
    # DELETE …/discount/<ed_id> → only that one gone

def test_eligible_current_is_list(self):
    # current is list / array

def test_teacher_forbidden_configure(self):
    # existing pattern: 403 on POST without payment.configure
```

- [ ] **Step 2: Run — expect fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_api
```

- [ ] **Step 3: Update views/urls + invoice cron**

`EnrollmentDiscountView.get`: serialize all actives as a list.

Add view or method for DELETE one; URL:

```python
path(
    "user-courses/<int:user_course_id>/discount/<int:enrollment_discount_id>",
    views.EnrollmentDiscountDetailView.as_view(),
    name="user-course-discount-detail",
),
```

`EligibleDiscountsView`: `current = get_active_enrollment_discounts(...)` serialized as list.

`generate_invoices.py`: after computing amounts, store lines on meta; after `bulk_create`, for each payment create `UserPaymentDiscount` rows from `result.lines`, and for each line call `consume_discount_state_after_invoice(enrollment_discount=ed, billing_period_index=..., discount_amount=line.amount)`.

Note: `bulk_create` may not set FKs for reverse creates easily — create lines in a loop after payments exist (same as today consume loop).

- [ ] **Step 4: Run API + related tests — expect pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_api app_finance.tests.test_payment_create_discount app_finance.tests.test_discount_engine
```

- [ ] **Step 5: Commit (BE)**

```bash
git add app_finance/views.py app_finance/urls.py app_tasks/management/commands/generate_invoices.py app_finance/tests/test_discount_api.py
git commit -m "$(cat <<'EOF'
feat(finance): multi-discount enrollment APIs and invoice line snapshots

EOF
)"
```

---

### Task 5: FE remaining-amount + types (stacked preview)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/lib/finances/remaining-amount.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/finances/remaining-amount.test.ts`
- Modify: `schedjuice-reimagined-fe/src/types/finance.ts` (and/or `src/sdk/_types/user-payments.ts`)

**Interfaces:**
- Produces: `resolveSelectedDiscountSnapshots({ discountIds, discounts })`; `previewTermFeeWithDiscounts` stacking independent-off-base + scale; types for `discount_lines`

- [ ] **Step 1: Write failing Vitest cases**

In `remaining-amount.test.ts`:

```ts
it("stacks two percent discounts independently off base for term fee", () => {
  // plan 500, 2 periods whole_enrollment 10% + 5% → per period 425; term 850
});

it("scales when stacked discounts exceed base", () => {
  // plan 100, one period, 60% + 60% → invoiced 0
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd schedjuice-reimagined-fe
npx vitest run src/lib/finances/remaining-amount.test.ts
```

- [ ] **Step 3: Implement multi-discount helpers**

Keep existing single-discount helpers for compat or rewrite callers. Preferred API:

```ts
export function resolveSelectedDiscountSnapshots({
  discountIds,
  discounts,
}: {
  discountIds: number[];
  discounts: Array<{ id: number; discount_type: ...; scope: ...; percent_value?: ...; fixed_amount?: ... }>;
}): RemainingAmountDiscountSnapshot[] {
  return discountIds
    .map((id) => discounts.find((d) => d.id === id))
    .filter(Boolean)
    .map((discount) => ({ ... }));
}

export function previewPeriodDiscountAmount(
  base: number,
  discounts: RemainingAmountDiscountSnapshot[],
  periodIndex: number,
): number {
  const lines = discounts.map((d) => lineAmountForDiscount(base, d, periodIndex));
  const rawSum = moneyRound(lines.reduce((a, b) => a + b, 0));
  if (rawSum <= base) return rawSum;
  // scale lines; return base
  return base;
}
```

Mirror backend scale residual-on-last-line for client preview consistency.

Add to payment types:

```ts
discount_lines?: Array<{
  enrollment_discount_id?: number | null;
  label: string;
  amount: string | number | null;
}> | null;
```

- [ ] **Step 4: Run Vitest — expect pass**

```bash
npx vitest run src/lib/finances/remaining-amount.test.ts
```

- [ ] **Step 5: Commit (FE)**

```bash
git add src/lib/finances/remaining-amount.ts src/lib/finances/remaining-amount.test.ts src/types/finance.ts src/sdk/_types/user-payments.ts
git commit -m "$(cat <<'EOF'
feat(finances): stacked discount preview math and discount_lines types

EOF
)"
```

---

### Task 6: FE `PaymentDiscountPicker` multi-select

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finance/payment-discount-picker.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/student-payments/upload/page.tsx`

**Interfaces:**
- Produces: `PaymentDiscountSelection = { discountIds: number[] }`; `appendDiscountSelectionToFormData` writes `discount_ids` / `clear_discount`

- [ ] **Step 1: Update selection type + picker UI**

```ts
export type PaymentDiscountSelection = {
  discountIds: number[];
};
```

Eligible response: `current: EnrollmentDiscount[]` (handle both array and legacy single during transition by normalizing: `const currents = Array.isArray(current) ? current : current ? [current] : []`).

Replace Select with checkbox list; Clear all sets `discountIds: []`.

`appendDiscountSelectionToFormData`:

```ts
export function appendDiscountSelectionToFormData(
  fd: FormData,
  selection: PaymentDiscountSelection,
) {
  // Always send discount_ids so create path can set-exactly from picker intent.
  // Empty array → clear all (append nothing + clear_discount true).
  if (selection.discountIds.length === 0) {
    fd.append("clear_discount", "true");
    return;
  }
  for (const id of selection.discountIds) {
    fd.append("discount_ids", String(id));
  }
}
```

Note: upload page always shows the picker when a plan exists, so sending the full selected set each submit matches “set exactly” and keeps FE/BE aligned. If picker hidden, omit fields (leave stack unchanged).

- [ ] **Step 2: Wire upload page state**

Replace `discountId` / `currentDiscountId` with `discountIds`. Hydrate from `currents.map(ed => ed.discount).filter(Boolean)`. Remaining preview uses `resolveSelectedDiscountSnapshots`.

- [ ] **Step 3: Manual smoke / unit if picker has tests**

If no component test exists, skip low-value render test. Smoke: load upload with enrollment that has two discounts → both checked.

- [ ] **Step 4: Commit (FE)**

```bash
git add src/components/finance/payment-discount-picker.tsx src/app/(internal)/finances/student-payments/upload/page.tsx
git commit -m "$(cat <<'EOF'
feat(finances): multi-select discount picker on payment upload

EOF
)"
```

---

### Task 7: FE enrollment discount dialog

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finance/enrollment-discount-dialog.tsx`

- [ ] **Step 1: Refactor dialog to stack management**

- Query `GET …/discount` → treat as array.
- Render active list with Remove → `DELETE …/discount/${ed.id}`.
- Add: Select from eligible not already in stack → `POST …/discount`.
- Clear all → `DELETE …/discount`.
- Preview unchanged endpoint (now full stack).

- [ ] **Step 2: Commit (FE)**

```bash
git add src/components/finance/enrollment-discount-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(finances): manage stacked enrollment discounts in roster dialog

EOF
)"
```

---

### Task 8: FE receipt multi-lines

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts`

- [ ] **Step 1: Failing test — multi lines on payload**

```ts
it("emits per-discount lines when discount_lines has more than one entry", () => {
  const payload = buildPaymentReceiptPayload({
    ...row,
    discount_amount: "75",
    discount_label: "Early bird + Loyalty",
    discount_lines: [
      { label: "Early bird", amount: "50" },
      { label: "Loyalty", amount: "25" },
    ],
  }, tenant);
  expect(payload.discountLines?.length).toBe(2);
});
```

Extend `PaymentReceiptPayload` with `discountLines?: string[]` (or structured), and PDF builder to render each when length > 1; else keep single `discountLine`.

- [ ] **Step 2: Implement + pass Vitest**

```bash
npx vitest run src/helpers/payment-receipt.test.ts
```

- [ ] **Step 3: Commit (FE)**

```bash
git add src/helpers/payment-receipt.ts src/helpers/payment-receipt.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): show stacked discount lines on payment receipts

EOF
)"
```

---

### Task 9: Final verification

- [ ] **Step 1: Backend suite for discount surfaces**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine app_finance.tests.test_discount_api app_finance.tests.test_payment_create_discount app_finance.tests.test_discount_eligibility
```

Expected: PASS.

- [ ] **Step 2: Frontend targeted Vitest**

```bash
cd schedjuice-reimagined-fe
npx vitest run src/lib/finances/remaining-amount.test.ts src/helpers/payment-receipt.test.ts
```

Expected: PASS.

- [ ] **Step 3: Spec checklist sign-off**

Confirm against spec success criteria:

1. Two+ discounts active from upload and roster
2. Independent-off-base + scale
3. Receipt/detail multi-lines; lists joined label
4. Duplicate template rejected
5. Old payments unchanged when stack edited

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Multi active EDs + unique `(user_course, discount)` | Task 1 |
| Independent-off-base + scale lines | Task 2 |
| Add without replace; remove one; clear all; set stack | Task 2–4 |
| `UserPaymentDiscount` + stop writing FK | Task 1, 3 |
| `discount_ids` omit / set / clear / mutual exclusion | Task 3 |
| Enrollment APIs list + DELETE one + eligible current list | Task 4 |
| Invoice cron multi consume + lines | Task 4 |
| Upload multi-select + dialog | Task 6–7 |
| Remaining preview stacked | Task 5 |
| Receipt multi-lines | Task 8 |
| High-value tests | Tasks 1–5, 8 |
| Out of scope (retroactive, exclusivity, promo) | Not planned |

No TBD placeholders. Types/signatures aligned across tasks (`discountIds`, `DiscountLineResult`, `payment_discounts` related_name).
