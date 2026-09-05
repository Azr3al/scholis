from app_finance import models
from app_finance.payment_coverage import (
    compute_incremental_installment_months,
    normalize_month_entries,
    sync_user_payment_covered_months,
)
from utilitas.serializers import BaseModelSerializer
from rest_framework.serializers import (
    Serializer,
    CharField,
    IntegerField,
    DecimalField,
    SerializerMethodField,
    BooleanField,
    ListField,
)
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
import json

from app_finance.payment_scoping import acting_user
from app_finance.payment_info_scoping import (
    get_default_payment_info_for_user,
    has_payment_info_manage_all,
)
from app_rbac.resolution import effective_permissions


class PaymentMethodSerializer(BaseModelSerializer):
    class Meta:
        model = models.PaymentMethod
        fields = "__all__"


class PaymentInfoSerializer(BaseModelSerializer):
    class Meta:
        model = models.PaymentInfo
        fields = "__all__"
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer", {"many": False}),
        }

    def validate_user(self, user):
        if user.is_student():
            raise ValidationError(
                {"user": "Payment info cannot be assigned to student-only users."}
            )
        request = self.context.get("request")
        actor = acting_user(request) if request is not None else None
        if actor is not None:
            held = set(effective_permissions(actor))
            if not has_payment_info_manage_all(held):
                target_id = getattr(user, "id", user)
                if int(target_id) != actor.id:
                    raise ValidationError(
                        {"user": "You can only manage your own payment info."}
                    )
        return user

    def validate(self, attrs):
        bank_type = attrs.get("bank_type")
        if bank_type is None and self.instance is not None:
            bank_type = self.instance.bank_type
        description = attrs.get("description")
        if description is None and self.instance is not None:
            description = self.instance.description
        if bank_type and bank_type != models.PaymentBank.CASH:
            if not str(description or "").strip():
                raise ValidationError(
                    {
                        "description": (
                            "Account/wallet number is required for this payout type."
                        )
                    }
                )
        return attrs


class UserPaymentSerializer(BaseModelSerializer):
    covered_months = SerializerMethodField()
    discount_label = SerializerMethodField()
    discount_lines = SerializerMethodField()
    receipt_number = SerializerMethodField()
    group_id = IntegerField(read_only=True)
    shared_screenshot_courses = SerializerMethodField()
    discount_id = IntegerField(required=False, allow_null=True, write_only=True)
    discount_ids = ListField(
        child=IntegerField(), required=False, allow_null=True, write_only=True
    )
    clear_discount = BooleanField(required=False, default=False, write_only=True)

    class Meta:
        model = models.UserPayment
        fields = "__all__"
        expandable_fields = {
            "payment_courses": ("app_finance.serializers.PaymentCourseSerializer", {"many": True}),
            "user": ("app_auth.serializers.UserSerializer", {"many": False}),
            "course": ("app_course.serializers.CourseSerializer", {"many": False}),
            "payment_method": ("app_finance.serializers.PaymentMethodSerializer", {"many": False}),
            "created_by": ("app_auth.serializers.UserSerializer", {"many": False}),
            "verified_by": ("app_auth.serializers.UserSerializer", {"many": False}),
        }

    def get_covered_months(self, obj):
        rows = obj.covered_months.all()
        return [{"year": cm.year, "month_index": cm.month_index} for cm in rows]

    def get_discount_label(self, obj):
        from app_finance.payment_discount_apply import joined_discount_label

        return joined_discount_label(obj)

    def get_discount_lines(self, obj):
        lines = list(obj.payment_discounts.all())
        return [
            {
                "enrollment_discount_id": ln.enrollment_discount_id,
                "label": ln.label,
                "amount": str(ln.amount.amount) if ln.amount is not None else None,
            }
            for ln in lines
        ]

    def get_receipt_number(self, obj):
        return obj.receipt.number if obj.receipt_id else None

    def get_shared_screenshot_courses(self, obj):
        from app_finance.payment_group import _shared_screenshot_courses

        return _shared_screenshot_courses(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["discount_label"] = self.get_discount_label(instance)
        data["discount_lines"] = self.get_discount_lines(instance)
        data["receipt_number"] = self.get_receipt_number(instance)
        return data

    def _parse_coverage_from_request(self):
        req = self.context.get("request")
        if req is None:
            return None
        data = getattr(req, "data", None)
        if data is None or "covered_months" not in data:
            return None
        raw = data.get("covered_months")
        if raw is None or raw == "":
            return []
        if isinstance(raw, str):
            raw = raw.strip()
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as e:
                raise ValidationError({"covered_months": f"Invalid JSON: {e}"}) from e
        elif isinstance(raw, list):
            parsed = raw
        else:
            raise ValidationError({"covered_months": "Expected a JSON array or list."})
        out: list[dict] = []
        for x in parsed:
            if not isinstance(x, dict):
                raise ValidationError({"covered_months": "Each entry must be an object with year and month_index."})
            try:
                out.append({"year": int(x["year"]), "month_index": int(x["month_index"])})
            except (KeyError, TypeError, ValueError) as e:
                raise ValidationError({"covered_months": f"Invalid entry: {e}"}) from e
        return out

    def _parse_json_object_field(self, field_name: str) -> dict | None:
        req = self.context.get("request")
        if req is None:
            return None
        data = getattr(req, "data", None)
        if data is None or field_name not in data:
            return None
        raw = data.get(field_name)
        if raw is None or raw == "":
            return None
        if isinstance(raw, str):
            raw = raw.strip()
            if not raw:
                return None
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as e:
                raise ValidationError({field_name: f"Invalid JSON: {e}"}) from e
        elif isinstance(raw, dict):
            parsed = raw
        else:
            raise ValidationError({field_name: "Expected a JSON object."})
        if not isinstance(parsed, dict):
            raise ValidationError({field_name: "Expected a JSON object."})
        try:
            return {
                "year": int(parsed["year"]),
                "month_index": int(parsed["month_index"]),
            }
        except (KeyError, TypeError, ValueError) as e:
            raise ValidationError({field_name: f"Invalid entry: {e}"}) from e

    def _parse_installment_through_month(self) -> dict | None:
        return self._parse_json_object_field("installment_through_month")

    def _resolve_installment_coverage(
        self,
        instance: models.UserPayment | None,
        validated_data: dict,
    ) -> list[dict] | None:
        is_installment = validated_data.get(
            "is_installment",
            instance.is_installment if instance is not None else False,
        )
        if not is_installment:
            return None

        through = self._parse_installment_through_month()
        if through is None:
            if instance is not None and instance.is_installment:
                return None
            raise ValidationError(
                {"installment_through_month": "Required for installment payments."}
            )

        user_id = validated_data.get("user")
        if user_id is None and instance is not None:
            user_id = instance.user_id
        course_id = validated_data.get("course")
        if course_id is None and instance is not None:
            course_id = instance.course_id

        if user_id is None or course_id is None:
            raise ValidationError(
                {"user": "user and course are required for installment payments."}
            )

        uid = user_id.id if hasattr(user_id, "id") else int(user_id)
        cid = course_id.id if hasattr(course_id, "id") else int(course_id)

        return compute_incremental_installment_months(
            user_id=uid,
            course_id=cid,
            target_year=through["year"],
            target_month=through["month_index"],
            exclude_payment_id=instance.id if instance is not None else None,
        )

    @staticmethod
    def _validate_month_entries(months: list[dict]) -> None:
        try:
            normalize_month_entries(months)
        except (ValueError, KeyError, TypeError) as e:
            raise ValidationError({"covered_months": str(e)}) from e

    def _parse_discount_write_args(self, validated_data: dict) -> tuple:
        """
        Returns (discount_id, discount_ids, clear_discount).
        discount_ids is None when omitted; list when present (incl. empty).
        """
        request = self.context.get("request")
        data = getattr(request, "data", None) if request is not None else None

        clear_discount = bool(validated_data.pop("clear_discount", False))
        if data is not None and "clear_discount" in data:
            raw = data.get("clear_discount")
            if isinstance(raw, bool):
                clear_discount = raw
            else:
                clear_discount = str(raw).strip().lower() in {"1", "true", "yes", "on"}

        discount_id = validated_data.pop("discount_id", None)
        discount_ids = validated_data.pop("discount_ids", None)

        has_discount_id = discount_id is not None
        has_discount_ids = discount_ids is not None
        if data is not None:
            if "discount_id" in data and data.get("discount_id") not in (None, ""):
                try:
                    discount_id = int(data.get("discount_id"))
                    has_discount_id = True
                except (TypeError, ValueError) as exc:
                    raise ValidationError({"discount_id": "Invalid id."}) from exc
            if "discount_ids" in data:
                raw_ids = data.getlist("discount_ids") if hasattr(data, "getlist") else data.get("discount_ids")
                if raw_ids is None:
                    raw_ids = []
                if isinstance(raw_ids, (str, int)):
                    raw_ids = [raw_ids]
                if len(raw_ids) == 1 and isinstance(raw_ids[0], str) and "," in raw_ids[0]:
                    raw_ids = [x.strip() for x in raw_ids[0].split(",") if x.strip()]
                try:
                    discount_ids = [int(x) for x in raw_ids if x not in (None, "")]
                except (TypeError, ValueError) as exc:
                    raise ValidationError({"discount_ids": "Invalid id."}) from exc
                has_discount_ids = True

        return (
            discount_id if has_discount_id else None,
            discount_ids if has_discount_ids else None,
            clear_discount,
            has_discount_id,
            has_discount_ids,
        )

    @staticmethod
    def _coverage_to_tuples(coverage: list[dict] | None) -> list[tuple[int, int]] | None:
        if not coverage:
            return None
        return [(int(m["year"]), int(m["month_index"])) for m in coverage]

    def _price_from_coverage(
        self,
        *,
        user,
        course,
        request_user,
        coverage,
        discount_id,
        discount_ids,
        clear_discount,
        has_discount_id,
        has_discount_ids,
    ) -> dict:
        """Coverage must be resolved before pricing — the amount depends on it."""
        from app_finance.payment_discount_apply import apply_discount_and_amount_fields
        from app_finance.views import _get_current_org

        try:
            return apply_discount_and_amount_fields(
                user=user,
                course=course,
                request_user=request_user,
                org=_get_current_org(),
                discount_id=discount_id if has_discount_id else None,
                discount_ids=discount_ids if has_discount_ids else None,
                clear_discount=clear_discount,
                covered_months=self._coverage_to_tuples(coverage),
            )
        except ValueError as exc:
            if str(exc) == "covered_month_outside_course":
                raise ValidationError(
                    {"covered_months": "Month falls outside the course schedule."}
                ) from exc
            raise ValidationError({"discount_ids": str(exc)}) from exc

    def _reprice_after_coverage_change(self, instance) -> None:
        """Coverage drives price, so an edited span must re-derive the amount."""
        from app_finance.payment_coverage import month_tuples_from_payment
        from app_finance.payment_discount_apply import (
            compute_payment_amount_breakdown,
            resolve_student_enrollment,
        )
        from app_finance.views import _get_current_org

        if instance.user_id is None or instance.course_id is None:
            return
        user_course = resolve_student_enrollment(
            user_id=instance.user_id, course_id=instance.course_id
        )
        if user_course is None or not user_course.course.payment_plan_id:
            return

        instance.refresh_from_db(fields=["id"])
        result = compute_payment_amount_breakdown(
            user_course=user_course,
            org=_get_current_org(),
            covered_months=month_tuples_from_payment(instance),
        )
        if result is None:
            return

        fields = ["computed_invoiced_amount", "updated_at"]
        instance.computed_invoiced_amount = result.invoiced_amount
        if not instance.is_amount_overridden:
            instance.base_amount = result.base_amount
            instance.discount_amount = result.discount_amount
            instance.invoiced_amount = result.invoiced_amount
            fields += ["base_amount", "discount_amount", "invoiced_amount"]
        instance.save(update_fields=fields)

    def create(self, validated_data):
        coverage = self._parse_coverage_from_request()
        installment_coverage = self._resolve_installment_coverage(None, validated_data)
        if installment_coverage is not None:
            coverage = installment_coverage

        (
            discount_id,
            discount_ids,
            clear_discount,
            has_discount_id,
            has_discount_ids,
        ) = self._parse_discount_write_args(validated_data)
        # Ensure write-only keys are gone even if parse used validated_data pops already
        validated_data.pop("discount_id", None)
        validated_data.pop("discount_ids", None)
        validated_data.pop("clear_discount", None)

        with transaction.atomic():
            request = self.context.get("request")
            request_user = acting_user(request) if request else None
            user = validated_data.get("user")
            course = validated_data.get("course")
            discount_lines = ()

            overridden = "invoiced_amount" in validated_data
            override_value = validated_data.get("invoiced_amount")

            if coverage is not None:
                self._validate_month_entries(coverage)

            if user is not None and course is not None and request_user is not None:
                from app_finance.payment_discount_apply import (
                    persist_payment_discount_lines,
                )

                amount_fields = self._price_from_coverage(
                    user=user,
                    course=course,
                    request_user=request_user,
                    coverage=coverage,
                    discount_id=discount_id,
                    discount_ids=discount_ids,
                    clear_discount=clear_discount,
                    has_discount_id=has_discount_id,
                    has_discount_ids=has_discount_ids,
                )
                discount_lines = amount_fields.pop("_discount_lines", ())
                amount_fields.pop("_period_indices", None)
                discount_ids_set_on_create = amount_fields.pop(
                    "_discount_ids_set_on_create", None
                )
                if discount_ids_set_on_create is not None:
                    validated_data["discount_ids_set_on_create"] = (
                        discount_ids_set_on_create
                    )
                validated_data.update(amount_fields)

            if overridden:
                validated_data["invoiced_amount"] = override_value
                validated_data["is_amount_overridden"] = True

            if validated_data.get("payment_date") is None:
                validated_data["payment_date"] = timezone.now()

            instance = super().create(validated_data)
            if discount_lines:
                persist_payment_discount_lines(
                    user_payment=instance, lines=discount_lines
                )
            if coverage is not None:
                sync_user_payment_covered_months(instance, coverage)
            return instance

    def update(self, instance, validated_data):
        coverage = self._parse_coverage_from_request()
        installment_coverage = self._resolve_installment_coverage(instance, validated_data)
        if installment_coverage is not None:
            coverage = installment_coverage

        overridden = "invoiced_amount" in validated_data
        with transaction.atomic():
            if coverage is not None:
                self._validate_month_entries(coverage)
            if overridden:
                validated_data["is_amount_overridden"] = True

            instance = super().update(instance, validated_data)
            if coverage is not None:
                sync_user_payment_covered_months(instance, coverage)
                self._reprice_after_coverage_change(instance)
            return instance


class StudentPaymentSubmitSerializer(BaseModelSerializer):
    """Student screenshot upload — no privileged payment fields."""

    class Meta:
        model = models.UserPayment
        fields = (
            "screenshot",
            "transaction_id",
            "parsed_amount",
            "date_on_screenshot",
            "payment_method",
            "ocr_event_id",
        )

    def update(self, instance, validated_data):
        from app_finance.payment_upload_date import stamp_payment_upload_date

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        stamp_payment_upload_date(instance)
        instance.status = models.UserPayment.Status.AWAITING_EXTRACTION
        instance.save()
        return instance


class ReceiverSideScreenshotSerializer(BaseModelSerializer):
    class Meta:
        model = models.ReceiverSideScreenshot
        fields = "__all__"
        expandable_fields = {
            "user_payment": ("app_finance.serializers.UserPaymentSerializer", {"many": False}),
        }


class VerifyScreenshotSerializer(Serializer):
    transaction_id = CharField(max_length=100)
    amount = DecimalField(max_digits=19, decimal_places=2)


class PaymentPlanSerializer(BaseModelSerializer):
    class Meta:
        model = models.PaymentPlan
        fields = "__all__"


class DiscountSerializer(BaseModelSerializer):
    class Meta:
        model = models.Discount
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is not None and not getattr(
            tenant, "is_discount_eligibility_enabled", True
        ):
            # Only reject an explicit non-none in the payload. Stored non-none
            # values are coerced to none on any update (including name-only PATCH).
            if "eligibility_type" in attrs and attrs["eligibility_type"] not in (
                None,
                models.Discount.EligibilityType.NONE,
            ):
                raise ValidationError(
                    {
                        "eligibility_type": (
                            "Discount eligibility is disabled for this organization."
                        )
                    }
                )
            attrs["eligibility_type"] = models.Discount.EligibilityType.NONE
            attrs["early_bird_days"] = None
            attrs["bulk_min_courses"] = None

        if self.instance is None:
            instance = models.Discount()
        else:
            instance = models.Discount()
            for field in self.instance._meta.fields:
                setattr(instance, field.name, getattr(self.instance, field.name))
        for key, value in attrs.items():
            setattr(instance, key, value)
        instance.clean()
        return attrs


class EnrollmentDiscountSerializer(BaseModelSerializer):
    discount_name = CharField(source="discount.name", read_only=True, allow_null=True)

    class Meta:
        model = models.EnrollmentDiscount
        fields = "__all__"


class BillingSerializer(BaseModelSerializer):
    class Meta:
        model = models.Billing
        fields = "__all__"


class PaymentAdjustmentImageSerializer(BaseModelSerializer):
    image_url = SerializerMethodField()

    class Meta:
        model = models.PaymentAdjustmentImage
        fields = ("id", "filename", "image_url", "created_at")

    def get_image_url(self, obj):
        if not obj.image:
            return None
        return obj.image.url


class PaymentAdjustmentSerializer(BaseModelSerializer):
    images = PaymentAdjustmentImageSerializer(many=True, read_only=True)
    created_by_name = SerializerMethodField()

    class Meta:
        model = models.PaymentAdjustment
        fields = (
            "id",
            "kind",
            "amount",
            "occurred_at",
            "note",
            "images",
            "created_by",
            "created_by_name",
            "created_at",
        )
        read_only_fields = ("created_by",)

    def get_created_by_name(self, obj):
        if obj.created_by_id is None:
            return None
        return obj.created_by.name


class StaffPaymentProofSerializer(BaseModelSerializer):
    file_url = SerializerMethodField()

    class Meta:
        model = models.StaffPaymentProof
        fields = ("id", "filename", "file_url", "created_at")

    def get_file_url(self, obj):
        if not obj.file:
            return None
        return obj.file.url


class StaffPaymentSerializer(BaseModelSerializer):
    proofs = StaffPaymentProofSerializer(many=True, read_only=True)

    class Meta:
        model = models.StaffPayment
        fields = "__all__"
        extra_kwargs = {
            "payment_info": {"required": False},
            "screenshot": {"required": False, "allow_null": True},
            "confirmed_at": {"read_only": True},
        }
        expandable_fields = {
            "user": ("app_auth.serializers.UserSerializer", {"many": False}),
            "payment_info": ("app_finance.serializers.PaymentInfoSerializer", {"many": False}),
            "created_by": ("app_auth.serializers.UserSerializer", {"many": False}),
        }

    def validate_user(self, user):
        if user.is_student():
            raise ValidationError(
                {"user": "Staff payments cannot be assigned to student-only users."}
            )
        return user

    def validate(self, attrs):
        user = attrs.get("user")
        if user is None and self.instance is not None:
            user = self.instance.user
        payment_info = attrs.get("payment_info")

        if self.instance is None:
            proof_files = self.context.get("proof_files") or []
            if not attrs.get("screenshot") and not proof_files:
                raise ValidationError({"proof": "At least one proof file is required."})
            if user is None:
                raise ValidationError({"user": "This field is required."})
            pay_period_year = attrs.get("pay_period_year")
            pay_period_month = attrs.get("pay_period_month")
            if pay_period_year is None:
                raise ValidationError({"pay_period_year": "This field is required."})
            if pay_period_month is None:
                raise ValidationError({"pay_period_month": "This field is required."})
            if pay_period_month < 1 or pay_period_month > 12:
                raise ValidationError(
                    {"pay_period_month": "Month must be between 1 and 12."}
                )
            user_id = int(getattr(user, "id", user))
            if models.StaffPayment.objects.filter(
                user_id=user_id,
                pay_period_year=pay_period_year,
                pay_period_month=pay_period_month,
            ).exists():
                raise ValidationError(
                    {
                        "pay_period_month": (
                            "A staff payment already exists for this pay period."
                        )
                    }
                )
            if payment_info is None:
                payment_info = get_default_payment_info_for_user(user_id)
                if payment_info is None:
                    raise ValidationError(
                        {
                            "user": (
                                "This staff member has no default payout account. "
                                "Add one under Payment Info first."
                            )
                        }
                    )
                attrs["payment_info"] = payment_info
            else:
                if int(payment_info.user_id) != user_id:
                    raise ValidationError(
                        {"payment_info": "Must belong to the selected staff member."}
                    )
                if not payment_info.is_default:
                    raise ValidationError(
                        {
                            "payment_info": (
                                "Must be the staff member's default payout account."
                            )
                        }
                    )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        actor = acting_user(request) if request is not None else None
        if actor is not None:
            validated_data["created_by"] = actor

        proof_files = self.context.get("proof_files") or []
        if proof_files and not validated_data.get("screenshot"):
            from app_finance.staff_payment_proofs import first_image_proof_file

            first_image = first_image_proof_file(proof_files)
            if first_image is not None:
                validated_data["screenshot"] = first_image

        instance = super().create(validated_data)

        if proof_files:
            for uploaded in proof_files:
                models.StaffPaymentProof.objects.create(
                    staff_payment=instance,
                    file=uploaded,
                    filename=uploaded.name or "unnamed",
                )

        return instance
