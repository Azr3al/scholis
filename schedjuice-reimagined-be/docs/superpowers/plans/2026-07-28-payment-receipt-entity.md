# Payment Receipt Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one issued receipt own exactly one receipt number, so a multi-course or split-screenshot payment group stops consuming a number per part.

**Architecture:** A new `PaymentReceipt` row represents one issued receipt and owns the number, date, and authorizer. `UserPayment` gains a nullable `receipt` FK and loses `receipt_number`. A receipt covers a *unit*: the whole `UserPaymentGroup` when the payment is grouped, otherwise the standalone payment. Allocation happens on the first verification in a unit; later parts join the same receipt. Historical surplus numbers become void receipt rows so the sequence has no unexplained gaps.

**Tech Stack:** Django 4.2 + django-tenant-schemas (per-tenant schemas, migrations run via `migrate_schemas`), djmoney, DRF with drf-flex-fields, PostgreSQL 15, Next.js + React with `@react-pdf/renderer` for PDFs, Vitest for frontend unit tests.

## Global Constraints

- Backend tests **always** run through `./scripts/run_backend_tests.sh <target>` from `schedjuice-reimagined-be`. It passes `--keepdb --noinput` and points at the Docker test DB `schedjuice-test-db` on port `55432`. Never run `manage.py test` directly and never point tests at the dev/Railway database.
- Tests must be high-value: auth denials, invariants, boundaries, error shapes. No happy-path smoke tests, no tautologies, no heavy fixtures for trivial assertions. At most one thin success path per behaviour unit.
- Migrations are tenant-scoped. Data migrations run per schema, so they must be safe to run against a schema with zero payments.
- Do not add code comments that restate what the code does.
- `receipt_number` stays the API field name throughout. The frontend contract must not change.

---

## Why this work exists

`Organization.report_style` needs a new `EXCELLENT_CHOICE_STYLE` whose Voucher No column is the receipt number. That column only makes sense if a receipt has exactly one number, which is not true today. Each `UserPayment` gets its own, and sharing is blocked outright:

```346:353:schedjuice-reimagined-be/app_finance/models.py
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["receipt_number"],
                condition=models.Q(receipt_number__isnull=False),
                name="uniq_userpayment_receipt_number_non_null",
            ),
        ]
```

A group only *looks* like one receipt because the frontend prints the lowest part number. So a 2-course group consumes 41 and 42 but prints 41, and 42 appears on nothing.

The prior spec ([2026-07-26-payment-receipt-numbering-design.md](schedjuice-reimagined-be/docs/superpowers/specs/2026-07-26-payment-receipt-numbering-design.md)) chose min-of-parts deliberately and listed shared numbering as out of scope. This work supersedes that decision. That doc is also already stale in a second way: it says reset should be "counter only, do not rewrite existing values", but `reconcile_payment_receipt_counter` currently nulls and renumbers every verified payment. Task 4 restores the documented behaviour.

## Confirmed decisions

- Receipt unit: `UserPaymentGroup` when grouped, else the standalone `UserPayment`.
- Created and numbered on the **first** part verification; later parts join it.
- `PaymentReceipt` owns number, void flag, receipt date, authorized-by.
- `UserPayment.receipt_number` is dropped in favour of a `receipt` FK.
- History preserved: each unit adopts `min(receipt_number)`; surplus numbers become void rows.
- Voiding is migration bookkeeping only. No endpoint, permission, or UI.
- `authorized_by` is the staff member whose verification completed the receipt.

## Download gating is already satisfied

The requirement "no download until every part is verified" needs **no new code**. `rollup_payment_group_status` reports `verified` only when all parts are:

```26:32:schedjuice-reimagined-be/app_finance/payment_group.py
    if not statuses:
        return UserPayment.Status.PENDING_PAYMENT
    if all(s == UserPayment.Status.VERIFIED for s in statuses):
        return UserPayment.Status.VERIFIED
```

Every download entry point keys off that status: `student-payments-grid.tsx` (`row.status === UserPaymentStatus.verified`), `student-payments-resource-table.tsx:1152`, `recent-transactions/page.tsx` (which also excludes groups via `row.group_id == null`), and `payment-history-action-cell.tsx`, which refetches the group and shows "This group payment is not fully verified yet." before generating a PDF.

The only new situation is that a partially-verified group now *has* a receipt number while its rolled-up status is not `verified`. Task 3 adds a regression test locking that, instead of building a redundant `receipt_is_complete` field.

## Data flow

```mermaid
flowchart TD
    Verify["Verification path\n(save / bulk verify / RSS match)"] --> Ensure["ensure_receipt_for_payment"]
    Ensure --> Existing{"Unit already\nhas a receipt?"}
    Existing -->|yes| Join["Reuse it, update authorized_by"]
    Existing -->|no| Alloc["allocate_receipt_number from\nPaymentReceiptCounter"]
    Alloc --> Create["Create PaymentReceipt"]
    Join --> Link["Set payment.receipt"]
    Create --> Link
    Link --> Projections["admin_report rows + serializer\nemit receipt_number"]
```

```mermaid
erDiagram
    PaymentReceipt ||--o{ UserPayment : "receipt_id"
    UserPaymentGroup ||--o{ UserPayment : "group_id / parts"
    PaymentReceipt }o--|| User : "authorized_by"
```

## File Structure

**Created:**

- `schedjuice-reimagined-be/app_finance/payment_receipt_backfill.py` — pure planner turning payment rows into the receipts, voids, and counter value the data migration should write. No Django imports, so it is unit-testable and safe to call from a migration.
- `schedjuice-reimagined-be/app_finance/migrations/0081_paymentreceipt.py` — schema only.
- `schedjuice-reimagined-be/app_finance/migrations/0082_backfill_payment_receipts.py` — `RunPython` only.
- `schedjuice-reimagined-be/app_finance/migrations/0083_drop_userpayment_receipt_number.py` — column + constraint removal only.
- `schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_backfill.py` — tests for the planner.
- `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-28-payment-receipt-entity-design.md` — the spec.

**Modified:**

- `app_finance/models.py` — add `PaymentReceipt`, add `UserPayment.receipt`, drop `receipt_number` + its constraint, rewire `save()`.
- `app_finance/payment_receipt_number.py` — replace per-payment numbering with per-unit receipt resolution; make reconcile counter-only.
- `app_finance/payment_verify.py` — batch allocation after `bulk_update`.
- `app_finance/payment_group.py` — read `receipt_number` from the receipt; add a top-level one to group rows.
- `app_finance/serializers.py` — `receipt_number` becomes a read-only method field.
- `app_finance/views.py` — three `select_related` lists gain `"receipt"`.
- `app_finance/management/commands/reset-payment-receipt-numbering.py` — new result keys and help text.
- `app_finance/tests/test_payment_receipt_number.py` — rewritten around receipts.
- `app_finance/tests/test_payment_group.py` — the receipt-number report test.
- `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts` + `.test.ts` — group number comes from the row, not `Math.min`.

Migrations are split three ways deliberately: after 0082 both `receipt` and `receipt_number` exist, so the backfill can be inspected before 0083 destroys the source data.

Three call sites are **not** modified. `mark_receiver_side_screenshots_matched` in `app_finance/services.py` never touches numbering directly — it sets `status` and `verified_by` then calls `user_payment.save(update_fields=[...])`, so Task 3's `save()` change covers it. `create_user_payment_group_with_parts` and `create_multi_course_payment_group` create parts as unverified, so they never allocate.

---

### Task 0: Design spec

**Files:**
- Create: `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-28-payment-receipt-entity-design.md`
- Modify: `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-26-payment-receipt-numbering-design.md`

- [ ] **Step 1: Write the spec**

Capture, in this order: the problem (per-part numbering plus min-of-parts printing burns numbers), the confirmed decisions list from this plan, the `PaymentReceipt` model definition from Task 1, the unit rule, the allocation rule, the backfill policy including void rows, the finding that download gating already works via `rollup_payment_group_status`, and an out-of-scope list. Copy the decision table style used by the 2026-07-26 spec.

- [ ] **Step 2: Mark the prior spec superseded**

Change its status line and add a pointer under it:

```markdown
**Status:** Superseded by `2026-07-28-payment-receipt-entity-design.md`
```

Under `## Confirmed decisions`, note that the "Group receipt PDF — show the lowest `receipt_number`" row and the "Per-course receipt sequences" out-of-scope item are both reversed by the newer spec, and that the reset behaviour described there was never implemented as written.

- [ ] **Step 3: Commit**

```bash
git add schedjuice-reimagined-be/docs/superpowers/specs/
git commit -m "docs: spec payment receipt as a first-class entity"
```

---

### Task 1: PaymentReceipt model and receipt FK

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/models.py:138-141` (insert after `PaymentReceiptCounter`), `:215` (add the FK next to `receipt_number`)
- Create: `schedjuice-reimagined-be/app_finance/migrations/0081_paymentreceipt.py`
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py`

**Interfaces:**
- Consumes: `BaseModel` from `utilitas.models`, `User` from `app_auth.models` — both already imported at the top of `models.py`.
- Produces: `PaymentReceipt(number: int, receipt_date: datetime, authorized_by: User | None, is_void: bool, void_reason: str)` with reverse accessor `receipt.payments`; `UserPayment.receipt` / `UserPayment.receipt_id`.

`receipt_number` is intentionally left in place this task. It is removed in Task 7, after the backfill has read it.

- [ ] **Step 1: Write the failing test**

In `app_finance/tests/test_payment_receipt_number.py`, change the `django.db` import line to `from django.db import IntegrityError, connection, transaction`, add `from django.utils import timezone`, and extend the `app_finance.models` import to include `PaymentReceipt`. Then add:

```python
    def test_receipt_numbers_are_unique_across_void_and_live_rows(self):
        with schema_context(self.schema_name):
            PaymentReceipt.objects.create(
                number=41,
                receipt_date=timezone.now(),
            )
            PaymentReceipt.objects.create(
                number=42,
                receipt_date=timezone.now(),
                is_void=True,
                void_reason="superseded by receipt 41",
            )
            with self.assertRaises(IntegrityError), transaction.atomic():
                PaymentReceipt.objects.create(
                    number=42,
                    receipt_date=timezone.now(),
                )
```

The inner `transaction.atomic()` is required, not optional: Postgres marks the whole transaction as aborted on a constraint violation, so without a savepoint the rest of the `TestCase` transaction becomes unusable.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: `ImportError: cannot import name 'PaymentReceipt' from 'app_finance.models'`.

- [ ] **Step 3: Add the model**

Insert into `app_finance/models.py` directly after `PaymentReceiptCounter`:

```python
class PaymentReceipt(BaseModel):
    """One issued receipt. Covers every part of a UserPaymentGroup, or a single
    standalone UserPayment. Void rows carry a number that was consumed before
    group receipts shared one; they have no payments."""

    number = models.PositiveIntegerField(unique=True)
    receipt_date = models.DateTimeField(
        help_text="Date printed on the receipt: earliest payment_date in the unit."
    )
    authorized_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="authorized_payment_receipts",
        null=True,
        blank=True,
        help_text="Staff user whose verification completed this receipt.",
    )
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["number"]
```

- [ ] **Step 4: Add the FK on UserPayment**

In `app_finance/models.py`, immediately after the existing `receipt_number` field at line 215:

```python
    receipt = models.ForeignKey(
        "PaymentReceipt",
        on_delete=models.PROTECT,
        related_name="payments",
        null=True,
        blank=True,
        help_text="Issued receipt. Set on verification; all parts of a group share one.",
    )
```

`PROTECT` is deliberate: a receipt must never disappear from under a verified payment.

- [ ] **Step 5: Generate the migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_finance --name paymentreceipt
```

Expected: creates `0081_paymentreceipt.py` depending on `0080_userpaymentgroup_group_kind`, containing `CreateModel` for `PaymentReceipt` and `AddField` for `userpayment.receipt`. Open it and confirm it contains no other operations.

- [ ] **Step 6: Run the test to verify it passes**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: PASS. The pre-existing tests in this file still pass because `receipt_number` and its old helper are untouched.

- [ ] **Step 7: Commit**

```bash
git add schedjuice-reimagined-be/app_finance/models.py \
        schedjuice-reimagined-be/app_finance/migrations/0081_paymentreceipt.py \
        schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py
git commit -m "feat: add PaymentReceipt model and UserPayment.receipt FK"
```

---

### Task 2: Per-unit receipt resolution

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_receipt_number.py`
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py`

**Interfaces:**
- Consumes: `PaymentReceipt`, `UserPayment`, `PaymentReceiptCounter` from `app_finance.models`; `allocate_receipt_number() -> int` (already exists, unchanged).
- Produces:
  - `receipt_unit_key(payment: UserPayment) -> tuple[str, int]`
  - `ensure_receipt_for_payment(payment: UserPayment) -> PaymentReceipt | None` — sets `payment.receipt` in memory and returns it; returns `None` when the payment is not verified. **Does not save the payment.**
  - `ensure_receipts_for_payments(payments: list[UserPayment]) -> list[UserPayment]` — batch form for `bulk_update` callers; returns the payments whose `receipt` was set.

`assign_receipt_number_if_needed` is left in place this task so `models.py` and `payment_verify.py` keep working. Task 3 deletes it.

- [ ] **Step 1: Add a staff user and group helpers to the test fixture**

In `app_finance/tests/test_payment_receipt_number.py`, extend the `app_finance.models` import to include `PaymentReceipt` and `UserPaymentGroup`, and add to the end of `setUp` inside the `schema_context(self.schema_name)` block:

```python
            self.staff = User.objects.create_user(
                email=f"staff-rcpt-{suffix}@example.com",
                password="x",
                name="Staff",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.other_staff = User.objects.create_user(
                email=f"staff2-rcpt-{suffix}@example.com",
                password="x",
                name="Other Staff",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
```

Then add these helpers to the test class:

```python
    def _create_group(self, *, kind, count=2):
        group = UserPaymentGroup.objects.create(
            user=self.student,
            course=(
                None
                if kind == UserPaymentGroup.GroupKind.MULTI_COURSE
                else self.course
            ),
            group_kind=kind,
        )
        parts = [
            UserPayment.objects.create(
                group=group,
                user=self.student,
                course=self.course,
                transaction_id=f"grp-{uuid4().hex[:8]}",
                parsed_amount=Money(100, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            for _ in range(count)
        ]
        return group, parts

    def _verify_via_helper(self, part, verifier):
        """Verify without going through save(), so this task's tests exercise
        only the new helper and never the old numbering path."""
        part.status = UserPayment.Status.VERIFIED
        part.verified_by = verifier
        receipt = ensure_receipt_for_payment(part)
        UserPayment.objects.filter(pk=part.pk).update(
            status=part.status,
            verified_by=verifier,
            receipt=receipt,
        )
        return receipt
```

- [ ] **Step 2: Write the failing tests**

Extend the import from `app_finance.payment_receipt_number` to add `ensure_receipt_for_payment` and `ensure_receipts_for_payments`, then add:

```python
    def test_group_parts_share_one_receipt_and_consume_one_number(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            receipts = [self._verify_via_helper(p, self.staff) for p in parts]
            self.assertEqual(len({r.id for r in receipts}), 1)
            self.assertEqual(receipts[0].number, 1)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 2
            )

    def test_later_part_joins_the_existing_receipt(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS
            )
            first = self._verify_via_helper(parts[0], self.staff)
            second = self._verify_via_helper(parts[1], self.staff)
            self.assertEqual(first.id, second.id)
            self.assertEqual(PaymentReceipt.objects.count(), 1)

    def test_authorized_by_is_the_verifier_who_completed_the_receipt(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS
            )
            self._verify_via_helper(parts[0], self.staff)
            receipt = self._verify_via_helper(parts[1], self.other_staff)
            receipt.refresh_from_db()
            self.assertEqual(receipt.authorized_by_id, self.other_staff.id)

    def test_unverified_payment_gets_no_receipt(self):
        with schema_context(self.schema_name):
            payment = self._create_payment()
            self.assertIsNone(ensure_receipt_for_payment(payment))
            self.assertEqual(PaymentReceipt.objects.count(), 0)

    def test_batch_allocation_does_not_double_number_an_unsaved_group(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE, count=3
            )
            for part in parts:
                part.status = UserPayment.Status.VERIFIED
                part.verified_by = self.staff
            changed = ensure_receipts_for_payments(parts)
            self.assertEqual(len(changed), 3)
            self.assertEqual(len({p.receipt_id for p in changed}), 1)
            self.assertEqual(PaymentReceipt.objects.count(), 1)

    def test_receipt_date_is_the_earliest_payment_date_in_the_group(self):
        with schema_context(self.schema_name):
            _, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            early = timezone.now() - timedelta(days=5)
            late = timezone.now()
            UserPayment.objects.filter(pk=parts[0].pk).update(payment_date=late)
            UserPayment.objects.filter(pk=parts[1].pk).update(payment_date=early)
            parts[0].refresh_from_db()
            receipt = self._verify_via_helper(parts[0], self.staff)
            self.assertEqual(receipt.receipt_date, early)
```

Add `from datetime import date, timedelta` (the file already imports `date`) and `from django.utils import timezone` if Task 1 did not already add it.

The last test is the load-bearing one: it proves the date comes from the whole unit, not from the part that happened to verify first.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: `ImportError: cannot import name 'ensure_receipt_for_payment'`.

- [ ] **Step 4: Add the helpers**

Append to `app_finance/payment_receipt_number.py`, and extend its import line to `from app_finance.models import PaymentReceipt, PaymentReceiptCounter, UserPayment`:

```python
def receipt_unit_key(payment: UserPayment) -> tuple[str, int]:
    """One receipt covers a whole group, or one standalone payment."""
    if payment.group_id is not None:
        return ("group", payment.group_id)
    return ("payment", payment.pk)


def _existing_receipt_for_unit(payment: UserPayment) -> PaymentReceipt | None:
    if payment.receipt_id is not None:
        return payment.receipt
    if payment.group_id is None:
        return None
    sibling = (
        UserPayment.objects.filter(
            group_id=payment.group_id,
            receipt__isnull=False,
        )
        .exclude(pk=payment.pk)
        .select_related("receipt")
        .first()
    )
    return sibling.receipt if sibling is not None else None


def _unit_receipt_date(payment: UserPayment):
    if payment.group_id is None:
        rows = [(payment.payment_date, payment.created_at)]
    else:
        rows = list(
            UserPayment.objects.filter(group_id=payment.group_id).values_list(
                "payment_date", "created_at"
            )
        ) or [(payment.payment_date, payment.created_at)]
    dates = [pd or ca for pd, ca in rows if (pd or ca) is not None]
    return min(dates) if dates else timezone.now()


def _apply_authorizer(receipt: PaymentReceipt, payment: UserPayment) -> None:
    if payment.verified_by_id is None:
        return
    if receipt.authorized_by_id == payment.verified_by_id:
        return
    receipt.authorized_by_id = payment.verified_by_id
    receipt.save(update_fields=["authorized_by", "updated_at"])


def ensure_receipt_for_payment(payment: UserPayment) -> PaymentReceipt | None:
    """Attach the unit's receipt to `payment`, allocating one if the unit has
    none. Sets `payment.receipt` in memory; the caller persists it."""
    if payment.status != UserPayment.Status.VERIFIED:
        return None
    receipt = _existing_receipt_for_unit(payment)
    if receipt is None:
        receipt = PaymentReceipt.objects.create(
            number=allocate_receipt_number(),
            receipt_date=_unit_receipt_date(payment),
            authorized_by_id=payment.verified_by_id,
        )
    else:
        _apply_authorizer(receipt, payment)
    payment.receipt = receipt
    return receipt


def ensure_receipts_for_payments(payments: list[UserPayment]) -> list[UserPayment]:
    """Batch form for bulk_update callers. Siblings are cached in memory because
    nothing in `payments` has been written yet, so a DB lookup would miss them
    and allocate a second number."""
    cache: dict[tuple[str, int], PaymentReceipt] = {}
    changed: list[UserPayment] = []
    for payment in payments:
        if payment.status != UserPayment.Status.VERIFIED:
            continue
        key = receipt_unit_key(payment)
        receipt = cache.get(key)
        if receipt is None:
            receipt = ensure_receipt_for_payment(payment)
            if receipt is None:
                continue
            cache[key] = receipt
        else:
            payment.receipt = receipt
            _apply_authorizer(receipt, payment)
        changed.append(payment)
    return changed
```

Add `from django.utils import timezone` to the module imports.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: PASS, including the pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add schedjuice-reimagined-be/app_finance/payment_receipt_number.py \
        schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py
git commit -m "feat: resolve one payment receipt per group or standalone payment"
```

---

### Task 3: Wire the verification paths

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/models.py:355-377` (`UserPayment.save`)
- Modify: `schedjuice-reimagined-be/app_finance/payment_verify.py:10` and `:107-121`
- Modify: `schedjuice-reimagined-be/app_finance/payment_receipt_number.py` (delete the dead per-payment helper)
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py`

**Interfaces:**
- Consumes: `ensure_receipt_for_payment`, `ensure_receipts_for_payments` from Task 2.
- Produces: no new API. After this task `UserPayment.receipt_number` is written by nothing.

- [ ] **Step 1: Write the failing tests**

Replace `test_bulk_verify_assigns_receipt_numbers` and `test_receiver_side_match_assigns_receipt_number` in `app_finance/tests/test_payment_receipt_number.py` with:

```python
    def test_bulk_verify_gives_a_multi_course_group_one_receipt(self):
        with schema_context(self.schema_name):
            group, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.MULTI_COURSE
            )
            tid = f"bulk-{uuid4().hex[:8]}"
            UserPayment.objects.filter(
                pk__in=[p.pk for p in parts]
            ).update(transaction_id=tid)
            verify_screenshots_from_rows(
                data_list=[{"transaction_id": tid, "amount": 200}],
                actor=self.staff,
            )
            refreshed = list(
                UserPayment.objects.filter(group_id=group.id).select_related("receipt")
            )
            self.assertEqual(
                {p.status for p in refreshed},
                {UserPayment.Status.VERIFIED},
            )
            self.assertEqual(len({p.receipt_id for p in refreshed}), 1)
            self.assertEqual(PaymentReceipt.objects.count(), 1)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 2
            )

    def test_receiver_side_match_creates_the_receipt_via_save(self):
        tid = f"rss-{uuid4().hex[:8]}"
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
            mark_receiver_side_screenshots_matched(tid, payment, actor=self.staff)
            payment.refresh_from_db()
            self.assertIsNotNone(payment.receipt_id)
            self.assertEqual(payment.receipt.number, 1)
            self.assertEqual(payment.receipt.authorized_by_id, self.staff.id)

    def test_partly_verified_group_is_numbered_but_not_downloadable(self):
        with schema_context(self.schema_name):
            group, parts = self._create_group(
                kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS
            )
            parts[0].status = UserPayment.Status.VERIFIED
            parts[0].verified_by = self.staff
            parts[0].save(update_fields=["status", "verified_by"])
            parts[0].refresh_from_db()
            self.assertIsNotNone(parts[0].receipt_id)
            statuses = list(
                UserPayment.objects.filter(group_id=group.id).values_list(
                    "status", flat=True
                )
            )
            self.assertNotEqual(
                rollup_payment_group_status(statuses),
                UserPayment.Status.VERIFIED,
            )
```

Add `from app_finance.payment_group import rollup_payment_group_status` to the test imports.

That third test is the requirement "numbered at first verification, not downloadable until complete", asserted against the status rollup every download entry point already reads.

Also update `test_assign_on_verified_payment_allocates_sequential_numbers` and `test_assign_idempotent_when_receipt_number_set`, which call the helper being deleted:

```python
    def test_standalone_payments_get_sequential_receipt_numbers(self):
        with schema_context(self.schema_name):
            p1 = self._create_payment()
            p1.status = UserPayment.Status.VERIFIED
            p1.save(update_fields=["status"])
            p2 = self._create_payment()
            p2.status = UserPayment.Status.VERIFIED
            p2.save(update_fields=["status"])
            p1.refresh_from_db()
            p2.refresh_from_db()
            self.assertEqual(p1.receipt.number, 1)
            self.assertEqual(p2.receipt.number, 2)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 3
            )

    def test_resaving_a_verified_payment_does_not_allocate_again(self):
        with schema_context(self.schema_name):
            payment = self._create_payment()
            payment.status = UserPayment.Status.VERIFIED
            payment.save(update_fields=["status"])
            payment.refresh_from_db()
            payment.save(update_fields=["remarks"])
            self.assertEqual(PaymentReceipt.objects.count(), 1)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 2
            )
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: failures asserting `payment.receipt_id is None` / `PaymentReceipt.objects.count() == 0`, because `save()` still writes `receipt_number` instead. The multi-course test fails with `PaymentReceipt.objects.count() == 0` and a counter of 3, showing today's two-numbers-per-group bug.

- [ ] **Step 3: Rewire `UserPayment.save()`**

In `app_finance/models.py`, change the import inside `save()` and the final block. Replace lines 358 and 373-376:

```python
        from app_finance.payment_receipt_number import ensure_receipt_for_payment
```

```python
        if ensure_receipt_for_payment(self) is not None and update_fields is not None:
            kwargs["update_fields"] = tuple(
                set(kwargs["update_fields"]) | {"receipt"}
            )
```

- [ ] **Step 4: Rewire bulk verify**

In `app_finance/payment_verify.py`, change the import on line 10:

```python
from app_finance.payment_receipt_number import ensure_receipts_for_payments
```

and replace the block at lines 112-121 with:

```python
        receipt_updates = ensure_receipts_for_payments(to_be_updated)
        if receipt_updates:
            models.UserPayment.objects.bulk_update(
                receipt_updates,
                ["receipt", "updated_at"],
            )
```

- [ ] **Step 5: Delete the dead numbering helper**

From `app_finance/payment_receipt_number.py`, delete `assign_receipt_number_if_needed`. Also drop it from the `app_finance.payment_receipt_number` import block in `app_finance/tests/test_payment_receipt_number.py`, which still names it after Task 2. Then confirm nothing references it:

```bash
cd schedjuice-reimagined-be
rg -n "assign_receipt_number_if_needed" app_finance
```

Expected: no matches. The name survives only in `docs/superpowers/specs/2026-07-26-payment-receipt-numbering-design.md`, which Task 0 already marked superseded.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number app_finance.tests.test_payment_group app_finance.tests.test_multi_course_payment
```

Expected: PASS. `test_payment_group.py::test_admin_report_includes_receipt_number` still passes here because it sets `receipt_number` directly with `.update()` and the projection has not changed yet; Task 5 rewrites it.

- [ ] **Step 7: Commit**

```bash
git add schedjuice-reimagined-be/app_finance/models.py \
        schedjuice-reimagined-be/app_finance/payment_verify.py \
        schedjuice-reimagined-be/app_finance/payment_receipt_number.py \
        schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py
git commit -m "fix: allocate one receipt number per payment group, not per part"
```

---

### Task 4: Counter-only reconcile

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_receipt_number.py:8-14` and `:38-81`
- Modify: `schedjuice-reimagined-be/app_finance/management/commands/reset-payment-receipt-numbering.py:13-16` and `:40-50`
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py`

**Interfaces:**
- Produces: `reconcile_payment_receipt_counter(*, dry_run: bool = False) -> dict[str, int]` with keys `receipt_count`, `previous_next`, `new_next`. The old `verified_count` and `renumbered_count` keys are gone.

Renumbering must go: it would destroy the void rows that explain historical gaps, and rewrite numbers on receipts people already hold. Counter-only is what the 2026-07-26 spec specified before the code drifted.

- [ ] **Step 1: Write the failing tests**

Delete the `_create_verified_without_receipt_number` helper — it writes `receipt_number` via `.update()` to deliberately bypass numbering, which no longer means anything. Then replace `test_reconcile_dry_run_does_not_write`, `test_reconcile_apply_sets_next_from_verified_count`, `test_reconcile_backfills_instead_of_leaving_payment_id_on_pdf`, `test_reset_command_dry_run_stdout`, and `test_reset_command_apply_updates_counter` with:

```python
    def _verified_payment_with_receipt(self):
        payment = self._create_payment()
        payment.status = UserPayment.Status.VERIFIED
        payment.save(update_fields=["status"])
        payment.refresh_from_db()
        return payment

    def test_reconcile_dry_run_does_not_write(self):
        with schema_context(self.schema_name):
            self._verified_payment_with_receipt()
            PaymentReceiptCounter.objects.update_or_create(
                pk=1,
                defaults={"next_sequence": 500},
            )
            result = reconcile_payment_receipt_counter(dry_run=True)
            self.assertEqual(result["receipt_count"], 1)
            self.assertEqual(result["previous_next"], 500)
            self.assertEqual(result["new_next"], 2)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 500
            )

    def test_reconcile_realigns_counter_to_highest_issued_number(self):
        with schema_context(self.schema_name):
            PaymentReceipt.objects.create(number=41, receipt_date=timezone.now())
            PaymentReceipt.objects.create(
                number=42,
                receipt_date=timezone.now(),
                is_void=True,
                void_reason="superseded by receipt 41",
            )
            PaymentReceiptCounter.objects.update_or_create(
                pk=1,
                defaults={"next_sequence": 7},
            )
            result = reconcile_payment_receipt_counter(dry_run=False)
            self.assertEqual(result["new_next"], 43)
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 43
            )

    def test_reconcile_never_renumbers_existing_receipts(self):
        with schema_context(self.schema_name):
            PaymentReceipt.objects.create(number=90, receipt_date=timezone.now())
            reconcile_payment_receipt_counter(dry_run=False)
            self.assertEqual(
                list(PaymentReceipt.objects.values_list("number", flat=True)),
                [90],
            )

    def test_reset_command_dry_run_leaves_counter_alone(self):
        with schema_context(self.schema_name):
            self._verified_payment_with_receipt()
            PaymentReceiptCounter.objects.update_or_create(
                pk=1,
                defaults={"next_sequence": 99},
            )
        out = StringIO()
        call_command(
            "reset-payment-receipt-numbering",
            schema_name=self.schema_name,
            dry_run=True,
            stdout=out,
        )
        output = out.getvalue()
        self.assertIn("receipts=1", output)
        self.assertIn("-> 2", output)
        with schema_context(self.schema_name):
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 99
            )

    def test_reset_command_apply_updates_counter(self):
        with schema_context(self.schema_name):
            for _ in range(2):
                self._verified_payment_with_receipt()
        call_command(
            "reset-payment-receipt-numbering",
            schema_name=self.schema_name,
        )
        with schema_context(self.schema_name):
            self.assertEqual(
                PaymentReceiptCounter.objects.get(pk=1).next_sequence, 3
            )
```

The void row in the second test is the point: the counter must clear a consumed-but-void number, or the next allocation collides on the unique constraint.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: `KeyError: 'receipt_count'`.

- [ ] **Step 3: Rewrite reconcile**

In `app_finance/payment_receipt_number.py`, delete `VERIFIED_RECEIPT_ORDER`, `verified_payments_for_receipt_numbering`, and `_would_renumber_count`, and replace `reconcile_payment_receipt_counter` with:

```python
@transaction.atomic
def reconcile_payment_receipt_counter(*, dry_run: bool = False) -> dict[str, int]:
    """Realign the counter to the highest issued number. Renumbering would
    destroy the void rows that account for historical gaps."""
    receipt_count = PaymentReceipt.objects.count()
    max_number = PaymentReceipt.objects.aggregate(m=Max("number"))["m"] or 0
    new_next = max_number + 1
    counter = PaymentReceiptCounter.objects.filter(pk=1).first()
    previous_next = counter.next_sequence if counter else 1
    if not dry_run:
        PaymentReceiptCounter.objects.update_or_create(
            pk=1,
            defaults={"next_sequence": new_next},
        )
    return {
        "receipt_count": receipt_count,
        "previous_next": previous_next,
        "new_next": new_next,
    }
```

Replace the `from django.db.models import F` import with `from django.db.models import Max`.

- [ ] **Step 4: Update the management command**

In `app_finance/management/commands/reset-payment-receipt-numbering.py`, replace the docstring, `help`, and the output block:

```python
"""Realign the payment receipt counter to the highest issued receipt number."""
```

```python
    help = (
        "Set PaymentReceiptCounter.next_sequence to the highest issued receipt "
        "number + 1. Never renumbers existing receipts."
    )
```

```python
            verb = "would set" if dry_run else "set"
            self.stdout.write(
                self.style.NOTICE(
                    f"Schema {schema_name}: receipts={result['receipt_count']}, "
                    f"counter {result['previous_next']} -> {result['new_next']} "
                    f"({verb} next_sequence)"
                )
            )
```

Delete the `renumbered` and `renumber_verb` locals.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schedjuice-reimagined-be/app_finance/payment_receipt_number.py \
        schedjuice-reimagined-be/app_finance/management/commands/reset-payment-receipt-numbering.py \
        schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_number.py
git commit -m "refactor: make receipt counter reconcile counter-only"
```

---

### Task 5: Read receipt numbers from the receipt

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py:133` and `:256-310`
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py:80-126`
- Modify: `schedjuice-reimagined-be/app_finance/views.py:247`, `:464`, `:930`
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

**Interfaces:**
- Consumes: `UserPayment.receipt` from Task 1.
- Produces: `_group_receipt_number(parts: list[UserPayment]) -> int | None` in `payment_group.py`; a top-level `receipt_number` key on group rows; `UserPaymentSerializer.get_receipt_number(obj) -> int | None`.

Group rows have no top-level `receipt_number` today, which is exactly why the frontend fell back to min-of-parts.

- [ ] **Step 1: Write the failing tests**

Replace `test_admin_report_includes_receipt_number` in `app_finance/tests/test_payment_group.py` with a version that goes through verification instead of writing the column directly, and add a group-row test:

```python
    def test_admin_report_reads_receipt_number_from_the_receipt(self):
        with schema_context(self.schema_name):
            payment = UserPayment.objects.create(
                user=self.student,
                course=self.course,
                transaction_id="RECEIPT-NUM-7",
                parsed_amount=Money(100, "USD"),
                actual_amount=Money(100, "USD"),
                status=UserPayment.Status.PENDING_VERIFICATION,
            )
            payment.status = UserPayment.Status.VERIFIED
            payment.save(update_fields=["status"])
            payment.refresh_from_db()
            expected = payment.receipt.number

        rows = self._admin_report_rows_for_student_course()
        row = next(
            r
            for r in rows
            if r.get("kind") == "payment"
            and r.get("transaction_id") == "RECEIPT-NUM-7"
        )
        self.assertEqual(row["receipt_number"], expected)

    def test_group_row_exposes_the_shared_receipt_number(self):
        with schema_context(self.schema_name):
            group = UserPaymentGroup.objects.create(
                user=self.student,
                course=self.course,
                group_kind=UserPaymentGroup.GroupKind.SPLIT_SCREENSHOTS,
            )
            parts = [
                UserPayment.objects.create(
                    group=group,
                    user=self.student,
                    course=self.course,
                    transaction_id=f"GRP-ROW-{index}",
                    parsed_amount=Money(50, "USD"),
                    status=UserPayment.Status.PENDING_VERIFICATION,
                )
                for index in range(2)
            ]
            for part in parts:
                part.status = UserPayment.Status.VERIFIED
                part.save(update_fields=["status"])
            refreshed = list(
                UserPayment.objects.filter(group_id=group.id).select_related(
                    "receipt", "user", "course", "payment_method"
                )
            )
            expected = refreshed[0].receipt.number
            rows = project_admin_report_rows(refreshed)

        group_row = next(r for r in rows if r.get("kind") == "group")
        self.assertEqual(group_row["receipt_number"], expected)
        self.assertEqual(
            {p["receipt_number"] for p in group_row["parts"]},
            {expected},
        )
```

Match the existing imports in that test module; add `UserPaymentGroup` and `project_admin_report_rows` if absent.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group
```

Expected: the first test fails with `AssertionError: None != 1` — the column still exists but Task 3 stopped writing it, so the projection reads `None`. The second fails with `KeyError: 'receipt_number'`, since group rows have no such key yet.

- [ ] **Step 3: Update the payment row projection**

In `app_finance/payment_group.py`, replace line 133:

```python
        "receipt_number": payment.receipt.number if payment.receipt_id else None,
```

- [ ] **Step 4: Add the group-row helper and key**

Add above `_admin_report_group_row`:

```python
def _group_receipt_number(parts: list[UserPayment]) -> int | None:
    """Every part of a group shares one receipt. More than one distinct number
    means that invariant broke, so report nothing rather than guess."""
    numbers = {part.receipt.number for part in parts if part.receipt_id}
    if len(numbers) != 1:
        return None
    return next(iter(numbers))
```

and in the dict returned by `_admin_report_group_row`, directly after the `"status"` key:

```python
        "receipt_number": _group_receipt_number(ordered_parts),
```

- [ ] **Step 5: Make the serializer field read-only**

In `app_finance/serializers.py`, add to the declared fields of `UserPaymentSerializer` beside `discount_lines`:

```python
    receipt_number = SerializerMethodField()
```

add the getter next to `get_discount_lines`:

```python
    def get_receipt_number(self, obj):
        return obj.receipt.number if obj.receipt_id else None
```

and add to `to_representation`, matching how the discount fields are re-asserted there:

```python
        data["receipt_number"] = self.get_receipt_number(instance)
```

This also closes a real hole: with `fields = "__all__"`, `receipt_number` was previously writable by any client that could PATCH a payment.

- [ ] **Step 6: Avoid N+1 queries**

Add `"receipt"` to three `select_related` calls in `app_finance/views.py`: `_group_parts_queryset` (line 247), `base_select_related` on `UserPaymentSearchView` (line 464), and `user_payment_query` in the admin report (line 930). Leave the `group__parts` `Prefetch` alone — its `.only(...)` list serves `_shared_screenshot_courses`, which never reads the receipt.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group app_finance.tests.test_multi_course_payment app_finance.tests.test_payment_receipt_number
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add schedjuice-reimagined-be/app_finance/payment_group.py \
        schedjuice-reimagined-be/app_finance/serializers.py \
        schedjuice-reimagined-be/app_finance/views.py \
        schedjuice-reimagined-be/app_finance/tests/test_payment_group.py
git commit -m "feat: expose the shared receipt number on payment and group rows"
```

---

### Task 6: Backfill planner

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/payment_receipt_backfill.py`
- Test: `schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_backfill.py`

**Interfaces:**
- Produces:
  - `PlannedReceipt(number: int, receipt_date, authorized_by_id: int | None, payment_ids: tuple[int, ...])`
  - `PlannedVoid(number: int, receipt_date, void_reason: str)`
  - `BackfillPlan(receipts: tuple[PlannedReceipt, ...], voids: tuple[PlannedVoid, ...], next_sequence: int)`
  - `plan_receipt_backfill(payments: list[dict], *, fallback_date) -> BackfillPlan`, where each dict has keys `id`, `group_id`, `receipt_number`, `payment_date`, `created_at`, `verified_at`, `verified_by_id`.

The planner is deliberately pure — plain dicts and dataclasses, no Django imports. That makes it testable with a fast unit test and safe for a migration to import, and it keeps working after Task 7 drops the `receipt_number` column, which a model-level test could not.

- [ ] **Step 1: Write the failing tests**

Create `app_finance/tests/test_payment_receipt_backfill.py`:

```python
from datetime import datetime, timedelta, timezone as dt_timezone

from django.test import SimpleTestCase

from app_finance.payment_receipt_backfill import plan_receipt_backfill

BASE = datetime(2026, 5, 1, tzinfo=dt_timezone.utc)
FALLBACK = datetime(2026, 12, 31, tzinfo=dt_timezone.utc)


def _row(**kwargs):
    row = {
        "id": 1,
        "group_id": None,
        "receipt_number": None,
        "payment_date": BASE,
        "created_at": BASE,
        "verified_at": BASE,
        "verified_by_id": None,
    }
    row.update(kwargs)
    return row


class PlanReceiptBackfillTests(SimpleTestCase):
    def test_group_adopts_lowest_number_and_voids_the_surplus(self):
        plan = plan_receipt_backfill(
            [
                _row(id=1, group_id=9, receipt_number=41),
                _row(id=2, group_id=9, receipt_number=42),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual([r.number for r in plan.receipts], [41])
        self.assertEqual(plan.receipts[0].payment_ids, (1, 2))
        self.assertEqual([v.number for v in plan.voids], [42])
        self.assertEqual(plan.voids[0].void_reason, "superseded by receipt 41")
        self.assertEqual(plan.next_sequence, 43)

    def test_standalone_payment_produces_no_voids(self):
        plan = plan_receipt_backfill(
            [_row(id=5, receipt_number=7)],
            fallback_date=FALLBACK,
        )
        self.assertEqual([r.number for r in plan.receipts], [7])
        self.assertEqual(plan.voids, ())
        self.assertEqual(plan.next_sequence, 8)

    def test_receipt_date_is_earliest_across_all_parts_including_unnumbered(self):
        early = BASE - timedelta(days=3)
        plan = plan_receipt_backfill(
            [
                _row(id=1, group_id=9, receipt_number=41, payment_date=BASE),
                _row(id=2, group_id=9, receipt_number=None, payment_date=early),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].receipt_date, early)

    def test_only_numbered_payments_are_linked(self):
        plan = plan_receipt_backfill(
            [
                _row(id=1, group_id=9, receipt_number=41),
                _row(id=2, group_id=9, receipt_number=None),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].payment_ids, (1,))

    def test_authorized_by_is_the_last_verifier(self):
        plan = plan_receipt_backfill(
            [
                _row(
                    id=1,
                    group_id=9,
                    receipt_number=41,
                    verified_at=BASE,
                    verified_by_id=100,
                ),
                _row(
                    id=2,
                    group_id=9,
                    receipt_number=42,
                    verified_at=BASE + timedelta(days=1),
                    verified_by_id=200,
                ),
            ],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].authorized_by_id, 200)

    def test_unnumbered_units_are_skipped_entirely(self):
        plan = plan_receipt_backfill(
            [_row(id=1), _row(id=2, group_id=9)],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts, ())
        self.assertEqual(plan.voids, ())
        self.assertEqual(plan.next_sequence, 1)

    def test_fallback_date_used_when_a_unit_has_no_dates(self):
        plan = plan_receipt_backfill(
            [_row(id=1, receipt_number=3, payment_date=None, created_at=None)],
            fallback_date=FALLBACK,
        )
        self.assertEqual(plan.receipts[0].receipt_date, FALLBACK)
```

`SimpleTestCase` is correct here: the planner touches no database, so this suite is fast and needs no fixtures.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_backfill
```

Expected: `ModuleNotFoundError: No module named 'app_finance.payment_receipt_backfill'`.

- [ ] **Step 3: Write the planner**

Create `app_finance/payment_receipt_backfill.py`:

```python
"""Pure planner for the one-receipt-per-unit backfill.

Imports nothing from Django so a migration can call it and so it keeps working
after UserPayment.receipt_number is dropped.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class PlannedReceipt:
    number: int
    receipt_date: datetime
    authorized_by_id: int | None
    payment_ids: tuple[int, ...]


@dataclass(frozen=True)
class PlannedVoid:
    number: int
    receipt_date: datetime
    void_reason: str


@dataclass(frozen=True)
class BackfillPlan:
    receipts: tuple[PlannedReceipt, ...]
    voids: tuple[PlannedVoid, ...]
    next_sequence: int


def _unit_key(row: dict) -> tuple[str, int]:
    if row["group_id"] is not None:
        return ("group", row["group_id"])
    return ("payment", row["id"])


def _row_date(row: dict):
    return row["payment_date"] or row["created_at"]


def plan_receipt_backfill(
    payments: list[dict], *, fallback_date: datetime
) -> BackfillPlan:
    units: dict[tuple[str, int], list[dict]] = {}
    for row in payments:
        units.setdefault(_unit_key(row), []).append(row)

    receipts: list[PlannedReceipt] = []
    voids: list[PlannedVoid] = []
    highest = 0

    for key in sorted(units):
        rows = units[key]
        numbered = [r for r in rows if r["receipt_number"] is not None]
        if not numbered:
            continue
        numbers = sorted(r["receipt_number"] for r in numbered)
        primary = numbers[0]

        dates = [d for d in (_row_date(r) for r in rows) if d is not None]
        receipt_date = min(dates) if dates else fallback_date

        completer = max(
            (r for r in numbered if r["verified_at"] is not None),
            key=lambda r: (r["verified_at"], r["id"]),
            default=None,
        )
        authorized_by_id = (completer or numbered[-1])["verified_by_id"]

        receipts.append(
            PlannedReceipt(
                number=primary,
                receipt_date=receipt_date,
                authorized_by_id=authorized_by_id,
                payment_ids=tuple(sorted(r["id"] for r in numbered)),
            )
        )
        for surplus in numbers[1:]:
            voids.append(
                PlannedVoid(
                    number=surplus,
                    receipt_date=receipt_date,
                    void_reason=f"superseded by receipt {primary}",
                )
            )
        highest = max(highest, numbers[-1])

    return BackfillPlan(
        receipts=tuple(receipts),
        voids=tuple(voids),
        next_sequence=highest + 1,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_backfill
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-be/app_finance/payment_receipt_backfill.py \
        schedjuice-reimagined-be/app_finance/tests/test_payment_receipt_backfill.py
git commit -m "feat: add pure planner for the payment receipt backfill"
```

---

### Task 7: Data migration and column removal

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/migrations/0082_backfill_payment_receipts.py`
- Create: `schedjuice-reimagined-be/app_finance/migrations/0083_drop_userpayment_receipt_number.py`
- Modify: `schedjuice-reimagined-be/app_finance/models.py:215` (drop `receipt_number`), `:346-353` (drop the constraint)

**Interfaces:**
- Consumes: `plan_receipt_backfill` from Task 6; `PaymentReceipt` and `UserPayment.receipt` from Task 1.
- Produces: no Python API. After 0083, `UserPayment.receipt_number` does not exist.

- [ ] **Step 1: Write the data migration**

Create `app_finance/migrations/0082_backfill_payment_receipts.py`:

```python
from django.db import migrations
from django.utils import timezone

from app_finance.payment_receipt_backfill import plan_receipt_backfill


def forwards(apps, schema_editor):
    UserPayment = apps.get_model("app_finance", "UserPayment")
    PaymentReceipt = apps.get_model("app_finance", "PaymentReceipt")
    PaymentReceiptCounter = apps.get_model("app_finance", "PaymentReceiptCounter")

    rows = list(
        UserPayment.objects.values(
            "id",
            "group_id",
            "receipt_number",
            "payment_date",
            "created_at",
            "verified_at",
            "verified_by_id",
        )
    )
    if not rows:
        return

    plan = plan_receipt_backfill(rows, fallback_date=timezone.now())
    if not plan.receipts and not plan.voids:
        return

    PaymentReceipt.objects.bulk_create(
        [
            PaymentReceipt(
                number=planned.number,
                receipt_date=planned.receipt_date,
                authorized_by_id=planned.authorized_by_id,
                is_void=False,
                void_reason="",
            )
            for planned in plan.receipts
        ]
        + [
            PaymentReceipt(
                number=planned.number,
                receipt_date=planned.receipt_date,
                authorized_by_id=None,
                is_void=True,
                void_reason=planned.void_reason,
            )
            for planned in plan.voids
        ]
    )

    receipt_ids = dict(
        PaymentReceipt.objects.filter(
            number__in=[planned.number for planned in plan.receipts]
        ).values_list("number", "id")
    )
    for planned in plan.receipts:
        UserPayment.objects.filter(id__in=planned.payment_ids).update(
            receipt_id=receipt_ids[planned.number]
        )

    PaymentReceiptCounter.objects.update_or_create(
        pk=1,
        defaults={"next_sequence": plan.next_sequence},
    )


def backwards(apps, schema_editor):
    UserPayment = apps.get_model("app_finance", "UserPayment")
    PaymentReceipt = apps.get_model("app_finance", "PaymentReceipt")
    UserPayment.objects.update(receipt=None)
    PaymentReceipt.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("app_finance", "0081_paymentreceipt"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
```

The early `return` on empty `rows` matters: this runs against every tenant schema, including brand-new ones.

- [ ] **Step 2: Apply the migration and run the existing suites against the migrated state**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_receipt_number app_finance.tests.test_payment_receipt_backfill app_finance.tests.test_payment_group app_finance.tests.test_multi_course_payment
```

Expected: PASS. This is what proves 0082 applies — the suite runs `migrate_schemas` in `setUpTestData` and `--keepdb` applies any new migrations to the kept test database. Both `receipt` and `receipt_number` exist at this point, so nothing has broken yet.

If the run fails because `schedjuice-test-db` is not up, the script starts it. Never point this at the dev or Railway database.

- [ ] **Step 3: Remove the column from the model**

In `app_finance/models.py`, delete the `receipt_number` field at line 215, and replace the `Meta` block at lines 346-353 with:

```python
    class Meta:
        pass
```

Keep the empty `Meta`. `UserPayment` currently declares a `Meta` that does **not** inherit `BaseModel.Meta`, so it has no default ordering. Deleting the class outright would make it inherit `ordering = ["id"]`, which changes query ordering across the whole app and makes `makemigrations` emit an unwanted `AlterModelOptions`.

- [ ] **Step 4: Generate the removal migration**

```bash
./env/bin/python manage.py makemigrations app_finance --name drop_userpayment_receipt_number
```

Expected: `0083_drop_userpayment_receipt_number.py` containing exactly a `RemoveConstraint` for `uniq_userpayment_receipt_number_non_null` and a `RemoveField` for `receipt_number`. If it also contains `AlterModelOptions`, Step 3 was applied incorrectly — restore the empty `Meta` and regenerate.

- [ ] **Step 5: Confirm no references survive**

```bash
rg -n "receipt_number" schedjuice-reimagined-be/app_finance --glob '!migrations/*'
```

Expected: matches only where `receipt_number` is an **output key or planner input** — `payment_group.py` (`"receipt_number":` dict keys), `serializers.py` (the method field and getter), `payment_receipt_backfill.py` (the input dict key), and test assertions. No `payment.receipt_number` attribute access.

- [ ] **Step 6: Run the full app_finance suite**

```bash
./scripts/run_backend_tests.sh app_finance
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add schedjuice-reimagined-be/app_finance/models.py \
        schedjuice-reimagined-be/app_finance/migrations/0082_backfill_payment_receipts.py \
        schedjuice-reimagined-be/app_finance/migrations/0083_drop_userpayment_receipt_number.py
git commit -m "feat: backfill payment receipts and drop UserPayment.receipt_number"
```

---

### Task 8: Frontend reads the shared number

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/payment-receipt.ts:217-228`
- Test: `schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts`

**Interfaces:**
- Consumes: the top-level `receipt_number` on group rows from Task 5.
- Produces: no signature change. `resolveGroupReceiptNumber(groupRow)` keeps returning `string`.

`enrichPaymentReceiptRow` needs no change — its group branch already spreads `...fresh` from `user-payment-groups/<id>`, so the new top-level key flows through.

Min-of-parts would keep *working* after Task 5, since all parts now report the same number. It has to go anyway: it would silently paper over a broken invariant, printing a plausible number instead of surfacing the problem.

- [ ] **Step 1: Write the failing tests**

In `payment-receipt.test.ts`, replace `group receipt uses lowest part receipt_number` (in the `receipt number display` block) and `shows the lowest receipt number of the group` (in the cross-course group block) with:

```typescript
  it("group receipt uses the group's shared receipt number", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-12",
        group_id: 12,
        receipt_number: 3,
        user: { name: "Jane" },
        course: { title: "Math" },
        payment_method: { name: "Multiple" },
        parts: [
          { id: 1, receipt_number: 3, transaction_id: "A", actual_amount: "10" },
          { id: 2, receipt_number: 3, transaction_id: "B", actual_amount: "20" },
        ],
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("3");
  });

  it("does not guess a group number from parts when the row omits one", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-13",
        group_id: 13,
        user: { name: "Jane" },
        course: { title: "Math" },
        payment_method: { name: "Multiple" },
        parts: [
          { id: 1, receipt_number: 41, transaction_id: "A", actual_amount: "10" },
          { id: 2, receipt_number: 42, transaction_id: "B", actual_amount: "20" },
        ],
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("—");
  });
```

In the cross-course `groupRow` fixture (which sets `receipt_number: 41` and `42` on its two parts), add a top-level `receipt_number: 41` and assert `expect(payload.receiptNumber).toBe("41")`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/helpers/payment-receipt.test.ts
```

Expected: the second test fails with `expected "41" to be "—"`, because min-of-parts still answers.

- [ ] **Step 3: Read the number off the row**

Replace `resolveGroupReceiptNumber` in `src/helpers/payment-receipt.ts`:

```typescript
function resolveGroupReceiptNumber(
  groupRow: PaymentReceiptRowInput,
): string {
  return groupRow.receipt_number != null
    ? String(groupRow.receipt_number)
    : "—";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:unit -- src/helpers/payment-receipt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors. `PaymentReceiptRowInput` already declares `receipt_number?: number | null` at line 121, so no type change is needed.

- [ ] **Step 6: Commit**

```bash
git add schedjuice-reimagined-fe/src/helpers/payment-receipt.ts \
        schedjuice-reimagined-fe/src/helpers/payment-receipt.test.ts
git commit -m "fix: print the group's shared receipt number instead of the lowest part"
```

---

### Task 9: Full verification

**Files:** none modified.

- [ ] **Step 1: Full backend finance suite**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance
```

Expected: PASS, no errors.

- [ ] **Step 2: Suites that touch payments indirectly**

```bash
./scripts/run_backend_tests.sh app_reports app_tasks
```

Expected: PASS. `app_tasks` allowlists `reset-payment-receipt-numbering`, whose result keys changed in Task 4.

- [ ] **Step 3: Confirm no pending migrations**

```bash
DATABASE_URL="postgres://user:password@127.0.0.1:55432/db" \
  ./env/bin/python manage.py makemigrations --check --dry-run
```

Expected: `No changes detected`.

- [ ] **Step 4: Frontend unit suite and typecheck**

```bash
cd ../schedjuice-reimagined-fe
npm run test:unit
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "test: fix fallout from payment receipt entity refactor"
```

---

## Out of scope

Deferred to the follow-up report spec, with decisions already captured so they are not lost: `ReportStyle.EXCELLENT_CHOICE_STYLE`; one row per payment group; newline separates courses while comma separates items within a course; Authorized Person rendered as `name (email)`.

Also out of scope: staff-initiated voiding (no endpoint, permission, or UI), year-prefixed or per-course receipt sequences, and the `mt_at_ratios` / `dropout_rates` report types that `HRReportView` whitelists but never implements.
