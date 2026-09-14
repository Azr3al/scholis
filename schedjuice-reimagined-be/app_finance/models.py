from django.db import models, transaction

from app_auth.models import User
from schedjuice_backend.helpers import get_tenant_specific_upload_folder
from schedjuice_backend.storages import PrivateMediaStorage
from utilitas.models import BaseModel
from djmoney.models.fields import MoneyField


def get_tenant_specfic_folder_for_payment_ss(instance, filename):
    return get_tenant_specific_upload_folder(filename, "payment_screenshots")


def get_tenant_specific_folder_for_payment_adjustments(instance, filename):
    return get_tenant_specific_upload_folder(filename, "payment_adjustments")


def get_tenant_specific_folder_for_staff_payment_ss(instance, filename):
    return get_tenant_specific_upload_folder(filename, "staff_payment_screenshots")


def get_tenant_specific_folder_for_staff_payment_proofs(instance, filename):
    return get_tenant_specific_upload_folder(filename, "staff_payment_proofs")


class PaymentBank(models.TextChoices):
    KBZ = "KBZ", "KBZ"
    KPAY = "KPAY", "KPAY"
    UAB = "UAB", "UAB"
    CB = "CB", "CB"
    AYA = "AYA", "AYA"
    YOMA = "YOMA", "YOMA"
    CASH = "CASH", "CASH"
    MOB = "MOB", "MOB"


class PaymentMethod(BaseModel):
    name = models.CharField(max_length=255, unique=True)
    description = models.CharField(max_length=1000, null=True, blank=True)
    bank_account_number = models.CharField(max_length=255, null=True, blank=True)
    payment_bank = models.CharField(choices=PaymentBank.choices, max_length=20)
    is_retired = models.BooleanField(default=False)


class PaymentInfo(BaseModel):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="payment_infos",
    )
    account_name = models.CharField(max_length=512)
    description = models.CharField(max_length=1000, null=True, blank=True)
    bank_type = models.CharField(choices=PaymentBank.choices, max_length=20)
    is_default = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(is_default=True),
                name="app_finance_paymentinfo_unique_default_per_user",
            )
        ]

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.is_default and self.user_id:
                PaymentInfo.objects.filter(
                    user_id=self.user_id,
                    is_default=True,
                ).exclude(pk=self.pk).update(is_default=False)
            return super().save(*args, **kwargs)


class StaffPayment(BaseModel):
    """Recorded disbursement to a staff member (payout proof + amount)."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="staff_payments",
    )
    payment_info = models.ForeignKey(
        PaymentInfo,
        on_delete=models.PROTECT,
        related_name="staff_payments",
    )
    amount = MoneyField(max_digits=19, decimal_places=4, default_currency="USD")
    paid_at = models.DateTimeField(db_index=True)
    pay_period_year = models.IntegerField(db_index=True)
    pay_period_month = models.IntegerField(db_index=True)
    confirmed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    screenshot = models.ImageField(
        upload_to=get_tenant_specific_folder_for_staff_payment_ss,
        storage=PrivateMediaStorage(),
        null=True,
        blank=True,
    )
    transaction_id = models.CharField(max_length=100, null=True, blank=True)
    remarks = models.CharField(max_length=2000, null=True, blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="created_staff_payments",
        null=True,
    )

    class Meta:
        indexes = [
            models.Index(fields=["-paid_at", "-created_at"]),
            models.Index(
                fields=["pay_period_year", "pay_period_month", "user"],
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "pay_period_year", "pay_period_month"],
                name="uniq_staff_payment_user_pay_period",
            ),
        ]
        ordering = ["-paid_at", "-created_at"]


class StaffPaymentProof(BaseModel):
    staff_payment = models.ForeignKey(
        StaffPayment,
        on_delete=models.CASCADE,
        related_name="proofs",
    )
    file = models.FileField(
        upload_to=get_tenant_specific_folder_for_staff_payment_proofs,
        storage=PrivateMediaStorage(),
    )
    filename = models.CharField(max_length=5120)

    class Meta:
        ordering = ["id"]


class PaymentReceiptCounter(BaseModel):
    """Singleton per tenant: next receipt # to allocate (pk=1 only)."""

    next_sequence = models.PositiveIntegerField(default=1)


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


class UserPaymentGroup(BaseModel):
    """Logical payment sharing a billing plan: many screenshots for one course
    (split_screenshots) or one transaction across several courses (multi_course,
    where `course` is null and each part carries its own course)."""

    class GroupKind(models.TextChoices):
        SPLIT_SCREENSHOTS = "split_screenshots", "split_screenshots"
        MULTI_COURSE = "multi_course", "multi_course"

    group_kind = models.CharField(
        max_length=32,
        choices=GroupKind.choices,
        default=GroupKind.SPLIT_SCREENSHOTS,
    )
    issued_at = models.DateTimeField(null=True)
    billing_start_date = models.DateTimeField(null=True)
    billing_end_date = models.DateTimeField(null=True)
    is_installment = models.BooleanField(default=False)
    installment_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional display percent for this installment (0–100).",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="user_payment_groups",
        null=True,
    )
    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        related_name="user_payment_groups",
        null=True,
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="created_user_payment_groups",
        null=True,
    )
    shared_transaction_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            "Links sibling groups created from one shared bank transfer "
            "(multiple students, one screenshot)."
        ),
    )


class UserPayment(BaseModel):
    class Status(models.TextChoices):
        PENDING_PAYMENT = "pending_payment", "pending_payment"
        CANNOT_EXTRACT = "cannot_extract", "cannot_extract"
        AWAITING_EXTRACTION = "awaiting_extraction", "awaiting_extraction"
        AWAITING_METADATA_EXTRACTION = (
            "awaiting_metadata_extraction",
            "awaiting_metadata_extraction",
        )
        PENDING_VERIFICATION = "pending_verification", "pending_verification"
        DUPLICATED = "duplicated", "duplicated"
        VERIFIED = "verified", "verified"
        # will be used when parsed_amount != actual_amount
        AMOUNT_MISMATCH = "amount_mismatch", "amount_mismatch"

    screenshot = models.ImageField(
        upload_to=get_tenant_specfic_folder_for_payment_ss,
        null=True,
        storage=PrivateMediaStorage(),
    )
    issued_at = models.DateTimeField(null=True)
    payment_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date shown on payment receipts; defaults to upload time.",
    )
    receipt = models.ForeignKey(
        "PaymentReceipt",
        on_delete=models.PROTECT,
        related_name="payments",
        null=True,
        blank=True,
        help_text="Issued receipt. Set on verification; all parts of a group share one.",
    )
    # the system-generated invoiced amount
    invoiced_amount = MoneyField(
        max_digits=19, decimal_places=4, null=True, default_currency="USD"
    )
    base_amount = MoneyField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        default_currency="USD",
    )
    discount_amount = MoneyField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        default_currency="USD",
    )
    enrollment_discount = models.ForeignKey(
        "EnrollmentDiscount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_payments",
    )
    # OCR parsed amount from the screenshot
    parsed_amount = MoneyField(
        max_digits=19, decimal_places=4, null=True, default_currency="USD"
    )
    # actual amount from the verification csv file
    actual_amount = MoneyField(
        max_digits=19, decimal_places=4, null=True, default_currency="USD"
    )
    json_ocr_data = models.JSONField(null=True)
    text_ocr_data = models.TextField(null=True, blank=True)
    date_on_screenshot = models.CharField(max_length=300, null=True)
    description = models.CharField(max_length=2000, null=True)
    transaction_id = models.CharField(max_length=100, null=True)
    status = models.CharField(
        choices=Status.choices, default=Status.PENDING_PAYMENT, max_length=100
    )
    billing_start_date = models.DateTimeField(null=True)
    billing_end_date = models.DateTimeField(null=True)
    remarks = models.CharField(max_length=2000, null=True, blank=True)
    payment_method = models.ForeignKey(
        PaymentMethod, on_delete=models.CASCADE, related_name="user_payments", null=True
    )
    # if null, it means that the payment is uploaded by admin
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="user_payments", null=True
    )
    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        related_name="user_payments",
        null=True,
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, related_name="created_user_payments", null=True
    )
    group = models.ForeignKey(
        "UserPaymentGroup",
        on_delete=models.CASCADE,
        related_name="parts",
        null=True,
        blank=True,
    )
    microsoft_submission_id = models.CharField(
        max_length=512, null=True, blank=True, unique=True
    )
    ocr_event_id = models.UUIDField(null=True, blank=True)
    verified_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="When the payment was first marked verified.",
    )
    verified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="verified_user_payments",
        null=True,
        blank=True,
        help_text="Staff user who first marked the payment verified, when known.",
    )
    is_installment = models.BooleanField(
        default=False,
        help_text="Partial payment toward course fees (installment plan).",
    )
    installment_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional display percent for this installment (0–100).",
    )
    computed_invoiced_amount = MoneyField(
        max_digits=19,
        decimal_places=4,
        null=True,
        blank=True,
        default_currency="USD",
        help_text=(
            "What the pricing engine calculated for this payment. Always written, "
            "including when an admin overrides invoiced_amount, so the override "
            "can be audited against the computed figure."
        ),
    )
    is_amount_overridden = models.BooleanField(
        default=False,
        help_text=(
            "True when an admin supplied invoiced_amount explicitly. Repricing "
            "and backfills must skip these payments."
        ),
    )
    amount_override_reason = models.CharField(
        max_length=2000,
        null=True,
        blank=True,
        help_text="Why the amount was overridden. Audit trail only.",
    )
    discount_ids_set_on_create = models.JSONField(
        null=True,
        blank=True,
        help_text=(
            "Discount template ids written to the enrollment stack on create. "
            "null = stack unchanged; [] = cleared; [id, ...] = set exactly. "
            "Write-once audit for delete cleanup."
        ),
    )

    class Meta:
        pass

    def save(self, *args, **kwargs):
        from django.utils import timezone as dj_timezone

        from app_finance.payment_receipt_number import ensure_receipt_for_payment

        update_fields = kwargs.get("update_fields")
        if self._state.adding and self.payment_date is None:
            self.payment_date = dj_timezone.now()
            if update_fields is not None:
                kwargs["update_fields"] = tuple(
                    set(update_fields) | {"payment_date"}
                )
        if self.status == self.Status.VERIFIED and self.verified_at is None:
            self.verified_at = dj_timezone.now()
            if update_fields is not None:
                kwargs["update_fields"] = tuple(
                    set(update_fields) | {"verified_at", "status"}
                )
        if ensure_receipt_for_payment(self) is not None and update_fields is not None:
            kwargs["update_fields"] = tuple(
                set(kwargs["update_fields"]) | {"receipt"}
            )
        return super().save(*args, **kwargs)


class PaymentAdjustment(BaseModel):
    """School-recorded refund or re-transfer proof linked to a student payment."""

    class Kind(models.TextChoices):
        REFUND = "refund", "refund"
        RE_TRANSFER = "re_transfer", "re_transfer"

    user_payment = models.ForeignKey(
        UserPayment,
        on_delete=models.CASCADE,
        related_name="adjustments",
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    amount = MoneyField(max_digits=19, decimal_places=4, default_currency="USD")
    occurred_at = models.DateTimeField()
    note = models.CharField(max_length=2000, null=True, blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="created_payment_adjustments",
        null=True,
    )

    class Meta:
        ordering = ["-occurred_at", "-id"]


class PaymentAdjustmentImage(BaseModel):
    adjustment = models.ForeignKey(
        PaymentAdjustment,
        on_delete=models.CASCADE,
        related_name="images",
    )
    image = models.ImageField(
        upload_to=get_tenant_specific_folder_for_payment_adjustments,
        storage=PrivateMediaStorage(),
    )
    filename = models.CharField(max_length=5120)

    class Meta:
        ordering = ["id"]


class UserPaymentCoveredMonth(BaseModel):
    """Explicit calendar months covered by a payment (multi-month screenshot)."""

    user_payment = models.ForeignKey(
        UserPayment,
        on_delete=models.CASCADE,
        related_name="covered_months",
    )
    year = models.PositiveIntegerField()
    month_index = models.PositiveSmallIntegerField(
        help_text="Calendar month 1–12.",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user_payment", "year", "month_index"),
                name="app_finance_userpaymentcoveredmonth_unique_month_per_payment",
            )
        ]
        indexes = [
            models.Index(fields=("year", "month_index")),
            models.Index(fields=("user_payment", "year", "month_index")),
        ]

    def __str__(self) -> str:
        return f"{self.year}-{self.month_index:02d} (payment {self.user_payment_id})"


def get_tenant_specific_folder_for_receiver_ss(instance, filename):
    return get_tenant_specific_upload_folder(filename, "receiver_screenshots")


class ReceiverSideScreenshot(BaseModel):
    """Stores transaction IDs from receiver-side CSV uploads for matching with UserPayment."""

    transaction_id = models.CharField(max_length=100)
    is_matched = models.BooleanField(default=False)
    user_payment = models.OneToOneField(
        UserPayment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="receiver_side_screenshot",
    )


class Billing(BaseModel):
    billing_date = models.DateField(db_index=True)
    active_user_count = models.PositiveIntegerField()
    cost_per_account_at_creation = models.PositiveIntegerField()


class PaymentPlan(BaseModel):
    class BillingType(models.TextChoices):
        PER_PERIOD = "per_period", "Per billing period"
        WHOLE_TERM = "whole_term", "Whole term"

    name = models.CharField(max_length=255, unique=True)
    price = MoneyField(max_digits=19, decimal_places=4, default_currency="USD")
    billing_type = models.CharField(
        max_length=20,
        choices=BillingType.choices,
        default=BillingType.PER_PERIOD,
        help_text="Whether `price` covers a single billing period or the whole course term",
    )
    discount_price = MoneyField(
        max_digits=19, decimal_places=4, default_currency="USD", null=True, blank=True
    )
    per_hour_price = MoneyField(
        max_digits=19,
        decimal_places=4,
        default_currency="USD",
        null=True,
        blank=True,
        help_text="The price students pay per hour for the course",
    )
    early_payment_days = models.PositiveIntegerField(
        default=3,
        help_text="Number of days before the course start date when users can start making payments",
    )
    days_before_course_locked = models.PositiveIntegerField(
        default=3,
        help_text="Number of days after the payment due date when the course gets locked for non-paying users",
    )


class Discount(BaseModel):
    class DiscountType(models.TextChoices):
        PERCENT = "percent", "percent"
        FIXED_AMOUNT = "fixed_amount", "fixed_amount"

    class Scope(models.TextChoices):
        FIRST_PERIOD = "first_period", "first_period"
        WHOLE_ENROLLMENT = "whole_enrollment", "whole_enrollment"

    class EligibilityType(models.TextChoices):
        NONE = "none", "none"
        EARLY_BIRD = "early_bird", "early_bird"
        LOYALTY = "loyalty", "loyalty"
        BULK = "bulk", "bulk"

    name = models.CharField(max_length=255, unique=True)
    discount_type = models.CharField(max_length=32, choices=DiscountType.choices)
    percent_value = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="0–100 when discount_type is percent.",
    )
    fixed_amount = MoneyField(
        max_digits=19,
        decimal_places=4,
        default_currency="USD",
        null=True,
        blank=True,
    )
    scope = models.CharField(max_length=32, choices=Scope.choices)
    eligibility_type = models.CharField(
        max_length=32,
        choices=EligibilityType.choices,
        default=EligibilityType.NONE,
    )
    early_bird_days = models.PositiveIntegerField(null=True, blank=True)
    bulk_min_courses = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True, default="")

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.discount_type == self.DiscountType.PERCENT:
            if (
                self.percent_value is None
                or self.percent_value <= 0
                or self.percent_value > 100
            ):
                raise ValidationError(
                    {"percent_value": "Percent must be between 0 and 100."}
                )
        elif self.discount_type == self.DiscountType.FIXED_AMOUNT:
            if self.fixed_amount is None or self.fixed_amount.amount <= 0:
                raise ValidationError(
                    {"fixed_amount": "Fixed amount must be greater than 0."}
                )

        etype = self.eligibility_type or self.EligibilityType.NONE
        if etype == self.EligibilityType.NONE:
            if self.early_bird_days is not None or self.bulk_min_courses is not None:
                raise ValidationError("Plain discounts cannot set eligibility params.")
        elif etype == self.EligibilityType.EARLY_BIRD:
            if not self.early_bird_days or self.early_bird_days < 1:
                raise ValidationError(
                    {"early_bird_days": "Required for early_bird (≥ 1)."}
                )
            if self.bulk_min_courses is not None:
                raise ValidationError(
                    {"bulk_min_courses": "Must be empty for early_bird."}
                )
        elif etype == self.EligibilityType.LOYALTY:
            if self.early_bird_days is not None or self.bulk_min_courses is not None:
                raise ValidationError(
                    "Loyalty discounts cannot set eligibility params."
                )
        elif etype == self.EligibilityType.BULK:
            if not self.bulk_min_courses or self.bulk_min_courses < 2:
                raise ValidationError(
                    {"bulk_min_courses": "Required for bulk (≥ 2)."}
                )
            if self.early_bird_days is not None:
                raise ValidationError({"early_bird_days": "Must be empty for bulk."})


class EnrollmentDiscount(BaseModel):
    user_course = models.ForeignKey(
        "app_course.UserCourse",
        on_delete=models.CASCADE,
        related_name="enrollment_discounts",
    )
    discount = models.ForeignKey(
        Discount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applications",
    )
    snapshot_discount_type = models.CharField(
        max_length=32, choices=Discount.DiscountType.choices
    )
    snapshot_scope = models.CharField(max_length=32, choices=Discount.Scope.choices)
    snapshot_percent_value = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    snapshot_fixed_amount = MoneyField(
        max_digits=19,
        decimal_places=4,
        default_currency="USD",
        null=True,
        blank=True,
    )
    snapshot_eligibility_type = models.CharField(
        max_length=32,
        choices=Discount.EligibilityType.choices,
        default=Discount.EligibilityType.NONE,
    )
    snapshot_early_bird_days = models.PositiveIntegerField(null=True, blank=True)
    snapshot_bulk_min_courses = models.PositiveIntegerField(null=True, blank=True)
    remaining_credit = MoneyField(
        max_digits=19,
        decimal_places=4,
        default_currency="USD",
        null=True,
        blank=True,
    )
    per_period_share = MoneyField(
        max_digits=19,
        decimal_places=4,
        default_currency="USD",
        null=True,
        blank=True,
    )
    first_period_consumed = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    applied_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="applied_enrollment_discounts"
    )
    applied_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=512, blank=True, default="")
    removed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="removed_enrollment_discounts",
    )
    removed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user_course", "discount"],
                condition=models.Q(is_active=True) & models.Q(discount__isnull=False),
                name="app_finance_enrollmentdiscount_one_active_per_template",
            )
        ]


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
