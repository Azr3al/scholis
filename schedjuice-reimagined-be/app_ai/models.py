"""Per-tenant AI usage, billing rollups, and budgets (public schema)."""
from __future__ import annotations

from decimal import Decimal

from django.contrib.postgres.indexes import GinIndex
from django.db import models

from app_organization.models import Organization


class AIUsageLog(models.Model):
    class Status(models.TextChoices):
        SUCCESS = "success", "success"
        ERROR = "error", "error"

    tenant = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="ai_usage_logs",
    )
    user_id = models.PositiveIntegerField(null=True, blank=True)
    feature = models.CharField(max_length=128, blank=True, default="")
    model = models.CharField(max_length=128)
    pricing_version = models.CharField(max_length=64)

    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    thinking_tokens = models.PositiveIntegerField(default=0)
    cached_input_tokens = models.PositiveIntegerField(default=0)
    cache_write_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)

    computed_cost_usd = models.DecimalField(
        max_digits=12, decimal_places=8, default=Decimal("0")
    )
    billed_cost_usd = models.DecimalField(
        max_digits=12, decimal_places=8, default=Decimal("0")
    )

    latency_ms = models.PositiveIntegerField(default=0)
    tool_iterations = models.PositiveSmallIntegerField(default=0)

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.SUCCESS
    )
    error_type = models.CharField(max_length=128, blank=True, default="")
    finish_reason = models.CharField(max_length=64, blank=True, default="")
    tool_calls = models.JSONField(default=list, blank=True)
    retries = models.PositiveSmallIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "created_at"], name="ix_ai_usage_tenant_created"),
            models.Index(fields=["tenant", "model", "created_at"], name="ix_ai_usage_tenant_model"),
        ]


class AIUserUsageMonthly(models.Model):
    tenant = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="ai_user_usage_monthly",
    )
    user_id = models.PositiveIntegerField()
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()

    input_tokens = models.PositiveBigIntegerField(default=0)
    output_tokens = models.PositiveBigIntegerField(default=0)
    thinking_tokens = models.PositiveBigIntegerField(default=0)
    cached_input_tokens = models.PositiveBigIntegerField(default=0)
    cache_write_tokens = models.PositiveBigIntegerField(default=0)
    total_tokens = models.PositiveBigIntegerField(default=0)

    total_cost_usd = models.DecimalField(
        max_digits=14, decimal_places=8, default=Decimal("0")
    )
    total_billed_usd = models.DecimalField(
        max_digits=14, decimal_places=8, default=Decimal("0")
    )
    request_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "user_id", "year", "month"],
                name="uniq_ai_user_usage_monthly",
            )
        ]
        indexes = [
            models.Index(
                fields=["tenant", "year", "month", "-total_billed_usd"],
                name="ix_ai_user_usage_tnt_mo_cost",
            ),
        ]


class AITenantUsageMonthly(models.Model):
    tenant = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="ai_usage_monthly",
    )
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    model = models.CharField(max_length=128, blank=True, default="")

    input_tokens = models.PositiveBigIntegerField(default=0)
    output_tokens = models.PositiveBigIntegerField(default=0)
    thinking_tokens = models.PositiveBigIntegerField(default=0)
    cached_input_tokens = models.PositiveBigIntegerField(default=0)
    cache_write_tokens = models.PositiveBigIntegerField(default=0)
    total_tokens = models.PositiveBigIntegerField(default=0)

    total_cost_usd = models.DecimalField(
        max_digits=14, decimal_places=8, default=Decimal("0")
    )
    total_billed_usd = models.DecimalField(
        max_digits=14, decimal_places=8, default=Decimal("0")
    )
    request_count = models.PositiveIntegerField(default=0)

    highest_alert_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal("0"),
        help_text="Highest spend threshold (0-1) already alerted this month.",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "year", "month", "model"],
                name="uniq_ai_tenant_usage_monthly",
            )
        ]


class AIRequestLog(models.Model):
    class Outcome(models.TextChoices):
        SUCCESS = "success", "success"
        TOOL_LIMIT_EXCEEDED = "tool_limit_exceeded", "tool_limit_exceeded"
        CAPABILITY_GAP = "capability_gap", "capability_gap"
        ERROR = "error", "error"
        BLOCKED = "blocked", "blocked"
        RATE_LIMITED = "rate_limited", "rate_limited"
        USER_QUOTA_EXCEEDED = "user_quota_exceeded", "user_quota_exceeded"

    class Source(models.TextChoices):
        LIVE = "live", "live"
        BACKFILL = "backfill", "backfill"

    tenant = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="ai_request_logs",
    )
    user_id = models.PositiveIntegerField(null=True, blank=True)
    feature = models.CharField(max_length=128)
    channel_key = models.CharField(max_length=128, blank=True, default="")
    prompt = models.TextField()
    response_text = models.TextField(blank=True, default="")
    outcome = models.CharField(max_length=32, choices=Outcome.choices)
    tool_iterations = models.PositiveSmallIntegerField(default=0)
    tool_calls = models.JSONField(default=list, blank=True)
    likely_causes = models.JSONField(default=list, blank=True)
    capability_gaps = models.JSONField(default=list, blank=True)
    capability_gap_reason = models.TextField(blank=True, default="")
    capability_gap_intent = models.CharField(max_length=256, blank=True, default="")
    capability_gap_domain = models.CharField(max_length=64, blank=True, default="")
    capability_gap_suggested_surface = models.CharField(
        max_length=128, blank=True, default=""
    )
    model = models.CharField(max_length=128, blank=True, default="")
    total_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    source = models.CharField(
        max_length=16,
        choices=Source.choices,
        default=Source.LIVE,
    )
    error_type = models.CharField(max_length=128, blank=True, default="")
    thinking_steps = models.JSONField(default=list, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by_user_id = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "created_at"], name="ix_ai_req_tenant_created"),
            models.Index(fields=["outcome", "created_at"], name="ix_ai_req_outcome_created"),
            models.Index(
                fields=["feature", "outcome", "created_at"],
                name="ix_ai_req_feat_out_created",
            ),
            GinIndex(
                fields=["likely_causes"],
                name="ix_ai_req_likely_causes",
                opclasses=["jsonb_path_ops"],
            ),
            GinIndex(
                fields=["capability_gaps"],
                name="ix_ai_req_capability_gaps",
                opclasses=["jsonb_path_ops"],
            ),
        ]


class OcrExtractionEvent(models.Model):
    class Source(models.TextChoices):
        IMAGE_UPLOAD = "image_upload", "image_upload"
        MICROSOFT_PAYMENT_ASSIGNMENT = (
            "microsoft_payment_assignment",
            "microsoft_payment_assignment",
        )

    class Trigger(models.TextChoices):
        PREVIEW = "preview", "preview"
        ASYNC = "async", "async"

    class Outcome(models.TextChoices):
        SUCCESS = "success", "success"
        PARTIAL = "partial", "partial"
        ERROR = "error", "error"

    class Correctness(models.TextChoices):
        PENDING = "pending", "pending"
        CORRECT = "correct", "correct"
        CORRECTED = "corrected", "corrected"
        FAILED_EXTRACTION = "failed_extraction", "failed_extraction"

    id = models.UUIDField(primary_key=True, editable=False)
    tenant = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="ocr_extraction_events",
    )
    source = models.CharField(max_length=64, choices=Source.choices)
    trigger = models.CharField(
        max_length=16, choices=Trigger.choices, null=True, blank=True
    )
    outcome = models.CharField(max_length=16, choices=Outcome.choices)
    extracted_transaction_id = models.CharField(max_length=100, blank=True, default="")
    extracted_amount = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True
    )
    extracted_bank = models.CharField(max_length=32, blank=True, default="")
    user_payment_id = models.PositiveIntegerField(null=True, blank=True)
    user_payment_schema = models.CharField(max_length=63, blank=True, default="")
    correctness = models.CharField(
        max_length=32,
        choices=Correctness.choices,
        default=Correctness.PENDING,
    )
    ocr_endpoint = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["tenant", "created_at"], name="ix_ocr_evt_tenant_created"
            ),
            models.Index(
                fields=["source", "created_at"], name="ix_ocr_evt_source_created"
            ),
            models.Index(
                fields=["correctness", "created_at"],
                name="ix_ocr_evt_correct_created",
            ),
        ]


class AITenantBudget(models.Model):
    tenant = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="ai_budget",
    )
    monthly_usd_limit = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    monthly_token_limit = models.PositiveBigIntegerField(null=True, blank=True)
    hard_enforce = models.BooleanField(default=False)
    alert_thresholds = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def effective_alert_thresholds(self) -> list[float]:
        raw = self.alert_thresholds
        if not raw:
            return [0.5, 0.8, 1.0]
        return [float(x) for x in raw]
