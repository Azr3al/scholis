# Payment Receipt Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allocate sequential receipt numbers when student payments become verified, and provide a dry-run-capable management command to reset the per-tenant counter to `verified_count + 1`, exposed on the internal Management Commands page.

**Architecture:** Add tenant-scoped `PaymentReceiptCounter` (singleton `pk=1`) and nullable `UserPayment.receipt_number`. Centralize allocation in `app_finance/payment_receipt_number.py`; hook all verify paths (model save, bulk CSV verify, receiver-side match). Reset command reconciles counter only — no historical backfill. Frontend prefers `receipt_number` on PDFs, falling back to `id`.

**Tech Stack:** Django 4 + `django-tenant-schemas`, DRF serializers, Django management commands, React + Vitest on the frontend.

**Spec:** `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-26-payment-receipt-numbering-design.md`

## Global Constraints

- Always run backend tests via `./scripts/run_backend_tests.sh <label>` from `schedjuice-reimagined-be`. Never run `manage.py test` without the script; never point tests at Railway/dev `DATABASE_URL`.
- Never inspect, query, or mutate the dev database during this work.
- Tests follow `.cursor/rules/high-value-tests.mdc`: assert behaviour (status **and** state change / invariant), not happy-path-only smoke.
- New migration leaf is `0078_userpayment_discount_ids_set_on_create.py` — create `0079_payment_receipt_numbering.py` (check `ls app_finance/migrations/` first; if a newer leaf exists, use the next number).
- `schedjuice-reimagined-be` and `schedjuice-reimagined-fe` are **separate git repos**. Backend tasks commit in BE; frontend tasks commit in FE. Stage only files each task lists.
- Management command **API name:** `reset-payment-receipt-numbering` (hyphenated, matches FE allowlist). File: `app_finance/management/commands/reset-payment-receipt-numbering.py`.
- Reset counts only `UserPayment.Status.VERIFIED` rows. Does **not** backfill `receipt_number` on existing verified payments.
- Group receipt PDF shows `Math.min(receipt_number)` among parts when any part has a number; otherwise keep `group-{groupId}`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app_finance/models.py` (modify) | `PaymentReceiptCounter`, `UserPayment.receipt_number`, partial unique constraint, save hook |
| `app_finance/migrations/0079_payment_receipt_numbering.py` (create) | Schema migration |
| `app_finance/payment_receipt_number.py` (create) | `allocate_receipt_number`, `assign_receipt_number_if_needed`, `reconcile_payment_receipt_counter` |
| `app_finance/payment_verify.py` (modify) | Assign after bulk verify |
| `app_finance/services.py` (modify) | Assign in `mark_receiver_side_screenshots_matched` |
| `app_finance/management/commands/reset-payment-receipt-numbering.py` (create) | CLI |
| `app_finance/tests/test_payment_receipt_number.py` (create) | Backend behaviour tests |
| `app_tasks/views.py` (modify) | Allowlist command |
| `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts` (modify) | Receipt # display |
| `schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts` (modify) | FE tests |
| `schedjuice-reimagined-fe/src/app/(platform-internal)/internal/management-commands/page.tsx` (modify) | Finance command entry |

---

### Task 1: Schema migration

**Files:**
- Modify: `app_finance/models.py`
- Create: `app_finance/migrations/0079_payment_receipt_numbering.py`

**Interfaces:**
- Produces: `PaymentReceiptCounter` model with `next_sequence: PositiveIntegerField(default=1)`; `UserPayment.receipt_number: PositiveIntegerField(null=True, blank=True)` with partial unique constraint `uniq_userpayment_receipt_number_non_null`.

- [ ] **Step 1: Add models**

In `app_finance/models.py`, add before `UserPaymentGroup` (or after `UserPayment` field block — keep counter model near payments):

```python
class PaymentReceiptCounter(BaseModel):
    """Singleton per tenant: next receipt # to allocate (pk=1 only)."""

    next_sequence = models.PositiveIntegerField(default=1)
```

On `UserPayment`, add field (after `payment_date` or near status fields):

```python
    receipt_number = models.PositiveIntegerField(null=True, blank=True)
```

Add to `UserPayment.Meta.constraints` (create `Meta` inner class if absent, or extend existing):

```python
    class Meta:
        # ... existing options ...
        constraints = [
            # ... keep existing constraints ...
            models.UniqueConstraint(
                fields=["receipt_number"],
                condition=models.Q(receipt_number__isnull=False),
                name="uniq_userpayment_receipt_number_non_null",
            ),
        ]
```

If `UserPayment` already has a `Meta` with `constraints`, append the new constraint to the list.

- [ ] **Step 2: Generate migration**

Run:

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_finance --name payment_receipt_numbering
```

Expected: creates `0079_payment_receipt_numbering.py` with `PaymentReceiptCounter` and `UserPayment.receipt_number`.

- [ ] **Step 3: Apply migration on test DB**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_user_payment_verified_by.UserPaymentVerifiedByTests.test_verify_screenshots_sets_verified_by_when_actor_provided
```

Expected: PASS (sanity — migration applies under test runner).

- [ ] **Step 4: Commit (BE repo)**

```bash
cd schedjuice-reimagined-be
git add app_finance/models.py app_finance/migrations/0079_payment_receipt_numbering.py
git commit -m "feat(finance): add payment receipt counter schema"
```

---

### Task 2: Core allocation module

**Files:**
- Create: `app_finance/payment_receipt_number.py`
- Create: `app_finance/tests/test_payment_receipt_number.py`

**Interfaces:**
- Produces:
  - `allocate_receipt_number() -> int`
  - `assign_receipt_number_if_needed(payment: UserPayment) -> bool`
  - `reconcile_payment_receipt_counter(*, dry_run: bool = False) -> dict[str, int]` returning `verified_count`, `previous_next`, `new_next`

- [ ] **Step 1: Write failing tests**

Create `app_finance/tests/test_payment_receipt_number.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from djmoney.money import Money
from io import StringIO
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program
from app_finance.models import PaymentReceiptCounter, UserPayment
from app_finance.payment_receipt_number import (
    assign_receipt_number_if_needed,
    reconcile_payment_receipt_counter,
)
from app_organization.models import Organization


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="log_only")
class PaymentReceiptNumberTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.filter(
                schema_name=self.schema_name
            ).first()
        with schema_context(self.schema_name):
            PaymentReceiptCounter.objects.filter(pk=1).delete()
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=date(2026, 1, 1),
                end_date=date(2026, 6, 30),
            )
            self.student = User.objects.create_user(
                email=f"stu-rcpt-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2010, 1, 1),
                roles=[User.UserRole.STUDENT],
            )

    def _create_payment(self, *, status=UserPayment.Status.PENDING_VERIFICATION):
        with schema_context(self.schema_name):
            return UserPayment.objects.create(
                user=self.student,
                course=self.course,
                transaction_id=f"rcpt-{uuid4().hex[:8]}",
                parsed_amount=Money(100, "USD"),
                status=status,
            )

    def test_assign_on_verified_payment_allocates_sequential_numbers(self):
        with schema_context(self.schema_name):
            p1 = self._create_payment()
            p1.status = UserPayment.Status.VERIFIED
            self.assertTrue(assign_receipt_number_if_needed(p1))
            p1.save()
            p2 = self._create_payment()
            p2.status = UserPayment.Status.VERIFIED
            self.assertTrue(assign_receipt_number_if_needed(p2))
            p2.save()
            self.assertEqual(p1.receipt_number, 1)
            self.assertEqual(p2.receipt_number, 2)
            counter = PaymentReceiptCounter.objects.get(pk=1)
            self.assertEqual(counter.next_sequence, 3)

    def test_assign_idempotent_when_receipt_number_set(self):
        with schema_context(self.schema_name):
            payment = self._create_payment(status=UserPayment.Status.VERIFIED)
            payment.receipt_number = 99
            payment.save(update_fields=["status", "receipt_number"])
            self.assertFalse(assign_receipt_number_if_needed(payment))
            counter = PaymentReceiptCounter.objects.first()
            self.assertIsNone(counter)

    def test_reconcile_dry_run_does_not_write(self):
        with schema_context(self.schema_name):
            for _ in range(3):
                self._create_payment(status=UserPayment.Status.VERIFIED)
            PaymentReceiptCounter.objects.create(pk=1, next_sequence=500)
            result = reconcile_payment_receipt_counter(dry_run=True)
            self.assertEqual(result["verified_count"], 3)
            self.assertEqual(result["previous_next"], 500)
            self.assertEqual(result["new_next"], 4)
            counter = PaymentReceiptCounter.objects.get(pk=1)
            self.assertEqual(counter.next_sequence, 500)

    def test_reconcile_apply_sets_next_from_verified_count(self):
        with schema_context(self.schema_name):
            for _ in range(3):
                self._create_payment(status=UserPayment.Status.VERIFIED)
            result = reconcile_payment_receipt_counter(dry_run=False)
            self.assertEqual(result["new_next"], 4)
            counter = PaymentReceiptCounter.objects.get(pk=1)
            self.assertEqual(counter.next_sequence, 4)

    def test_reset_command_dry_run_stdout(self):
        with schema_context(self.schema_name):
            self._create_payment(status=UserPayment.Status.VERIFIED)
            PaymentReceiptCounter.objects.create(pk=1, next_sequence=99)
        out = StringIO()
        call_command(
            "reset-payment-receipt-numbering",
            schema_name=self.schema_name,
            dry_run=True,
            stdout=out,
        )
        self.assertIn("2", out.getvalue())  # verified=1 -> new_next=2
        with schema_context(self.schema_name):
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 99
            )
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: FAIL with `ModuleNotFoundError: app_finance.payment_receipt_number`.

- [ ] **Step 3: Implement module**

Create `app_finance/payment_receipt_number.py`:

```python
from __future__ import annotations

from django.db import transaction

from app_finance.models import PaymentReceiptCounter, UserPayment


@transaction.atomic
def allocate_receipt_number() -> int:
    counter, _ = PaymentReceiptCounter.objects.select_for_update().get_or_create(
        pk=1,
        defaults={"next_sequence": 1},
    )
    n = counter.next_sequence
    counter.next_sequence = n + 1
    counter.save(update_fields=["next_sequence", "updated_at"])
    return n


def assign_receipt_number_if_needed(payment: UserPayment) -> bool:
    if payment.status != UserPayment.Status.VERIFIED:
        return False
    if payment.receipt_number is not None:
        return False
    payment.receipt_number = allocate_receipt_number()
    return True


def reconcile_payment_receipt_counter(*, dry_run: bool = False) -> dict[str, int]:
    verified_count = UserPayment.objects.filter(
        status=UserPayment.Status.VERIFIED
    ).count()
    new_next = verified_count + 1
    counter = PaymentReceiptCounter.objects.filter(pk=1).first()
    previous_next = counter.next_sequence if counter else 1
    if not dry_run:
        PaymentReceiptCounter.objects.update_or_create(
            pk=1,
            defaults={"next_sequence": new_next},
        )
    return {
        "verified_count": verified_count,
        "previous_next": previous_next,
        "new_next": new_next,
    }
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: FAIL on `test_reset_command_dry_run_stdout` until Task 4 adds the command — skip that test with `@unittest.expectedFailure` temporarily **or** implement the minimal command stub now. Prefer adding a minimal command in Task 4; for Task 2, comment out `test_reset_command_dry_run_stdout` and uncomment in Task 4.

Adjust Step 1: remove `test_reset_command_dry_run_stdout` from Task 2; add it in Task 4.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_finance/payment_receipt_number.py app_finance/tests/test_payment_receipt_number.py
git commit -m "feat(finance): add payment receipt number allocation helpers"
```

---

### Task 3: Wire verification hooks

**Files:**
- Modify: `app_finance/models.py` (`UserPayment.save`)
- Modify: `app_finance/payment_verify.py`
- Modify: `app_finance/services.py`
- Modify: `app_finance/tests/test_payment_receipt_number.py`

**Interfaces:**
- Consumes: `assign_receipt_number_if_needed` from `app_finance.payment_receipt_number`

- [ ] **Step 1: Write failing bulk-verify test**

Add to `test_payment_receipt_number.py`:

```python
from app_finance.payment_verify import verify_screenshots_from_rows


    def test_bulk_verify_assigns_receipt_numbers(self):
        suffix = uuid4().hex[:8]
        tid = f"bulk-{suffix}"
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                transaction_id=tid,
                parsed_amount=Money(100, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            verify_screenshots_from_rows(
                data_list=[{"transaction_id": tid, "amount": 100}],
            )
            payment.refresh_from_db()
            self.assertEqual(payment.status, UserPayment.Status.VERIFIED)
            self.assertEqual(payment.receipt_number, 1)
```

Add RSS match test:

```python
from app_finance.services import mark_receiver_side_screenshots_matched
from app_finance.models import ReceiverSideScreenshot


    def test_receiver_side_match_assigns_receipt_number(self):
        suffix = uuid4().hex[:8]
        tid = f"rss-{suffix}"
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                transaction_id=tid,
                parsed_amount=Money(50, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            ReceiverSideScreenshot.objects.create(
                transaction_id=tid,
                is_matched=False,
            )
            mark_receiver_side_screenshots_matched(tid, payment)
            payment.refresh_from_db()
            self.assertEqual(payment.receipt_number, 1)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number.PaymentReceiptNumberTests.test_bulk_verify_assigns_receipt_numbers
```

Expected: FAIL — `receipt_number` is `None`.

- [ ] **Step 3: Hook `UserPayment.save`**

In `app_finance/models.py`, at top of `UserPayment.save`, after payment_date default logic and before verified_at logic:

```python
        from app_finance.payment_receipt_number import assign_receipt_number_if_needed

        assigned_receipt = assign_receipt_number_if_needed(self)
        if assigned_receipt and update_fields is not None:
            kwargs["update_fields"] = tuple(
                set(update_fields) | {"receipt_number"}
            )
```

- [ ] **Step 4: Hook `payment_verify.verify_screenshots_from_rows`**

After the existing `bulk_update` block, add:

```python
    receipt_updates = []
    for payment in to_be_updated:
        if payment.status == models.UserPayment.Status.VERIFIED:
            if assign_receipt_number_if_needed(payment):
                receipt_updates.append(payment)
    if receipt_updates:
        models.UserPayment.objects.bulk_update(
            receipt_updates,
            ["receipt_number", "updated_at"],
        )
```

Add import at top of `payment_verify.py`:

```python
from app_finance.payment_receipt_number import assign_receipt_number_if_needed
```

- [ ] **Step 5: Hook `mark_receiver_side_screenshots_matched`**

In `app_finance/services.py`, before `user_payment.save`:

```python
            from app_finance.payment_receipt_number import assign_receipt_number_if_needed

            user_payment.status = UserPayment.Status.VERIFIED
            assign_receipt_number_if_needed(user_payment)
            update_fields = ["status"]
            if user_payment.receipt_number is not None:
                update_fields.append("receipt_number")
```

- [ ] **Step 6: Run all receipt number tests**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: PASS (except command test if deferred).

- [ ] **Step 7: Commit**

```bash
git add app_finance/models.py app_finance/payment_verify.py app_finance/services.py app_finance/tests/test_payment_receipt_number.py
git commit -m "feat(finance): assign receipt numbers on payment verify"
```

---

### Task 4: Reset management command + API allowlist

**Files:**
- Create: `app_finance/management/commands/reset-payment-receipt-numbering.py`
- Modify: `app_tasks/views.py`
- Modify: `app_finance/tests/test_payment_receipt_number.py`

**Interfaces:**
- Consumes: `reconcile_payment_receipt_counter(dry_run: bool) -> dict[str, int]`

- [ ] **Step 1: Add command test** (from Task 2 deferral)

Add `test_reset_command_dry_run_stdout` and `test_reset_command_apply` to test module (see Task 2 Step 1 for dry-run test). Add apply test:

```python
    def test_reset_command_apply_updates_counter(self):
        with schema_context(self.schema_name):
            for _ in range(2):
                self._create_payment(status=UserPayment.Status.VERIFIED)
        call_command(
            "reset-payment-receipt-numbering",
            schema_name=self.schema_name,
        )
        with schema_context(self.schema_name):
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 3
            )
```

- [ ] **Step 2: Run command tests — expect FAIL**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number.PaymentReceiptNumberTests.test_reset_command_apply_updates_counter
```

Expected: FAIL — unknown command.

- [ ] **Step 3: Create management command**

Create `app_finance/management/commands/reset-payment-receipt-numbering.py`:

```python
"""Reset payment receipt counter to verified_count + 1."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_finance.payment_receipt_number import reconcile_payment_receipt_counter
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Reset PaymentReceiptCounter.next_sequence to verified payment count + 1. "
        "Does not backfill receipt_number on existing rows."
    )

    def add_arguments(self, parser):
        parser.add_argument("--schema-name", type=str, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        schema_name_arg = options.get("schema_name")
        dry_run = options["dry_run"]

        with schema_context(get_public_schema_name()):
            org_qs = Organization.objects.exclude(
                schema_name=get_public_schema_name()
            )
            if schema_name_arg:
                org_qs = org_qs.filter(schema_name=schema_name_arg)
            schema_names = [o.schema_name for o in org_qs if o.schema_name]

        if schema_name_arg and not schema_names:
            raise CommandError(f"No organization for schema_name={schema_name_arg!r}.")

        for schema_name in schema_names:
            with schema_context(schema_name):
                result = reconcile_payment_receipt_counter(dry_run=dry_run)
            verb = "would set" if dry_run else "set"
            self.stdout.write(
                self.style.NOTICE(
                    f"Schema {schema_name}: verified={result['verified_count']}, "
                    f"counter {result['previous_next']} -> {result['new_next']} "
                    f"({verb} next_sequence)"
                )
            )
```

- [ ] **Step 4: Allowlist in API**

In `app_tasks/views.py`, add to `MS_TEAMS_COMMANDS`:

```python
    "reset-payment-receipt-numbering",
```

- [ ] **Step 5: Run tests**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app_finance/management/commands/reset-payment-receipt-numbering.py app_tasks/views.py app_finance/tests/test_payment_receipt_number.py
git commit -m "feat(finance): add reset-payment-receipt-numbering command"
```

---

### Task 5: Frontend receipt display

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts`

**Interfaces:**
- Consumes: `receipt_number?: number | null` on `PaymentReceiptRowInput` (from API via `UserPaymentSerializer` fields=`__all__` — no BE serializer change needed)

- [ ] **Step 1: Write failing FE tests**

Add helper at top of test file (or inline):

```typescript
function resolveReceiptNumber(row: {
  id: number | string;
  receipt_number?: number | null;
}): string {
  return row.receipt_number != null
    ? String(row.receipt_number)
    : String(row.id);
}
```

Or test via `buildPaymentReceiptPayload` directly. Add describe block:

```typescript
describe("receipt number display", () => {
  const tenant = { name: "Acme", logo: null, timezone: "UTC" };

  it("uses receipt_number when present", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 999,
        receipt_number: 42,
        user: { name: "Jane" },
        course: { title: "Math" },
        transaction_id: "TX-1",
        actual_amount: "100",
        payment_method: { name: "Cash" },
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("42");
  });

  it("falls back to id when receipt_number is null", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 999,
        receipt_number: null,
        user: { name: "Jane" },
        course: { title: "Math" },
        transaction_id: "TX-1",
        actual_amount: "100",
        payment_method: { name: "Cash" },
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("999");
  });

  it("group receipt uses lowest part receipt_number", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-12",
        group_id: 12,
        user: { name: "Jane" },
        course: { title: "Math" },
        payment_method: { name: "Multiple" },
        parts: [
          { id: 1, receipt_number: 5, transaction_id: "A", actual_amount: "10" },
          { id: 2, receipt_number: 3, transaction_id: "B", actual_amount: "20" },
        ],
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("3");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run:

```bash
cd schedjuice-reimagined-fe
pnpm test:unit -- src/helpers/payment-receipt.test.ts -t "receipt number display"
```

Expected: FAIL — `receiptNumber` still `"999"` / `"group-12"`.

- [ ] **Step 3: Implement**

Add to `PaymentReceiptRowInput`:

```typescript
  receipt_number?: number | null;
```

Add helper in `payment-receipt.ts`:

```typescript
export function resolvePaymentReceiptNumber(row: {
  id: number | string;
  receipt_number?: number | null;
}): string {
  return row.receipt_number != null
    ? String(row.receipt_number)
    : String(row.id);
}

function resolveGroupReceiptNumber(
  groupRow: PaymentReceiptRowInput,
  groupId: number | string,
): string {
  const parts = groupRow.parts ?? [];
  const numbers = parts
    .map((p) => p.receipt_number)
    .filter((n): n is number => n != null);
  if (numbers.length === 0) {
    return `group-${groupId}`;
  }
  return String(Math.min(...numbers));
}
```

In `buildPaymentReceiptPayload`:

```typescript
    receiptNumber: resolvePaymentReceiptNumber(row),
```

In `buildGroupPaymentReceiptPayload`, replace `receiptNumber: \`group-${groupId}\`` with:

```typescript
    receiptNumber: resolveGroupReceiptNumber(groupRow, groupId),
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test:unit -- src/helpers/payment-receipt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/payment-receipt.ts src/helpers/payment-receipt.test.ts
git commit -m "feat(finances): prefer receipt_number on payment receipts"
```

---

### Task 6: Management Commands UI entry

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(platform-internal)/internal/management-commands/page.tsx`

- [ ] **Step 1: Add command definition**

In the `COMMANDS` array, add (sorted into Finance category — place near other finance-adjacent entries or create Finance section):

```typescript
  {
    name: "reset-payment-receipt-numbering",
    category: "Finance",
    description:
      "Reset the payment receipt counter so the next verified payment gets receipt # (verified count + 1). Does not renumber existing receipts.",
    params: [
      {
        key: "schema_name",
        type: "string",
        required: true,
        description: "Tenant schema name",
      },
      {
        key: "dry_run",
        type: "boolean",
        default: "true",
        description: "Preview only; no database writes",
      },
    ],
  },
```

- [ ] **Step 2: Manual smoke (optional)**

With local BE+FE running, open `/internal/management-commands`, select the command, set `schema_name`, run with `dry_run=true`. Expected: 200 response with stdout mentioning verified count and counter values.

- [ ] **Step 3: Commit (FE repo)**

```bash
git add src/app/(platform-internal)/internal/management-commands/page.tsx
git commit -m "feat(internal): expose reset-payment-receipt-numbering command"
```

---

## Verification checklist (end-to-end)

- [ ] `./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number` — all pass
- [ ] `pnpm test:unit -- src/helpers/payment-receipt.test.ts` — all pass
- [ ] New verified payment via PATCH gets `receipt_number` in API response
- [ ] Reset command dry-run leaves counter unchanged; apply sets `verified_count + 1`
- [ ] Legacy payment without `receipt_number` still PDFs with `id`

---

## Spec self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| `PaymentReceiptCounter` singleton | Task 1 |
| `UserPayment.receipt_number` + partial unique | Task 1 |
| Assign on verify (all paths) | Task 3 |
| Reset command `--schema-name` / `--dry-run` | Task 4 |
| API allowlist | Task 4 |
| FE management commands entry | Task 6 |
| FE receipt fallback | Task 5 |
| Group PDF lowest part number | Task 5 |
| High-value tests | Tasks 2–5 |
| No backfill | Documented in command help + spec; no backfill task |

No placeholders remain.
