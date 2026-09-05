# Discount Eligibility & Payment-Create Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the enrollment discount engine with eligibility rules (early bird / loyalty / bulk), an org `is_payment_plan_mandatory` flag, eligible-discounts API, and admin payment-create discount picker that applies/replaces enrollment discounts.

**Architecture:** Keep catalog → `EnrollmentDiscount` snapshot → `discount_engine` math. Add eligibility fields on `Discount`, shared `discount_eligibility.py` (reusing active-course counting via `course_is_effectively_active`), hard-gate apply for rule-typed discounts, free selection for `none`, and wire payment create (`scan-transaction-screenshots`) plus FE upload/catalog/org/course surfaces.

**Tech Stack:** Django, djmoney, tenant schemas, DRF RBAC views, Django `TestCase` via `./scripts/run_backend_tests.sh`, Next.js App Router, Zod, TanStack Query

**Spec:** `docs/superpowers/specs/2026-07-13-discount-eligibility-and-payment-create-design.md` (workspace) / `schedjuice-reimagined-be/docs/superpowers/specs/2026-07-13-discount-eligibility-and-payment-create-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `app_organization/models.py` | `is_payment_plan_mandatory` |
| `app_course/serializers.py` | Require `payment_plan` when org flag on |
| `app_finance/models.py` | Discount eligibility fields; EnrollmentDiscount snapshots; UserPayment breakdown |
| `app_finance/discount_eligibility.py` | **New** eligibility evaluator + active-course count helper |
| `app_finance/discount_engine.py` | Gate apply; snapshot eligibility |
| `app_finance/views.py` | EligibleDiscountsView; harden apply; shared count import |
| `app_finance/serializers.py` | Validate Discount eligibility; accept `discount_id` on UserPayment create |
| `app_finance/urls.py` | `eligible-discounts` route |
| `app_finance/payment_group.py` | Multipart create: discount apply + invoiced breakdown |
| `app_finance/tests/test_discount_eligibility.py` | **New** unit matrix |
| `app_finance/tests/test_discount_api.py` | Eligible + apply gate API tests |
| `app_course/tests/test_payment_plan_mandatory.py` | **New** course validation tests |
| `app_finance/tests/test_payment_create_discount.py` | **New** upload path with discount_id |
| FE `types/finance.ts`, `types/organization.ts` | Schemas/enums |
| FE discounts create/edit, org profile sections | Catalog + org toggle |
| FE course create/edit forms | Mandatory plan UX |
| FE `student-payments/upload/page.tsx` | Discount picker |
| FE `enrollment-discount-dialog.tsx` + course students UI | Wire eligible list + mount |

---

### Task 1: Org flag + course mandatory-plan validation

**Files:**
- Modify: `schedjuice-reimagined-be/app_organization/models.py`
- Modify: `schedjuice-reimagined-be/app_course/serializers.py`
- Create: `schedjuice-reimagined-be/app_course/tests/test_payment_plan_mandatory.py`
- Create: migration via `makemigrations app_organization`

- [ ] **Step 1: Write failing course validation tests**

Create `app_course/tests/test_payment_plan_mandatory.py` following `app_finance/tests/test_discount_api.py` tenant setup (`schema_name = "xschedjuice"`, `HTTP_TENANT`, user with course create permission). Core cases:

```python
def test_create_course_without_plan_allowed_when_flag_off(self):
    # org.is_payment_plan_mandatory = False
    # POST /api/v1/courses with payment_plan omitted → 201

def test_create_course_without_plan_rejected_when_flag_on(self):
    # Update Organization in public schema for this schema_name
    # POST without payment_plan → 400 mentioning payment_plan

def test_create_course_with_plan_ok_when_flag_on(self):
    # POST with payment_plan id → 201
```

Use `schema_context(get_public_schema_name())` to update `Organization.objects.filter(schema_name=self.schema_name)`.

- [ ] **Step 2: Run tests — expect fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_payment_plan_mandatory
```

Expected: FAIL (field missing / validation not present).

- [ ] **Step 3: Add model field**

In `app_organization/models.py` near `is_fm_hm_course_display_enabled`:

```python
is_payment_plan_mandatory = models.BooleanField(
    default=False,
    help_text=(
        "When True, courses must have a payment_plan. "
        "Use for schools that rely on discounts, installments, and invoicing."
    ),
)
```

Run: `./env/bin/python manage.py makemigrations app_organization`

- [ ] **Step 4: Enforce in `CourseSerializer.validate`**

Near the end of `CourseSerializer.validate` in `app_course/serializers.py`, before `return attrs`:

```python
request = self.context.get("request")
tenant = getattr(request, "tenant", None) if request else None
mandatory = bool(getattr(tenant, "is_payment_plan_mandatory", False)) if tenant else False
if mandatory:
    if "payment_plan" in attrs:
        plan = attrs.get("payment_plan")
        plan_id = getattr(plan, "pk", plan)
    elif inst is not None:
        plan_id = inst.payment_plan_id
    else:
        plan_id = None
    if not plan_id:
        raise ValidationError(
            {
                "payment_plan": (
                    "This organization requires a payment plan on every course."
                )
            }
        )
```

- [ ] **Step 5: Re-run tests — expect pass**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_payment_plan_mandatory
```

- [ ] **Step 6: Commit (BE repo)**

```bash
cd schedjuice-reimagined-be
git add app_organization/models.py app_organization/migrations/ \
  app_course/serializers.py app_course/tests/test_payment_plan_mandatory.py
git commit -m "feat(org): add is_payment_plan_mandatory and course validation"
```

---

### Task 2: Discount + EnrollmentDiscount eligibility fields

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/models.py`
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py`
- Create: migration via `makemigrations app_finance`

- [ ] **Step 1: Extend `Discount`**

Inside `class Discount` in `app_finance/models.py`:

```python
class EligibilityType(models.TextChoices):
    NONE = "none", "none"
    EARLY_BIRD = "early_bird", "early_bird"
    LOYALTY = "loyalty", "loyalty"
    BULK = "bulk", "bulk"

eligibility_type = models.CharField(
    max_length=32,
    choices=EligibilityType.choices,
    default=EligibilityType.NONE,
)
early_bird_days = models.PositiveIntegerField(null=True, blank=True)
bulk_min_courses = models.PositiveIntegerField(null=True, blank=True)
```

Extend existing `Discount.clean()` with eligibility param rules:

```python
etype = self.eligibility_type or self.EligibilityType.NONE
if etype == self.EligibilityType.NONE:
    if self.early_bird_days is not None or self.bulk_min_courses is not None:
        raise ValidationError("Plain discounts cannot set eligibility params.")
elif etype == self.EligibilityType.EARLY_BIRD:
    if not self.early_bird_days or self.early_bird_days < 1:
        raise ValidationError({"early_bird_days": "Required for early_bird (≥ 1)."})
    if self.bulk_min_courses is not None:
        raise ValidationError({"bulk_min_courses": "Must be empty for early_bird."})
elif etype == self.EligibilityType.LOYALTY:
    if self.early_bird_days is not None or self.bulk_min_courses is not None:
        raise ValidationError("Loyalty discounts cannot set eligibility params.")
elif etype == self.EligibilityType.BULK:
    if not self.bulk_min_courses or self.bulk_min_courses < 2:
        raise ValidationError({"bulk_min_courses": "Required for bulk (≥ 2)."})
    if self.early_bird_days is not None:
        raise ValidationError({"early_bird_days": "Must be empty for bulk."})
```

- [ ] **Step 2: Extend `EnrollmentDiscount` snapshots**

```python
snapshot_eligibility_type = models.CharField(
    max_length=32,
    choices=Discount.EligibilityType.choices,
    default=Discount.EligibilityType.NONE,
)
snapshot_early_bird_days = models.PositiveIntegerField(null=True, blank=True)
snapshot_bulk_min_courses = models.PositiveIntegerField(null=True, blank=True)
```

- [ ] **Step 3: Validate from `DiscountSerializer`**

```python
class DiscountSerializer(BaseModelSerializer):
    class Meta:
        model = models.Discount
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = models.Discount() if self.instance is None else self.instance
        # copy current field values then overlay attrs
        if self.instance is not None:
            for field in instance._meta.fields:
                setattr(instance, field.name, getattr(self.instance, field.name))
        for k, v in attrs.items():
            setattr(instance, k, v)
        instance.clean()
        return attrs
```

- [ ] **Step 4: makemigrations + smoke existing discount tests**

```bash
./env/bin/python manage.py makemigrations app_finance
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine
./scripts/run_backend_tests.sh app_finance.tests.test_discount_api
```

Expected: PASS (defaults `none`).

- [ ] **Step 5: Commit**

```bash
git add app_finance/models.py app_finance/serializers.py app_finance/migrations/
git commit -m "feat(finance): add discount eligibility fields and snapshots"
```

---

### Task 3: `discount_eligibility` module (TDD)

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/discount_eligibility.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_discount_eligibility.py`
- Modify: `schedjuice-reimagined-be/app_finance/views.py`

- [ ] **Step 1: Write failing unit tests**

In `test_discount_eligibility.py`, use the same tenant/`Discount`/`Course`/`UserCourse` setup style as `test_discount_api.py`. Cover:

| Case | Expect |
|------|--------|
| `none` | `(True, None)` |
| early_bird, `as_of <= start - N` | eligible |
| early_bird, after window | `early_bird_window_closed` |
| loyalty, prior other enrollment | eligible |
| loyalty, only current | `loyalty_not_met` |
| bulk, active count ≥ N | eligible |
| bulk, count N−1 | `bulk_min_not_met` |

```python
from datetime import timedelta
from app_finance.discount_eligibility import is_discount_eligible
from app_finance.models import Discount

def test_early_bird_inside_window(self):
    d = Discount.objects.create(
        name="eb",
        discount_type=Discount.DiscountType.PERCENT,
        percent_value=10,
        scope=Discount.Scope.FIRST_PERIOD,
        eligibility_type=Discount.EligibilityType.EARLY_BIRD,
        early_bird_days=14,
    )
    as_of = self.course.start_date - timedelta(days=14)
    ok, reason = is_discount_eligible(
        discount=d,
        user=self.student,
        course=self.course,
        user_course=self.enrollment,
        as_of=as_of,
    )
    self.assertTrue(ok)
    self.assertIsNone(reason)
```

- [ ] **Step 2: Run — expect fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_eligibility
```

- [ ] **Step 3: Implement module**

```python
# app_finance/discount_eligibility.py
from __future__ import annotations

from datetime import date, timedelta

from app_auth.models import User
from app_course.course_status import course_is_effectively_active
from app_course.models import Course, UserCourse
from app_finance.models import Discount


def student_active_course_count(user_id: int) -> int:
    enrollments = UserCourse.objects.filter(
        user_id=user_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("course")
    return sum(1 for uc in enrollments if course_is_effectively_active(uc.course))


def is_discount_eligible(
    *,
    discount: Discount,
    user: User,
    course: Course,
    user_course: UserCourse | None,
    as_of: date,
) -> tuple[bool, str | None]:
    etype = discount.eligibility_type or Discount.EligibilityType.NONE
    if etype == Discount.EligibilityType.NONE:
        return True, None

    if etype == Discount.EligibilityType.EARLY_BIRD:
        start = course.start_date
        if start is None:
            return False, "early_bird_missing_start_date"
        days = discount.early_bird_days or 0
        cutoff = start - timedelta(days=days)
        if as_of <= cutoff:
            return True, None
        return False, "early_bird_window_closed"

    if etype == Discount.EligibilityType.LOYALTY:
        qs = UserCourse.objects.filter(
            user_id=user.id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        if user_course is not None:
            qs = qs.exclude(pk=user_course.pk)
        if qs.exists():
            return True, None
        return False, "loyalty_not_met"

    if etype == Discount.EligibilityType.BULK:
        count = student_active_course_count(user.id)
        minimum = discount.bulk_min_courses or 0
        if count >= minimum:
            return True, None
        return False, "bulk_min_not_met"

    return False, "unknown_eligibility_type"
```

- [ ] **Step 4: Point views helper at shared function**

Replace `_student_active_course_count` body in `app_finance/views.py` with:

```python
def _student_active_course_count(user_id: int) -> int:
    from app_finance.discount_eligibility import student_active_course_count

    return student_active_course_count(user_id)
```

- [ ] **Step 5: Run tests — pass**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_eligibility
./scripts/run_backend_tests.sh app_finance.tests.test_discount_api
```

- [ ] **Step 6: Commit**

```bash
git add app_finance/discount_eligibility.py \
  app_finance/tests/test_discount_eligibility.py app_finance/views.py
git commit -m "feat(finance): add discount eligibility evaluator"
```

---

### Task 4: Harden apply + snapshot eligibility

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/discount_engine.py`
- Modify: `schedjuice-reimagined-be/app_finance/views.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_discount_api.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_discount_engine.py`

- [ ] **Step 1: Failing API tests**

```python
def test_apply_early_bird_outside_window_rejected(self):
    # early_bird discount; as_of / today outside window → POST 400
    # details include early_bird_window_closed

def test_apply_plain_discount_still_ok(self):
    # eligibility none → 201
```

- [ ] **Step 2: Gate inside `apply_enrollment_discount`**

Extend signature with `as_of: date | None = None`. After existing inactive/plan checks:

```python
from datetime import date
from app_finance.discount_eligibility import is_discount_eligible

ok, reason = is_discount_eligible(
    discount=discount,
    user=user_course.user,
    course=user_course.course,
    user_course=user_course,
    as_of=as_of or date.today(),
)
if not ok:
    raise ValueError(reason or "Discount not eligible")
```

When creating `EnrollmentDiscount`, also set:

```python
snapshot_eligibility_type=discount.eligibility_type,
snapshot_early_bird_days=discount.early_bird_days,
snapshot_bulk_min_courses=discount.bulk_min_courses,
```

- [ ] **Step 3: Optional `as_of` on POST body**

In `EnrollmentDiscountView.post`, parse `request.data.get("as_of")` as `YYYY-MM-DD` when present and pass into `apply_enrollment_discount`.

- [ ] **Step 4: Run tests**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_api
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine
```

- [ ] **Step 5: Commit**

```bash
git add app_finance/discount_engine.py app_finance/views.py \
  app_finance/tests/test_discount_api.py app_finance/tests/test_discount_engine.py
git commit -m "feat(finance): gate enrollment discount apply on eligibility"
```

---

### Task 5: Eligible-discounts API

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py`
- Modify: `schedjuice-reimagined-be/app_finance/urls.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_discount_api.py`

- [ ] **Step 1: Failing test**

```python
def test_eligible_discounts_filters_rule_typed(self):
    # plain + failing early_bird + passing loyalty (with prior enrollment)
    # GET /api/v1/user-courses/{id}/eligible-discounts
    # discounts include plain + loyalty only; current null or existing
```

- [ ] **Step 2: Implement `EligibleDiscountsView`**

```python
class EligibleDiscountsView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "payment.configure"}

    def get(self, request, user_course_id: int):
        user_course = (
            UserCourse.objects.select_related(
                "course", "course__payment_plan", "user"
            )
            .filter(id=user_course_id, assigned_as=UserCourse.AssignedAs.STUDENT)
            .first()
        )
        if not user_course:
            return self.send_response(
                True, "not_found", {"details": "Enrollment not found"}, status=404
            )
        if not user_course.course.payment_plan_id:
            return self.send_response(
                True,
                "validation_error",
                {"details": "Course has no payment plan"},
                status=400,
            )

        from datetime import date
        from app_finance.discount_eligibility import is_discount_eligible
        from app_finance.discount_engine import get_active_enrollment_discount

        as_of_raw = request.query_params.get("as_of")
        as_of = date.fromisoformat(as_of_raw) if as_of_raw else date.today()

        current = get_active_enrollment_discount(user_course)
        selectable = []
        for d in models.Discount.objects.filter(is_active=True).order_by("name"):
            ok, _ = is_discount_eligible(
                discount=d,
                user=user_course.user,
                course=user_course.course,
                user_course=user_course,
                as_of=as_of,
            )
            if ok:
                selectable.append(serializers.DiscountSerializer(d).data)

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "current": (
                        serializers.EnrollmentDiscountSerializer(current).data
                        if current
                        else None
                    ),
                    "discounts": selectable,
                }
            },
        )
```

- [ ] **Step 3: Register URL** next to existing enrollment discount routes in `app_finance/urls.py`:

```python
path(
    "user-courses/<int:user_course_id>/eligible-discounts",
    views.EligibleDiscountsView.as_view(),
    name="eligible-discounts",
),
```

- [ ] **Step 4: Run tests + commit**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_discount_api
git add app_finance/views.py app_finance/urls.py app_finance/tests/test_discount_api.py
git commit -m "feat(finance): add eligible-discounts endpoint"
```

---

### Task 6: UserPayment breakdown fields

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/models.py` (`UserPayment`)
- Create: migration

- [ ] **Step 1: Add fields on `UserPayment`**

```python
base_amount = MoneyField(
    max_digits=19, decimal_places=4, null=True, blank=True, default_currency="USD"
)
discount_amount = MoneyField(
    max_digits=19, decimal_places=4, null=True, blank=True, default_currency="USD"
)
enrollment_discount = models.ForeignKey(
    "EnrollmentDiscount",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="user_payments",
)
```

- [ ] **Step 2: makemigrations + commit**

```bash
./env/bin/python manage.py makemigrations app_finance
git add app_finance/models.py app_finance/migrations/
git commit -m "feat(finance): persist payment discount breakdown fields"
```

---

### Task 7: Payment create applies discount + sets invoiced breakdown

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/payment_discount_apply.py`
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py` (`UserPaymentSerializer`)
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_payment_create_discount.py`

- [ ] **Step 1: Write failing integration test**

POST `/api/v1/scan-transaction-screenshots` with `user`, `course`, screenshot stub, and `discount_id`:

- enrollment gets active `EnrollmentDiscount`
- `UserPayment.invoiced_amount` matches `discount_engine`
- `base_amount` / `discount_amount` / `enrollment_discount` set

Also cover:

- neither `discount_id` nor `clear_discount` → leave enrollment discount unchanged; still price from engine if plan exists
- `clear_discount=true` → remove active enrollment discount

- [ ] **Step 2: Implement helper**

Create `app_finance/payment_discount_apply.py`:

```python
from datetime import date

from app_course.models import UserCourse
from app_finance.discount_eligibility import student_active_course_count
from app_finance.discount_engine import (
    apply_enrollment_discount,
    compute_invoiced_amount,
    get_active_enrollment_discount,
    remove_enrollment_discount,
)
from app_finance.models import Discount


def resolve_student_enrollment(*, user_id: int, course_id: int):
    return (
        UserCourse.objects.filter(
            user_id=user_id,
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("course", "course__payment_plan", "user")
        .first()
    )


def apply_payment_create_discount(
    *,
    user_course: UserCourse,
    request_user,
    org,
    discount_id,
    clear_discount: bool,
    as_of: date | None = None,
):
    if not user_course.course.payment_plan_id:
        return None
    if clear_discount:
        remove_enrollment_discount(user_course=user_course, removed_by=request_user)
        return None
    if discount_id is not None:
        discount = Discount.objects.get(id=discount_id, is_active=True)
        return apply_enrollment_discount(
            user_course=user_course,
            discount=discount,
            applied_by=request_user,
            org=org,
            as_of=as_of,
        )
    return get_active_enrollment_discount(user_course)


def compute_payment_amount_breakdown(*, user_course: UserCourse, org, billing_period_index: int):
    plan = user_course.course.payment_plan
    if not plan:
        return None
    count = student_active_course_count(user_course.user_id)
    # Match live compute_invoiced_amount signature exactly (inspect discount_engine.py).
    return compute_invoiced_amount(
        user_course=user_course,
        payment_plan=plan,
        billing_period_index=billing_period_index,
        org=org,
        user_active_course_count=count,
    )
```

For `billing_period_index`, copy the existing approach used by `generate_invoices` / preview (count prior invoice rows for the enrollment, or `0` for first). Do not invent a new definition.

- [ ] **Step 3: Hook `UserPaymentSerializer`**

Add write-only fields `discount_id` (optional) and `clear_discount` (optional bool). In `create()`:

1. Pop those fields
2. Resolve enrollment
3. Call `apply_payment_create_discount`
4. If plan present, set `invoiced_amount`, `base_amount`, `discount_amount`, `enrollment_discount` from breakdown
5. Persist payment as today

- [ ] **Step 4: Hook multipart** in `payment_group.py` / `_post_multipart_group` once per group before creating parts (same discount semantics).

- [ ] **Step 5: Run tests + commit**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group
git add app_finance/
git commit -m "feat(finance): apply enrollment discount on admin payment create"
```

---

### Task 8: FE types + discount catalog eligibility UI

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/finance.ts`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/discounts/create/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/discounts/[id]/edit/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/discounts/discount-columns.tsx`
- Modify: `schedjuice-reimagined-fe/src/sdk/_types/discounts.ts` if needed

- [ ] **Step 1: Extend Zod schemas**

```typescript
export enum DiscountEligibilityType {
  none = "none",
  early_bird = "early_bird",
  loyalty = "loyalty",
  bulk = "bulk",
}

// Add to discountSchema / discountCreateEditSchema:
eligibility_type: z
  .nativeEnum(DiscountEligibilityType)
  .default(DiscountEligibilityType.none),
early_bird_days: z.coerce.number().nullable().optional(),
bulk_min_courses: z.coerce.number().nullable().optional(),
```

Add `.superRefine` so early_bird requires days ≥ 1, bulk requires min ≥ 2, and `none`/`loyalty` clear params.

- [ ] **Step 2: Catalog forms**

Add eligibility type select + conditional number inputs on create/edit. Show eligibility in columns.

- [ ] **Step 3: Commit (FE repo)**

```bash
cd schedjuice-reimagined-fe
git add src/types/finance.ts src/app/\(internal\)/discounts/ src/sdk/_types/discounts.ts
git commit -m "feat(discounts): catalog eligibility fields in create/edit UI"
```

---

### Task 9: FE org toggle + course mandatory-plan UX

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization.ts`
- Modify: `schedjuice-reimagined-fe/src/config/organization-profile-sections.ts`
- Modify: `schedjuice-reimagined-fe/src/components/scheduling/manual-course-form.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/edit/page.tsx`

- [ ] **Step 1: Org schema + section**

Add `is_payment_plan_mandatory: z.coerce.boolean().optional()` to owner edit schema.

Add `"is_payment_plan_mandatory"` to `reports-billing` keys in `organization-profile-sections.ts` (every owner-edit key must appear exactly once).

- [ ] **Step 2: Course forms**

When tenant/`useTenant` has `is_payment_plan_mandatory === true`:

- require `payment_plan` in form schema
- remove/hide empty “None” option

- [ ] **Step 3: Commit**

```bash
git add src/types/organization.ts src/config/organization-profile-sections.ts \
  src/components/scheduling/manual-course-form.tsx \
  src/app/\(internal\)/courses/
git commit -m "feat(org): payment plan mandatory toggle and course form enforcement"
```

---

### Task 10: FE payment-create discount picker

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/student-payments/upload/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/lib/finances/synthetic-payment-stub.ts` if stub create needs `discount_id`
- Optional: `schedjuice-reimagined-fe/src/components/finance/payment-discount-picker.tsx`

- [ ] **Step 1: Load picker when user+course selected and course has payment_plan**

1. Resolve student `user_course` id for that pair
2. `GET user-courses/{id}/eligible-discounts?as_of=YYYY-MM-DD` (use issued date when form has one)
3. Preselect `current.discount` / template id
4. Combobox of `discounts`; allow clear
5. Optional preview via `discount-preview`

If no enrollment or no plan → hide picker.

- [ ] **Step 2: Submit FormData rules**

- Selection equals current → omit discount fields
- New id → append `discount_id`
- Cleared while current existed → append `clear_discount=true`

- [ ] **Step 3: Manual smoke** on upload page with plan course + plain discount.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(internal\)/finances/student-payments/upload/ \
  src/components/finance/ src/lib/finances/synthetic-payment-stub.ts
git commit -m "feat(finances): discount picker on student payment upload"
```

---

### Task 11: Wire EnrollmentDiscountDialog + mount on roster

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finance/enrollment-discount-dialog.tsx`
- Modify: course students page / manager component that owns roster actions

- [ ] **Step 1: Eligible list as catalog source**

Load options from `user-courses/{id}/eligible-discounts`. Grandfather: if `current` references a discount id not in `discounts`, still include that option so keep-current works.

- [ ] **Step 2: Mount dialog**

On course students roster, for users with `payment.configure`, render `EnrollmentDiscountDialog` with `userCourseId`.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/enrollment-discount-dialog.tsx \
  src/components/course/ src/app/\(internal\)/courses/
git commit -m "feat(finances): wire enrollment discount dialog to eligible-discounts"
```

---

### Task 12: Regression sweep

- [ ] **Step 1: BE suites**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_discount_engine
./scripts/run_backend_tests.sh app_finance.tests.test_discount_api
./scripts/run_backend_tests.sh app_finance.tests.test_discount_eligibility
./scripts/run_backend_tests.sh app_finance.tests.test_payment_create_discount
./scripts/run_backend_tests.sh app_course.tests.test_payment_plan_mandatory
```

- [ ] **Step 2: FE check**

```bash
cd schedjuice-reimagined-fe
npx tsc --noEmit -p tsconfig.json
```

(or the repo’s standard typecheck/lint script if that is preferred).

- [ ] **Step 3: Optional** mark design spec status `Implemented` when shipping.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `is_payment_plan_mandatory` | 1, 9 |
| Course requires plan when flag on | 1, 9 |
| Discount eligibility fields + one rule type | 2, 8 |
| Enrollment eligibility snapshots | 2, 4 |
| Evaluator early_bird/loyalty/bulk/none | 3 |
| Mixed hard gate vs free plain | 3, 4, 5 |
| Reuse active enrollment count for bulk | 3 |
| Eligible-discounts API | 5 |
| Harden apply | 4 |
| Payment create picker + apply/replace/clear | 7, 10 |
| Preselect current / grandfather keep | 5, 7, 10, 11 |
| UserPayment breakdown fields | 6, 7 |
| Catalog FE | 8 |
| Wire EnrollmentDiscountDialog | 11 |
| Non-retroactive verified payments | unchanged |
| Out of scope items | not planned |

---

## Self-review notes

- `compute_invoiced_amount` / `billing_period_index` in Task 7 must follow live `discount_engine.py` and `generate_invoices` — copy existing helpers, do not invent a new period index.
- BE and FE are separate git repos; commit in the owning repo.
- Workspace `/docs/superpowers/` may be untracked; durable BE docs live under `schedjuice-reimagined-be/docs/superpowers/`.
