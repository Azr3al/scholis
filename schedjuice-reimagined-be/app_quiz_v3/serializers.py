import json
import uuid as uuid_stdlib

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import serializers

from app_auth.models import User
from app_quiz_v3.rich_content import (
    hydrate_question_payload_for_quiz,
    list_quiz_fill_blank_uuids_in_order,
    tiptap_doc_plaintext,
)
from app_quiz_v3.models import (
    AttemptAnswer,
    EssayComment,
    Question,
    QuestionFillBlankAcceptableAnswer,
    QuestionFillBlankChoiceOption,
    QuestionFillBlankSlot,
    QuestionOption,
    QuestionShortAnswerAcceptableAnswer,
    Quiz,
    QuizAttempt,
    QuizCategory,
    QuizResult,
)
from utilitas.serializers import BaseModelSerializer


def _coerce_tiptap_json_value(val):
    """
    JSONField must receive dict/list. Accept JSON strings; unwrap accidental outer quotes
    (e.g. a Python repr-style '\"{...}\"' or ''{...}'') that PostgreSQL json rejects.
    """
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return {"type": "doc", "content": []}
        # Peel repeated '...' / "..." wrappers (double- or triple-encoded bodies).
        for _ in range(6):
            if len(s) >= 2 and s[0] in "'\"" and s[-1] == s[0]:
                inner = s[1:-1].strip()
                if inner.startswith("{") or inner.startswith("["):
                    s = inner
                    continue
                break
            if s.startswith("'") and ("{" in s or "[" in s):
                idx_brace = s.find("{")
                idx_bracket = s.find("[")
                candidates = [i for i in (idx_brace, idx_bracket) if i >= 0]
                if candidates:
                    idx = min(candidates)
                    s = s[idx:].strip()
                    continue
            break
        try:
            return json.loads(s)
        except json.JSONDecodeError as exc:
            raise serializers.ValidationError(
                "Invalid JSON for intro/outro body (must be a TipTap document object or JSON text)."
            ) from exc
    raise serializers.ValidationError("intro_body and outro_body must be JSON objects or JSON strings.")


def _related_nonempty_from_instance(instance, related_name: str) -> bool:
    """True if the reverse FK has rows, using prefetch cache when present (avoids per-row .exists() queries)."""
    cache = getattr(instance, "_prefetched_objects_cache", None)
    if cache is not None and related_name in cache:
        return len(cache[related_name]) > 0
    return getattr(instance, related_name).exists()


def _normalize_option_body(body):
    """Coerce client payload to TipTap JSON (dict) for QuestionOption.body."""
    if body is None:
        return {"type": "doc", "content": []}
    if isinstance(body, dict):
        return body
    if isinstance(body, str):
        t = body.strip()
        if t.startswith("{"):
            try:
                return json.loads(t)
            except json.JSONDecodeError:
                pass
        return {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": body}],
                }
            ],
        }
    return {"type": "doc", "content": []}


class QuizCategorySerializer(BaseModelSerializer):
    class Meta:
        model = QuizCategory
        fields = "__all__"


class QuestionOptionSerializer(BaseModelSerializer):
    body_plaintext = serializers.SerializerMethodField()

    class Meta:
        model = QuestionOption
        fields = "__all__"
        extra_kwargs = {"question": {"required": False}}

    def get_body_plaintext(self, obj: QuestionOption) -> str:
        return tiptap_doc_plaintext(obj.body)

    def to_internal_value(self, data):
        if isinstance(data, dict) and "body" in data:
            data = {**data, "body": _normalize_option_body(data.get("body"))}
        return super().to_internal_value(data)

    def validate(self, data):
        body = data.get("body")
        if body is None and self.instance is not None:
            body = self.instance.body
        plain = tiptap_doc_plaintext(_normalize_option_body(body))
        if not plain:
            raise serializers.ValidationError(
                {
                    "body_plaintext": (
                        "Each choice needs visible text"
                    )
                }
            )
        return data


class TakerQuestionOptionSerializer(BaseModelSerializer):
    """Excludes is_correct for quiz takers."""

    body_plaintext = serializers.SerializerMethodField()

    class Meta:
        model = QuestionOption
        exclude = ("is_correct",)

    def get_body_plaintext(self, obj: QuestionOption) -> str:
        return tiptap_doc_plaintext(obj.body)


class QuestionFillBlankAcceptableAnswerSerializer(BaseModelSerializer):
    class Meta:
        model = QuestionFillBlankAcceptableAnswer
        fields = ["id", "body", "display_order"]
        extra_kwargs = {"slot": {"required": False}}

    def to_internal_value(self, data):
        if isinstance(data, dict) and "body" in data:
            data = {**data, "body": _normalize_option_body(data.get("body"))}
        return super().to_internal_value(data)


class QuestionFillBlankChoiceOptionSerializer(BaseModelSerializer):
    class Meta:
        model = QuestionFillBlankChoiceOption
        fields = ["id", "text", "is_correct", "display_order"]
        extra_kwargs = {"slot": {"required": False}}


class QuestionShortAnswerAcceptableAnswerSerializer(BaseModelSerializer):
    class Meta:
        model = QuestionShortAnswerAcceptableAnswer
        fields = ["id", "body", "display_order"]
        extra_kwargs = {"question": {"required": False}}

    def to_internal_value(self, data):
        if isinstance(data, dict) and "body" in data and data["body"] is not None:
            data = {**data, "body": str(data["body"]).strip()}
        return super().to_internal_value(data)


class QuestionFillBlankSlotSerializer(BaseModelSerializer):
    acceptable_answers = QuestionFillBlankAcceptableAnswerSerializer(
        many=True, required=False, allow_empty=True
    )
    choice_options = QuestionFillBlankChoiceOptionSerializer(
        many=True, required=False, allow_empty=True
    )
    typed_updated_at = serializers.DateTimeField(write_only=True, required=False, allow_null=True)
    single_choice_updated_at = serializers.DateTimeField(
        write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = QuestionFillBlankSlot
        fields = [
            "id",
            "blank_uuid",
            "points",
            "display_order",
            "answer_mode",
            "typed_config_at",
            "single_choice_config_at",
            "acceptable_answers",
            "choice_options",
            "typed_updated_at",
            "single_choice_updated_at",
        ]
        extra_kwargs = {"question": {"required": False}}


def _normalize_fill_blank_slot_typed_vs_choice(slot: dict, slot_index: int) -> None:
    """When both typed and single-choice data are present, keep the branch with the latest touch."""
    aa = list(slot.get("acceptable_answers") or [])
    co = list(slot.get("choice_options") or [])
    t_touch = slot.get("typed_updated_at")
    sc_touch = slot.get("single_choice_updated_at")
    has_typed = len(aa) > 0
    has_choice = len(co) > 0

    if has_typed and has_choice:
        if t_touch is None or sc_touch is None:
            raise serializers.ValidationError(
                {
                    "fill_blank_slots": (
                        f"Blank {slot_index + 1}: send typed_updated_at and "
                        "single_choice_updated_at when both acceptable_answers and "
                        "choice_options are present."
                    )
                }
            )
        if t_touch > sc_touch:
            winning = QuestionFillBlankSlot.AnswerMode.TYPED
        elif sc_touch > t_touch:
            winning = QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE
        else:
            am = slot.get("answer_mode")
            if am == QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE:
                winning = QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE
            elif am == QuestionFillBlankSlot.AnswerMode.TYPED:
                winning = QuestionFillBlankSlot.AnswerMode.TYPED
            else:
                raise serializers.ValidationError(
                    {
                        "fill_blank_slots": (
                            f"Blank {slot_index + 1}: equal typed_updated_at and "
                            "single_choice_updated_at — set answer_mode to break the tie."
                        )
                    }
                )
        if winning == QuestionFillBlankSlot.AnswerMode.TYPED:
            slot["answer_mode"] = winning
            slot["choice_options"] = []
            slot["_typed_touch"] = t_touch
            slot["_choice_touch"] = None
        else:
            slot["answer_mode"] = winning
            slot["acceptable_answers"] = []
            slot["_choice_touch"] = sc_touch
            slot["_typed_touch"] = None
    elif has_typed:
        slot["answer_mode"] = QuestionFillBlankSlot.AnswerMode.TYPED
        slot["choice_options"] = []
        slot["_typed_touch"] = t_touch if t_touch is not None else timezone.now()
        slot["_choice_touch"] = None
    elif has_choice:
        slot["answer_mode"] = QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE
        slot["acceptable_answers"] = []
        slot["_choice_touch"] = sc_touch if sc_touch is not None else timezone.now()
        slot["_typed_touch"] = None
    else:
        raise serializers.ValidationError(
            {"fill_blank_slots": f"Blank {slot_index + 1}: add acceptable answers or choice options."}
        )


def _blank_uuid_key(value) -> str:
    if value is None:
        return ""
    if isinstance(value, uuid_stdlib.UUID):
        return str(value).lower()
    return str(value).strip().lower()


def _bulk_update_fill_blank_slots_for_question(
    question: Question,
    bulk_update_slots: list[QuestionFillBlankSlot],
    bulk_create_slots: list[QuestionFillBlankSlot],
) -> None:
    """
    Persist fill-blank slot row updates. Reassigning blank_uuid across existing rows in one
    UPDATE can violate uniq(question, blank_uuid); stage through temporary UUIDs when needed.
    """
    if not bulk_update_slots:
        return
    targets = {obj.id: obj.blank_uuid for obj in bulk_update_slots}
    db_by_id = dict(
        QuestionFillBlankSlot.objects.filter(id__in=list(targets.keys())).values_list(
            "id", "blank_uuid"
        )
    )
    slot_fields = [
        "blank_uuid",
        "points",
        "display_order",
        "answer_mode",
        "typed_config_at",
        "single_choice_config_at",
        "updated_at",
    ]

    def _uuid_changed(sid: int) -> bool:
        return _blank_uuid_key(db_by_id.get(sid)) != _blank_uuid_key(targets[sid])

    if not any(_uuid_changed(obj.id) for obj in bulk_update_slots):
        QuestionFillBlankSlot.objects.bulk_update(bulk_update_slots, slot_fields)
        return

    occupied: set[str] = {
        _blank_uuid_key(u)
        for u in QuestionFillBlankSlot.objects.filter(question=question).values_list(
            "blank_uuid", flat=True
        )
    }
    for ns in bulk_create_slots:
        occupied.add(_blank_uuid_key(ns.blank_uuid))
    for tgt in targets.values():
        occupied.add(_blank_uuid_key(tgt))

    staging: list[QuestionFillBlankSlot] = []
    for obj in bulk_update_slots:
        if not _uuid_changed(obj.id):
            continue
        while True:
            temp = uuid_stdlib.uuid4()
            key = _blank_uuid_key(temp)
            if key not in occupied:
                occupied.add(key)
                break
        obj.blank_uuid = temp
        staging.append(obj)

    if staging:
        QuestionFillBlankSlot.objects.bulk_update(staging, ["blank_uuid"])

    for obj in bulk_update_slots:
        obj.blank_uuid = targets[obj.id]

    QuestionFillBlankSlot.objects.bulk_update(bulk_update_slots, slot_fields)


class QuestionSerializer(BaseModelSerializer):
    options = QuestionOptionSerializer(many=True)
    fill_blank_slots = QuestionFillBlankSlotSerializer(many=True, required=False)
    short_answer_acceptables = QuestionShortAnswerAcceptableAnswerSerializer(
        many=True,
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = Question
        fields = "__all__"
        extra_kwargs = {"quiz": {"required": False}}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.question_type == Question.QuestionType.FILL_IN_BLANK:
            _cache = getattr(instance, "_prefetched_objects_cache", None)
            _has_fb = _cache is not None and "fill_blank_slots" in _cache
            fib_slot_qs = QuestionFillBlankSlot.objects.order_by("display_order", "id").prefetch_related(
                Prefetch(
                    "acceptable_answers",
                    queryset=QuestionFillBlankAcceptableAnswer.objects.order_by(
                        "display_order", "id"
                    ),
                ),
                Prefetch(
                    "choice_options",
                    queryset=QuestionFillBlankChoiceOption.objects.order_by("display_order", "id"),
                ),
            )
            if _has_fb:
                q = instance
            else:
                q = (
                    Question.objects.filter(pk=instance.pk)
                    .prefetch_related(Prefetch("fill_blank_slots", queryset=fib_slot_qs))
                    .first()
                )
                if not q:
                    q = instance
            data["options"] = []
            data["fill_blank_slots"] = QuestionFillBlankSlotSerializer(
                q.fill_blank_slots.all(), many=True
            ).data
            data["short_answer_acceptables"] = []
        elif instance.question_type == Question.QuestionType.SHORT_ANSWER:
            data["options"] = []
            data["fill_blank_slots"] = []
            _cache = getattr(instance, "_prefetched_objects_cache", None)
            if _cache is not None and "short_answer_acceptables" in _cache:
                sa_qs = instance.short_answer_acceptables.all()
            else:
                sa_qs = QuestionShortAnswerAcceptableAnswer.objects.filter(
                    question=instance
                ).order_by("display_order", "id")
            data["short_answer_acceptables"] = QuestionShortAnswerAcceptableAnswerSerializer(
                sa_qs, many=True
            ).data
        else:
            data["fill_blank_slots"] = []
            data["short_answer_acceptables"] = []
        return hydrate_question_payload_for_quiz(
            instance.quiz,
            data,
            attachment_url_map=self.context.get("attachment_url_map"),
        )

    def validate(self, data):
        qt = data.get("question_type")
        if qt is None and self.instance:
            qt = self.instance.question_type
        body = data.get("body")
        if body is None and self.instance is not None:
            body = self.instance.body

        if qt == Question.QuestionType.SINGLE_CHOICE:
            data["is_partial_scoring_enabled"] = False
        if qt == Question.QuestionType.FILL_IN_BLANK:
            data["is_partial_scoring_enabled"] = False
            doc_uuids = list_quiz_fill_blank_uuids_in_order(body)
            if len(doc_uuids) < 1:
                raise serializers.ValidationError(
                    {"body": "Fill-in-the-blank questions must include at least one blank in the prompt."}
                )
            if len(set(doc_uuids)) != len(doc_uuids):
                raise serializers.ValidationError(
                    {"body": "Each blank in the prompt must have a unique id."}
                )
            slots_in = data.get("fill_blank_slots")
            if slots_in is None and self.instance is not None:
                slots_qs = (
                    QuestionFillBlankSlot.objects.filter(question=self.instance)
                    .order_by("display_order", "id")
                    .prefetch_related(
                        Prefetch(
                            "acceptable_answers",
                            queryset=QuestionFillBlankAcceptableAnswer.objects.order_by(
                                "display_order", "id"
                            ),
                        ),
                        Prefetch(
                            "choice_options",
                            queryset=QuestionFillBlankChoiceOption.objects.order_by(
                                "display_order", "id"
                            ),
                        ),
                    )
                )
                slots_in = QuestionFillBlankSlotSerializer(slots_qs, many=True).data
            if not slots_in:
                raise serializers.ValidationError(
                    {"fill_blank_slots": "At least one blank slot is required."}
                )
            for i, s in enumerate(slots_in):
                _normalize_fill_blank_slot_typed_vs_choice(s, i)
            slot_uuids = {str(s.get("blank_uuid", "")) for s in slots_in}
            if slot_uuids != set(doc_uuids):
                raise serializers.ValidationError(
                    {
                        "fill_blank_slots": "Slot ids must match the blanks in the prompt (same set of UUIDs)."
                    }
                )
            total = sum(int(s.get("points") or 0) for s in slots_in)
            pts = int(data.get("points") or (self.instance.points if self.instance else 0))
            if total != pts:
                raise serializers.ValidationError(
                    {
                        "points": f"Question points ({pts}) must equal the sum of blank points ({total})."
                    }
                )
            for i, s in enumerate(slots_in):
                mode = s.get("answer_mode")
                if mode == QuestionFillBlankSlot.AnswerMode.TYPED:
                    for j, ans in enumerate(s.get("acceptable_answers") or []):
                        plain = tiptap_doc_plaintext(_normalize_option_body(ans.get("body")))
                        if not plain:
                            raise serializers.ValidationError(
                                {
                                    "fill_blank_slots": (
                                        f"Blank {i + 1}, acceptable answer {j + 1} cannot be empty."
                                    )
                                }
                            )
                elif mode == QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE:
                    opts = s.get("choice_options") or []
                    if len(opts) < 1:
                        raise serializers.ValidationError(
                            {"fill_blank_slots": f"Blank {i + 1}: at least one choice option is required."}
                        )
                    correct_n = sum(1 for o in opts if o.get("is_correct"))
                    if correct_n != 1:
                        raise serializers.ValidationError(
                            {
                                "fill_blank_slots": (
                                    f"Blank {i + 1}: exactly one choice must be marked correct."
                                )
                            }
                        )
                    for j, opt in enumerate(opts):
                        txt = (opt.get("text") or "").strip()
                        if not txt:
                            raise serializers.ValidationError(
                                {
                                    "fill_blank_slots": (
                                        f"Blank {i + 1}, choice {j + 1} text cannot be empty."
                                    )
                                }
                            )

        options = data.get("options")
        sa_in = data.get("short_answer_acceptables")
        slots_check = data.get("fill_blank_slots")

        if qt == Question.QuestionType.FILL_IN_BLANK:
            if options is not None and len(options) > 0:
                raise serializers.ValidationError(
                    {"options": "Fill-in-the-blank questions use fill_blank_slots, not options."}
                )
            if sa_in and len(sa_in) > 0:
                raise serializers.ValidationError(
                    {
                        "short_answer_acceptables": (
                            "Fill-in-the-blank questions do not use short answer acceptables."
                        )
                    }
                )
            return data

        if qt == Question.QuestionType.TRUE_FALSE:
            if options is not None and len(options) > 0:
                raise serializers.ValidationError(
                    {"options": "True/false questions do not use options."}
                )
            if sa_in and len(sa_in) > 0:
                raise serializers.ValidationError(
                    {"short_answer_acceptables": "Not used for true/false questions."}
                )
            if slots_check and len(slots_check) > 0:
                raise serializers.ValidationError(
                    {"fill_blank_slots": "Not used for true/false questions."}
                )
            ct = data.get("correct_true")
            if ct is None and self.instance is not None:
                ct = self.instance.correct_true
            if ct is None:
                raise serializers.ValidationError(
                    {"correct_true": "Mark which value (true or false) is graded as correct."}
                )
            return data

        if qt == Question.QuestionType.SHORT_ANSWER:
            if options is not None and len(options) > 0:
                raise serializers.ValidationError(
                    {"options": "Short answer questions do not use options."}
                )
            if slots_check and len(slots_check) > 0:
                raise serializers.ValidationError(
                    {"fill_blank_slots": "Not used for short answer questions."}
                )
            rows = sa_in
            if rows is None and self.instance is not None:
                rows = QuestionShortAnswerAcceptableAnswerSerializer(
                    QuestionShortAnswerAcceptableAnswer.objects.filter(
                        question=self.instance
                    ).order_by("display_order", "id"),
                    many=True,
                ).data
            if not rows or len(rows) < 1:
                raise serializers.ValidationError(
                    {"short_answer_acceptables": "Add at least one acceptable answer."}
                )
            for j, row in enumerate(rows):
                body = str(row.get("body") or "").strip()
                if not body:
                    raise serializers.ValidationError(
                        {"short_answer_acceptables": f"Acceptable answer {j + 1} cannot be empty."}
                    )
            return data

        if qt == Question.QuestionType.ESSAY:
            if options is not None and len(options) > 0:
                raise serializers.ValidationError(
                    {"options": "Essay questions do not use options."}
                )
            if sa_in and len(sa_in) > 0:
                raise serializers.ValidationError(
                    {"short_answer_acceptables": "Not used for essay questions."}
                )
            if slots_check and len(slots_check) > 0:
                raise serializers.ValidationError(
                    {"fill_blank_slots": "Not used for essay questions."}
                )
            pts = data.get("points")
            if pts is None and self.instance is not None:
                pts = self.instance.points
            if pts is None:
                pts = 1
            if int(pts) < 1:
                raise serializers.ValidationError(
                    {"points": "Essay questions need at least 1 point."}
                )
            return data

        if qt in (
            Question.QuestionType.SINGLE_CHOICE,
            Question.QuestionType.MULTIPLE_CHOICE,
        ):
            if sa_in and len(sa_in) > 0:
                raise serializers.ValidationError(
                    {"short_answer_acceptables": "Not used for multiple-choice questions."}
                )
            if slots_check and len(slots_check) > 0:
                raise serializers.ValidationError(
                    {
                        "fill_blank_slots": (
                            "Multiple-choice questions use options, not fill_blank_slots."
                        )
                    }
                )
            opts_in = options
            if opts_in is None and self.instance is not None:
                opts_in = QuestionOptionSerializer(
                    self.instance.options.all().order_by("display_order", "id"),
                    many=True,
                ).data
            if not opts_in or len(opts_in) < 2:
                raise serializers.ValidationError(
                    {"options": "At least two options are required."}
                )
            for j, opt in enumerate(opts_in):
                plain = tiptap_doc_plaintext(_normalize_option_body(opt.get("body")))
                if not plain:
                    raise serializers.ValidationError(
                        {
                            "options": (
                                f"Option {j + 1} needs non-empty body_plaintext "
                                "(visible text in the rich editor)."
                            )
                        }
                    )
            correct_n = sum(1 for o in opts_in if o.get("is_correct"))
            if qt == Question.QuestionType.SINGLE_CHOICE and correct_n != 1:
                raise serializers.ValidationError(
                    {"options": "Single choice questions must have exactly one correct option."}
                )
            if qt == Question.QuestionType.MULTIPLE_CHOICE and correct_n < 1:
                raise serializers.ValidationError(
                    {"options": "Multiple choice questions need at least one correct option."}
                )
            return data

        raise serializers.ValidationError({"question_type": "Unsupported question type."})

    def _bulk_create_options_only(self, question: Question, options_data: list) -> None:
        if not options_data:
            return
        QuestionOption.objects.bulk_create(
            [
                QuestionOption(
                    question=question,
                    body=_normalize_option_body(opt.get("body")),
                    is_correct=bool(opt.get("is_correct", False)),
                    display_order=int(opt.get("display_order", idx)),
                )
                for idx, opt in enumerate(options_data)
            ]
        )

    def _sync_options(self, question: Question, options_data: list) -> None:
        if len(options_data) < 1:
            raise serializers.ValidationError({"options": "At least one option is required."})

        _cache = getattr(question, "_prefetched_objects_cache", None)
        if _cache is not None and "options" in _cache:
            existing_map = {o.id: o for o in _cache["options"]}
        else:
            existing_map = {
                o.id: o
                for o in QuestionOption.objects.filter(question=question).order_by(
                    "display_order", "id"
                )
            }
        payload_ids_seen: set[int] = set()
        bulk_update_objs: list[QuestionOption] = []
        bulk_create_objs: list[QuestionOption] = []

        for idx, opt in enumerate(options_data):
            body = _normalize_option_body(opt.get("body"))
            is_correct = bool(opt.get("is_correct", False))
            display_order = int(opt.get("display_order", idx))
            raw_id = opt.get("id")

            if raw_id is not None:
                try:
                    oid = int(raw_id)
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError(
                        {"options": f"Invalid option id: {raw_id!r}."}
                    ) from exc
                if oid in payload_ids_seen:
                    raise serializers.ValidationError(
                        {"options": "Duplicate option id in payload."}
                    )
                payload_ids_seen.add(oid)

                obj = existing_map.get(oid)
                if obj is None:
                    rogue = QuestionOption.objects.filter(pk=oid).first()
                    if rogue is not None:
                        raise serializers.ValidationError(
                            {"options": f"Option {oid} belongs to another question."}
                        )
                    raise serializers.ValidationError(
                        {"options": f"Unknown option id: {oid}."}
                    )
                obj.body = body
                obj.is_correct = is_correct
                obj.display_order = display_order
                bulk_update_objs.append(obj)
            else:
                bulk_create_objs.append(
                    QuestionOption(
                        question=question,
                        body=body,
                        is_correct=is_correct,
                        display_order=display_order,
                    )
                )

        to_remove = [pk for pk in existing_map if pk not in payload_ids_seen]
        if to_remove:
            QuestionOption.objects.filter(question=question, id__in=to_remove).delete()
        if bulk_update_objs:
            QuestionOption.objects.bulk_update(
                bulk_update_objs, ["body", "is_correct", "display_order"]
            )
        if bulk_create_objs:
            QuestionOption.objects.bulk_create(bulk_create_objs)

    def _sync_short_answer_acceptables(self, question: Question, rows: list) -> None:
        if len(rows) < 1:
            raise serializers.ValidationError(
                {"short_answer_acceptables": "At least one acceptable answer is required."}
            )
        _cache = getattr(question, "_prefetched_objects_cache", None)
        if _cache is not None and "short_answer_acceptables" in _cache:
            existing_rows = question.short_answer_acceptables.all().order_by(
                "display_order", "id"
            )
        else:
            existing_rows = QuestionShortAnswerAcceptableAnswer.objects.filter(
                question=question
            ).order_by("display_order", "id")
        existing_map = {o.id: o for o in existing_rows}
        payload_ids_seen: set[int] = set()
        bulk_update_objs: list[QuestionShortAnswerAcceptableAnswer] = []
        bulk_create_objs: list[QuestionShortAnswerAcceptableAnswer] = []

        for idx, row in enumerate(rows):
            body = str(row.get("body") or "").strip()
            if not body:
                raise serializers.ValidationError(
                    {"short_answer_acceptables": f"Acceptable answer {idx + 1} cannot be empty."}
                )
            display_order = int(row.get("display_order", idx))
            raw_id = row.get("id")
            if raw_id is not None:
                try:
                    aid = int(raw_id)
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError(
                        {"short_answer_acceptables": f"Invalid acceptable answer id: {raw_id!r}."}
                    ) from exc
                if aid in payload_ids_seen:
                    raise serializers.ValidationError(
                        {"short_answer_acceptables": "Duplicate acceptable answer id in payload."}
                    )
                payload_ids_seen.add(aid)
                obj = existing_map.get(aid)
                if obj is None:
                    raise serializers.ValidationError(
                        {"short_answer_acceptables": f"Unknown acceptable answer id: {aid}."}
                    )
                obj.body = body
                obj.display_order = display_order
                bulk_update_objs.append(obj)
            else:
                bulk_create_objs.append(
                    QuestionShortAnswerAcceptableAnswer(
                        question=question,
                        body=body,
                        display_order=display_order,
                    )
                )

        to_remove = [pk for pk in existing_map if pk not in payload_ids_seen]
        if to_remove:
            QuestionShortAnswerAcceptableAnswer.objects.filter(
                question=question, id__in=to_remove
            ).delete()
        if bulk_update_objs:
            QuestionShortAnswerAcceptableAnswer.objects.bulk_update(
                bulk_update_objs, ["body", "display_order", "updated_at"]
            )
        if bulk_create_objs:
            QuestionShortAnswerAcceptableAnswer.objects.bulk_create(bulk_create_objs)

    def _sync_slot_acceptable_answers(
        self,
        slot: QuestionFillBlankSlot,
        answers_data: list,
        existing_map: dict[int, QuestionFillBlankAcceptableAnswer],
    ) -> None:
        payload_ids_seen: set[int] = set()
        bulk_update_objs: list[QuestionFillBlankAcceptableAnswer] = []
        bulk_create_objs: list[QuestionFillBlankAcceptableAnswer] = []

        for j, row in enumerate(answers_data):
            body = _normalize_option_body(row.get("body"))
            display_order = int(row.get("display_order", j))
            raw_id = row.get("id")
            if raw_id is not None:
                try:
                    aid = int(raw_id)
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": f"Invalid acceptable answer id: {raw_id!r}."}
                    ) from exc
                if aid in payload_ids_seen:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": "Duplicate acceptable answer id in payload."}
                    )
                payload_ids_seen.add(aid)
                obj = existing_map.get(aid)
                if obj is None:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": f"Unknown acceptable answer id: {aid}."}
                    )
                obj.body = body
                obj.display_order = display_order
                bulk_update_objs.append(obj)
            else:
                bulk_create_objs.append(
                    QuestionFillBlankAcceptableAnswer(
                        slot=slot,
                        body=body,
                        display_order=display_order,
                    )
                )

        to_remove = [pk for pk in existing_map if pk not in payload_ids_seen]
        if to_remove:
            QuestionFillBlankAcceptableAnswer.objects.filter(
                slot=slot, id__in=to_remove
            ).delete()
        if bulk_update_objs:
            QuestionFillBlankAcceptableAnswer.objects.bulk_update(
                bulk_update_objs, ["body", "display_order", "updated_at"]
            )
        if bulk_create_objs:
            QuestionFillBlankAcceptableAnswer.objects.bulk_create(bulk_create_objs)

    def _sync_slot_choice_options(
        self,
        slot: QuestionFillBlankSlot,
        options_data: list,
        existing_map: dict[int, QuestionFillBlankChoiceOption],
    ) -> None:
        payload_ids_seen: set[int] = set()
        bulk_update_objs: list[QuestionFillBlankChoiceOption] = []
        bulk_create_objs: list[QuestionFillBlankChoiceOption] = []

        for j, row in enumerate(options_data):
            text = (row.get("text") or "").strip()
            is_correct = bool(row.get("is_correct", False))
            display_order = int(row.get("display_order", j))
            raw_id = row.get("id")
            if raw_id is not None:
                try:
                    oid = int(raw_id)
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": f"Invalid choice option id: {raw_id!r}."}
                    ) from exc
                if oid in payload_ids_seen:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": "Duplicate choice option id in payload."}
                    )
                payload_ids_seen.add(oid)
                obj = existing_map.get(oid)
                if obj is None:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": f"Unknown choice option id: {oid}."}
                    )
                obj.text = text
                obj.is_correct = is_correct
                obj.display_order = display_order
                bulk_update_objs.append(obj)
            else:
                bulk_create_objs.append(
                    QuestionFillBlankChoiceOption(
                        slot=slot,
                        text=text,
                        is_correct=is_correct,
                        display_order=display_order,
                    )
                )

        to_remove = [pk for pk in existing_map if pk not in payload_ids_seen]
        if to_remove:
            QuestionFillBlankChoiceOption.objects.filter(slot=slot, id__in=to_remove).delete()
        if bulk_update_objs:
            QuestionFillBlankChoiceOption.objects.bulk_update(
                bulk_update_objs, ["text", "is_correct", "display_order", "updated_at"]
            )
        if bulk_create_objs:
            QuestionFillBlankChoiceOption.objects.bulk_create(bulk_create_objs)

    def _sync_fill_blank_slots(self, question: Question, slots_data: list) -> None:
        if not slots_data:
            raise serializers.ValidationError({"fill_blank_slots": "At least one slot required."})

        _cache = getattr(question, "_prefetched_objects_cache", None)
        if _cache is not None and "fill_blank_slots" in _cache:
            existing_map = {s.id: s for s in _cache["fill_blank_slots"]}
        else:
            slot_qs = (
                QuestionFillBlankSlot.objects.filter(question=question)
                .order_by("display_order", "id")
                .prefetch_related(
                    Prefetch(
                        "acceptable_answers",
                        queryset=QuestionFillBlankAcceptableAnswer.objects.order_by(
                            "display_order", "id"
                        ),
                    ),
                    Prefetch(
                        "choice_options",
                        queryset=QuestionFillBlankChoiceOption.objects.order_by(
                            "display_order", "id"
                        ),
                    ),
                )
            )
            existing_map = {s.id: s for s in slot_qs}
        payload_slot_ids_seen: set[int] = set()
        bulk_update_slots: list[QuestionFillBlankSlot] = []
        bulk_create_slots: list[QuestionFillBlankSlot] = []
        pending_new_slots: list[tuple[QuestionFillBlankSlot, list, list, str]] = []

        for idx, row in enumerate(slots_data):
            row = dict(row)
            persist_typed_ts = row.pop("_typed_touch", None)
            persist_choice_ts = row.pop("_choice_touch", None)

            bu = str(row.get("blank_uuid") or "").strip()
            if not bu:
                raise serializers.ValidationError(
                    {"fill_blank_slots": f"Slot {idx + 1} is missing blank_uuid."}
                )
            try:
                uuid_stdlib.UUID(bu)
            except ValueError as exc:
                raise serializers.ValidationError(
                    {"fill_blank_slots": f"Invalid blank_uuid: {bu!r}."}
                ) from exc
            pts = int(row.get("points") or 1)
            display_order = int(row.get("display_order", idx))
            am = row.get("answer_mode") or QuestionFillBlankSlot.AnswerMode.TYPED
            answers = row.get("acceptable_answers") or []
            choices = row.get("choice_options") or []
            raw_id = row.get("id")

            now = timezone.now()
            if am == QuestionFillBlankSlot.AnswerMode.TYPED:
                typed_at = persist_typed_ts or now
                choice_at = None
            else:
                typed_at = None
                choice_at = persist_choice_ts or now

            if raw_id is not None:
                try:
                    sid = int(raw_id)
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": f"Invalid slot id: {raw_id!r}."}
                    ) from exc
                if sid in payload_slot_ids_seen:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": "Duplicate slot id in payload."}
                    )
                payload_slot_ids_seen.add(sid)
                obj = existing_map.get(sid)
                if obj is None:
                    raise serializers.ValidationError(
                        {"fill_blank_slots": f"Unknown slot id: {sid}."}
                    )
                obj.blank_uuid = bu
                obj.points = pts
                obj.display_order = display_order
                obj.answer_mode = am
                if am == QuestionFillBlankSlot.AnswerMode.TYPED:
                    obj.typed_config_at = typed_at
                else:
                    obj.single_choice_config_at = choice_at
                bulk_update_slots.append(obj)
                if am == QuestionFillBlankSlot.AnswerMode.TYPED:
                    ans_existing = {a.id: a for a in obj.acceptable_answers.all()}
                    self._sync_slot_acceptable_answers(obj, answers, ans_existing)
                    co_existing = {c.id: c for c in obj.choice_options.all()}
                    self._sync_slot_choice_options(obj, [], co_existing)
                else:
                    ans_existing = {a.id: a for a in obj.acceptable_answers.all()}
                    self._sync_slot_acceptable_answers(obj, [], ans_existing)
                    co_existing = {c.id: c for c in obj.choice_options.all()}
                    self._sync_slot_choice_options(obj, choices, co_existing)
            else:
                ns = QuestionFillBlankSlot(
                    question=question,
                    blank_uuid=bu,
                    points=pts,
                    display_order=display_order,
                    answer_mode=am,
                    typed_config_at=typed_at if am == QuestionFillBlankSlot.AnswerMode.TYPED else None,
                    single_choice_config_at=(
                        choice_at
                        if am == QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE
                        else None
                    ),
                )
                bulk_create_slots.append(ns)
                pending_new_slots.append((ns, answers, choices, am))

        to_remove_slots = [pk for pk in existing_map if pk not in payload_slot_ids_seen]
        if to_remove_slots:
            QuestionFillBlankSlot.objects.filter(
                question=question, id__in=to_remove_slots
            ).delete()

        if bulk_update_slots:
            _bulk_update_fill_blank_slots_for_question(
                question, bulk_update_slots, bulk_create_slots
            )

        if bulk_create_slots:
            QuestionFillBlankSlot.objects.bulk_create(bulk_create_slots)
            for slot, answers, choices, am in pending_new_slots:
                if am == QuestionFillBlankSlot.AnswerMode.TYPED:
                    self._sync_slot_acceptable_answers(slot, answers, {})
                    self._sync_slot_choice_options(slot, [], {})
                else:
                    self._sync_slot_acceptable_answers(slot, [], {})
                    self._sync_slot_choice_options(slot, choices, {})

    def create(self, validated_data):
        options_data = validated_data.pop("options", [])
        slots_data = validated_data.pop("fill_blank_slots", None)
        short_answer_data = validated_data.pop("short_answer_acceptables", None)
        qt = validated_data["question_type"]
        question = Question.objects.create(**validated_data)
        if qt == Question.QuestionType.FILL_IN_BLANK:
            self._sync_fill_blank_slots(question, slots_data or [])
        elif qt == Question.QuestionType.SHORT_ANSWER:
            self._sync_short_answer_acceptables(question, short_answer_data or [])
        elif qt in (
            Question.QuestionType.SINGLE_CHOICE,
            Question.QuestionType.MULTIPLE_CHOICE,
        ):
            self._bulk_create_options_only(question, options_data)
        return question

    def update(self, instance, validated_data):
        options_data = validated_data.pop("options", None)
        slots_data = validated_data.pop("fill_blank_slots", None)
        short_answer_data = validated_data.pop("short_answer_acceptables", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        qt = instance.question_type
        if qt == Question.QuestionType.FILL_IN_BLANK:
            if _related_nonempty_from_instance(instance, "options"):
                QuestionOption.objects.filter(question=instance).delete()
            QuestionShortAnswerAcceptableAnswer.objects.filter(question=instance).delete()
            if slots_data is not None:
                self._sync_fill_blank_slots(instance, slots_data)
        else:
            if _related_nonempty_from_instance(instance, "fill_blank_slots"):
                QuestionFillBlankSlot.objects.filter(question=instance).delete()

            if qt == Question.QuestionType.SHORT_ANSWER:
                QuestionOption.objects.filter(question=instance).delete()
                if short_answer_data is not None:
                    self._sync_short_answer_acceptables(instance, short_answer_data)
            elif qt in (
                Question.QuestionType.SINGLE_CHOICE,
                Question.QuestionType.MULTIPLE_CHOICE,
            ):
                QuestionShortAnswerAcceptableAnswer.objects.filter(question=instance).delete()
                if options_data is not None:
                    if _related_nonempty_from_instance(instance, "options") and not any(
                        opt.get("id") is not None for opt in options_data
                    ):
                        QuestionOption.objects.filter(question=instance).delete()
                        self._bulk_create_options_only(instance, options_data)
                    else:
                        self._sync_options(instance, options_data)
            elif qt == Question.QuestionType.TRUE_FALSE:
                QuestionShortAnswerAcceptableAnswer.objects.filter(question=instance).delete()
                QuestionOption.objects.filter(question=instance).delete()
            elif qt == Question.QuestionType.ESSAY:
                QuestionShortAnswerAcceptableAnswer.objects.filter(question=instance).delete()
                QuestionOption.objects.filter(question=instance).delete()
        return instance


class TakerFillBlankChoiceOptionSerializer(BaseModelSerializer):
    class Meta:
        model = QuestionFillBlankChoiceOption
        fields = ["id", "text", "display_order"]


class TakerQuestionSerializer(BaseModelSerializer):
    options = TakerQuestionOptionSerializer(many=True)
    fill_blank_slots = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = "__all__"

    def get_fill_blank_slots(self, obj: Question) -> list[dict]:
        if obj.question_type != Question.QuestionType.FILL_IN_BLANK:
            return []
        slots = obj.fill_blank_slots.all().order_by("display_order", "id")
        out: list[dict] = []
        for s in slots:
            row = {
                "blank_uuid": str(s.blank_uuid),
                "display_order": s.display_order,
                "answer_mode": s.answer_mode,
            }
            if s.answer_mode == QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE:
                opts = s.choice_options.all().order_by("display_order", "id")
                row["choice_options"] = TakerFillBlankChoiceOptionSerializer(
                    opts, many=True
                ).data
            out.append(row)
        return out

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.question_type == Question.QuestionType.FILL_IN_BLANK:
            data["options"] = []
        elif instance.question_type in (
            Question.QuestionType.TRUE_FALSE,
            Question.QuestionType.SHORT_ANSWER,
            Question.QuestionType.ESSAY,
        ):
            data["options"] = []
            data["fill_blank_slots"] = []
            data.pop("correct_true", None)
        data.pop("explanation_body", None)
        return hydrate_question_payload_for_quiz(instance.quiz, data)


class QuizStubSerializer(serializers.ModelSerializer):
    """Minimal quiz fields for question bank list (no expand/hydrate)."""

    class Meta:
        model = Quiz
        fields = ("id", "title")


class QuestionBankSerializer(BaseModelSerializer):
    """List-only serializer for org-wide question bank search (small payload)."""

    quiz = QuizStubSerializer(read_only=True)

    class Meta:
        model = Question
        fields = (
            "id",
            "question_type",
            "body_plaintext",
            "points",
            "display_order",
            "quiz",
            "created_at",
            "updated_at",
        )


class QuizSerializer(BaseModelSerializer):
    has_essay_questions = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = "__all__"
        expandable_fields = {
            "category": ("app_quiz_v3.serializers.QuizCategorySerializer",),
            "course": ("app_course.serializers.CourseSerializer",),
            "created_by": ("app_auth.serializers.UserSerializer",),
            # Reverse FK: expanded serializer must be many=True or flex-fields passes RelatedManager as a single instance.
            "questions": (
                "app_quiz_v3.serializers.QuestionSerializer",
                {"many": True},
            ),
        }
        extra_kwargs = {"created_by": {"required": False}}

    def get_has_essay_questions(self, obj):
        ann = getattr(obj, "_has_essay_questions", None)
        if ann is not None:
            return bool(ann)
        return Question.objects.filter(
            quiz=obj,
            question_type=Question.QuestionType.ESSAY,
        ).exists()

    def validate(self, attrs):
        for key in ("intro_body", "outro_body"):
            if key in attrs and attrs[key] is not None:
                attrs[key] = _coerce_tiptap_json_value(attrs[key])
        status_val = attrs.get("status")
        if status_val is None and self.instance is not None:
            status_val = self.instance.status
        course = attrs.get("course")
        if course is None and self.instance is not None:
            course = self.instance.course
        if status_val == Quiz.QuizStatus.OPEN and course is None:
            raise serializers.ValidationError(
                {"course": "Select a course before opening this quiz."}
            )
        return attrs

    def update(self, instance, validated_data):
        # `Model.save()` persists every column. Coerce JSON doc fields on the inbound
        # payload *before* super().update — otherwise a bad str in validated_data would
        # overwrite any fixes applied on the instance first.
        for key in ("intro_body", "outro_body"):
            if key in validated_data and validated_data[key] is not None:
                validated_data[key] = _coerce_tiptap_json_value(validated_data[key])
            else:
                cur = getattr(instance, key, None)
                if isinstance(cur, str):
                    validated_data[key] = _coerce_tiptap_json_value(cur)
        return super().update(instance, validated_data)

    def create(self, validated_data):
        req = self.context.get("request")
        user = User.objects.filter(email=req.user.id).first() if req else None
        validated_data["created_by"] = user
        return super().create(validated_data)


class EssayCommentSerializer(BaseModelSerializer):
    class Meta:
        model = EssayComment
        fields = [
            "id",
            "anchor_start",
            "anchor_end",
            "body",
            "created_by",
            "created_at",
            "updated_at",
        ]


class AttemptAnswerSerializer(BaseModelSerializer):
    selected_option_ids = serializers.SerializerMethodField()
    comments = EssayCommentSerializer(source="essay_comments", many=True, read_only=True)

    class Meta:
        model = AttemptAnswer
        fields = [
            "id",
            "attempt",
            "question",
            "marked_review",
            "score",
            "selected_option_ids",
            "response_text",
            "feedback",
            "comments",
            "graded_at",
            "graded_by",
            "created_at",
            "updated_at",
        ]
        expandable_fields = {
            "question": ("app_quiz_v3.serializers.QuestionSerializer",),
        }

    def get_selected_option_ids(self, obj):
        return list(obj.selected_options.values_list("id", flat=True))


class QuizAttemptSerializer(BaseModelSerializer):
    has_pending_essay_grading = serializers.SerializerMethodField()
    is_released = serializers.SerializerMethodField()
    released_at = serializers.SerializerMethodField()

    class Meta:
        model = QuizAttempt
        fields = "__all__"
        expandable_fields = {
            "quiz": ("app_quiz_v3.serializers.QuizSerializer",),
            "user": ("app_auth.serializers.UserSerializer",),
            "answers": (
                "app_quiz_v3.serializers.AttemptAnswerSerializer",
                {"many": True},
            ),
        }

    def get_has_pending_essay_grading(self, obj):
        ann = getattr(obj, "_has_pending_essay_grading", None)
        if ann is not None:
            return bool(ann)
        return AttemptAnswer.objects.filter(
            attempt=obj,
            question__question_type=Question.QuestionType.ESSAY,
            graded_at__isnull=True,
        ).exists()

    def get_is_released(self, obj):
        ann = getattr(obj, "_is_released", None)
        if ann is not None:
            return bool(ann)
        return QuizResult.objects.filter(attempt=obj).exists()

    def get_released_at(self, obj):
        ann = getattr(obj, "_released_at", None)
        if ann is not None:
            return ann
        row = QuizResult.objects.filter(attempt=obj).only("released_at").first()
        return row.released_at if row else None
