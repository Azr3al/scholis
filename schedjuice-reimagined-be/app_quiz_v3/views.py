from uuid import UUID

from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, QuerySet, Subquery
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import Request
from rest_framework_simplejwt.authentication import JWTTokenUserAuthentication

from app_auth.models import User
from app_quiz_v3 import models
from app_quiz_v3.branding import organization_display_name, organization_logo_url
from app_quiz_v3.grading import grade_attempt, recalculate_attempt_totals
from app_quiz_v3.essay_comments import apply_comments_diff
from app_quiz_v3.release import (
    quiz_has_essay_questions,
    release_attempts,
    unrelease_for_user,
)
from app_quiz_v3.rich_content import (
    build_quiz_attachment_url_map,
    collect_attachment_ids_for_question,
    hydrate_quiz_standalone_tiptap,
)
from app_quiz_v3.perms import (
    can_manage_quiz_v3,
    get_quiz_for_management,
    get_visible_quiz_ids,
    quiz_management_error_response,
    take_flow_forbidden_detail,
)
from app_quiz_v3 import serializers as sz
from app_quiz_v3.throttling import QuizTakeUserThrottle
from app_quiz_v3.take_helpers import (
    client_ip_from_request,
    is_uuid_v4,
    quiz_in_take_window,
    user_agent_from_request,
)
from app_rbac.views import (
    RBACDetailsView,
    RBACListView,
    RBACPermission,
    RBACSearchView,
    RBACView,
)
from utilitas.views import BaseView
from utilitas.queryset_mixins import OptimizedDetailMixin


def _fib_slots_prefetch_qs() -> QuerySet:
    return models.QuestionFillBlankSlot.objects.order_by(
        "display_order", "id"
    ).prefetch_related(
        Prefetch(
            "acceptable_answers",
            queryset=models.QuestionFillBlankAcceptableAnswer.objects.order_by(
                "display_order", "id"
            ),
        ),
        Prefetch(
            "choice_options",
            queryset=models.QuestionFillBlankChoiceOption.objects.order_by(
                "display_order", "id"
            ),
        ),
    )


def _questions_for_quiz_prefetch_qs() -> QuerySet:
    return models.Question.objects.order_by("display_order", "id").prefetch_related(
        Prefetch(
            "options",
            queryset=models.QuestionOption.objects.order_by("display_order", "id"),
        ),
        Prefetch("fill_blank_slots", queryset=_fib_slots_prefetch_qs()),
        Prefetch(
            "short_answer_acceptables",
            queryset=models.QuestionShortAnswerAcceptableAnswer.objects.order_by(
                "display_order", "id"
            ),
        ),
    )


def _quiz_attempt_detail_queryset() -> QuerySet:
    """Prefetch/annotate for quiz attempt detail (avoids N+1 on serializer branches)."""
    essay_pending = models.AttemptAnswer.objects.filter(
        attempt_id=OuterRef("pk"),
        question__question_type=models.Question.QuestionType.ESSAY,
        graded_at__isnull=True,
    )
    quiz_has_essay = models.Question.objects.filter(
        quiz_id=OuterRef("pk"),
        question_type=models.Question.QuestionType.ESSAY,
    )
    fib_slot_qs = _fib_slots_prefetch_qs()
    answer_qs = models.AttemptAnswer.objects.select_related(
        "question",
        "question__quiz",
        "graded_by",
    ).prefetch_related(
        "selected_options",
        Prefetch(
            "essay_comments",
            queryset=models.EssayComment.objects.select_related("created_by").order_by(
                "id"
            ),
        ),
        Prefetch("question__fill_blank_slots", queryset=fib_slot_qs),
        "question__short_answer_acceptables",
        Prefetch(
            "question__options",
            queryset=models.QuestionOption.objects.order_by("display_order", "id"),
        ),
    )
    quiz_qs = models.Quiz.objects.select_related(
        "course", "category", "created_by"
    ).annotate(_has_essay_questions=Exists(quiz_has_essay))
    return (
        models.QuizAttempt.objects.select_related("user", "essay_grading_waived_by")
        .prefetch_related(
            Prefetch("quiz", queryset=quiz_qs),
            Prefetch("answers", queryset=answer_qs),
        )
        .annotate(
            _has_pending_essay_grading=Exists(essay_pending),
            _is_released=Exists(
                models.QuizResult.objects.filter(attempt_id=OuterRef("pk"))
            ),
            _released_at=Subquery(
                models.QuizResult.objects.filter(attempt_id=OuterRef("pk")).values(
                    "released_at"
                )[:1]
            ),
        )
    )


def _quiz_queryset_scope_filtered(request: Request, queryset: QuerySet) -> QuerySet:
    """Optional ``?scope=course|standalone`` for quiz list/search (same endpoint)."""
    scope = (request.query_params.get("scope") or "").strip().lower()
    if scope == "course":
        return queryset.filter(course_id__isnull=False)
    if scope == "standalone":
        return queryset.filter(course_id__isnull=True)
    return queryset


class QuizTakeThrottleMixin:
    """Resolve quiz from URL ``code`` for per-quiz take throttling."""

    throttle_classes = [QuizTakeUserThrottle]

    def dispatch(self, request, *args, **kwargs):
        code = kwargs.get("code")
        if code:
            q = (
                models.Quiz.objects.filter(code=str(code))
                .only("id", "take_rate_per_minute")
                .first()
            )
            if q:
                self._quiz_take_throttle_quiz_id = q.id
                self._quiz_take_requests_per_minute = q.take_rate_per_minute or 30
            else:
                self._quiz_take_throttle_quiz_id = 0
                self._quiz_take_requests_per_minute = 30
        else:
            self._quiz_take_throttle_quiz_id = 0
            self._quiz_take_requests_per_minute = 30
        return super().dispatch(request, *args, **kwargs)


class QuizTakeRBACView(QuizTakeThrottleMixin, RBACView):
    """Take-flow endpoints: JWT auth + ``quiz.take``."""

    authentication_classes = [JWTTokenUserAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]


def _idempotency_key_from_request(request: Request) -> str | None:
    raw = (
        request.headers.get("Idempotency-Key")
        or request.META.get("HTTP_IDEMPOTENCY_KEY")
        or ""
    ).strip()
    if not raw:
        return None
    return raw[:64]


def _submit_success_response(
    view: BaseView, request: Request, attempt: models.QuizAttempt, quiz: models.Quiz
):
    attempt.refresh_from_db()
    ser = sz.QuizAttemptSerializer(
        attempt, expand=["answers", "answers.question", "quiz"]
    )
    payload = dict(ser.data)
    payload["outro_body"] = hydrate_quiz_standalone_tiptap(quiz, quiz.outro_body)
    payload["quiz_theme"] = quiz.quiz_theme
    payload["logo_url"] = organization_logo_url(request)
    payload["course_id"] = quiz.course_id
    return view.send_response(False, "success", {"data": payload}, status=200)


def _parse_client_answer_for_question(
    question: models.Question,
    raw,
) -> tuple[dict, list[int]]:
    """Normalize take submit / progress payload for one question."""
    response_text: dict = {}
    option_ids: list = []
    qt = question.question_type
    if qt == models.Question.QuestionType.FILL_IN_BLANK:
        if isinstance(raw, dict):
            response_text = {
                str(k): (str(v) if v is not None else "").strip()[:10000]
                for k, v in raw.items()
            }
    elif qt == models.Question.QuestionType.TRUE_FALSE:
        if isinstance(raw, dict) and "value" in raw:
            response_text = {"value": bool(raw["value"])}
    elif qt in (
        models.Question.QuestionType.SHORT_ANSWER,
        models.Question.QuestionType.ESSAY,
    ):
        if isinstance(raw, dict):
            t = raw.get("text")
            cap = 100000 if qt == models.Question.QuestionType.ESSAY else 10000
            response_text = {"text": (str(t) if t is not None else "").strip()[:cap]}
        elif isinstance(raw, str):
            cap = 100000 if qt == models.Question.QuestionType.ESSAY else 10000
            response_text = {"text": raw.strip()[:cap]}
    elif isinstance(raw, list):
        option_ids = raw
    return response_text, option_ids


def _upsert_partial_attempt_answers(
    attempt: models.QuizAttempt, quiz: models.Quiz, answers_map: dict
) -> None:
    """Create or update AttemptAnswer rows for keys present in answers_map (no grading, no deletes)."""
    if not isinstance(answers_map, dict):
        raise TypeError("answers must be a dict")
    id_keys: list[int] = []
    for k in answers_map.keys():
        try:
            id_keys.append(int(k))
        except (TypeError, ValueError):
            continue
    if not id_keys:
        return
    questions = {
        q.id: q
        for q in models.Question.objects.filter(
            quiz_id=quiz.id, id__in=id_keys
        ).prefetch_related(
            Prefetch(
                "options",
                queryset=models.QuestionOption.objects.order_by("display_order", "id"),
            ),
        )
    }
    for qid in id_keys:
        question = questions.get(qid)
        if question is None:
            continue
        raw = answers_map.get(str(qid), answers_map.get(qid))
        response_text, option_ids = _parse_client_answer_for_question(question, raw)
        valid_ids = set(question.options.values_list("id", flat=True))
        selected: list[int] = []
        for x in option_ids:
            try:
                oid = int(x)
            except (TypeError, ValueError):
                continue
            if oid in valid_ids:
                selected.append(oid)
        if question.question_type == models.Question.QuestionType.SINGLE_CHOICE:
            selected = selected[:1]
        aa, _ = models.AttemptAnswer.objects.get_or_create(
            attempt=attempt,
            question=question,
            defaults={"score": 0, "response_text": {}},
        )
        aa.response_text = response_text
        aa.save(update_fields=["response_text", "updated_at"])
        if question.question_type in (
            models.Question.QuestionType.SINGLE_CHOICE,
            models.Question.QuestionType.MULTIPLE_CHOICE,
        ):
            aa.selected_options.set(selected)
        else:
            aa.selected_options.clear()


def _upsert_partial_marked_review(
    attempt: models.QuizAttempt, quiz: models.Quiz, marked_map: dict
) -> None:
    """Set marked_review on AttemptAnswer for keys present; create row if needed (answers unchanged)."""
    if not isinstance(marked_map, dict):
        raise TypeError("marked_review must be a dict")
    id_keys: list[int] = []
    for k in marked_map.keys():
        try:
            id_keys.append(int(k))
        except (TypeError, ValueError):
            continue
    if not id_keys:
        return
    valid_ids = set(
        models.Question.objects.filter(quiz_id=quiz.id, id__in=id_keys).values_list(
            "id", flat=True
        )
    )
    for qid in id_keys:
        if qid not in valid_ids:
            continue
        raw = marked_map.get(str(qid), marked_map.get(qid))
        if not isinstance(raw, bool):
            continue
        flag = raw
        aa, created = models.AttemptAnswer.objects.get_or_create(
            attempt=attempt,
            question_id=qid,
            defaults={"score": 0, "response_text": {}, "marked_review": flag},
        )
        if created:
            continue
        if aa.marked_review != flag:
            aa.marked_review = flag
            aa.save(update_fields=["marked_review", "updated_at"])


def _saved_marked_review_from_attempt(attempt: models.QuizAttempt) -> dict:
    """question id str -> True for rows flagged for review (omit False; client treats missing as false)."""
    rows = models.AttemptAnswer.objects.filter(
        attempt=attempt, marked_review=True
    ).values_list("question_id", flat=True)
    return {str(qid): True for qid in rows}


def _saved_answers_from_attempt(attempt: models.QuizAttempt) -> dict:
    """Maps question id str -> client-shaped answer for GET take / begin hydrate."""
    rows = (
        models.AttemptAnswer.objects.filter(attempt=attempt)
        .select_related("question")
        .prefetch_related("selected_options")
    )
    out: dict = {}
    for aa in rows:
        q = aa.question
        if q.question_type == models.Question.QuestionType.FILL_IN_BLANK:
            out[str(q.id)] = dict(aa.response_text or {})
        elif q.question_type in (
            models.Question.QuestionType.SINGLE_CHOICE,
            models.Question.QuestionType.MULTIPLE_CHOICE,
        ):
            out[str(q.id)] = list(aa.selected_options.values_list("id", flat=True))
        elif q.question_type == models.Question.QuestionType.TRUE_FALSE:
            raw = aa.response_text or {}
            val = raw.get("value")
            if val is not None:
                out[str(q.id)] = {"value": bool(val)}
        elif q.question_type in (
            models.Question.QuestionType.SHORT_ANSWER,
            models.Question.QuestionType.ESSAY,
        ):
            out[str(q.id)] = {"text": str((aa.response_text or {}).get("text") or "")}
    return out


def _take_payload_dict(quiz: models.Quiz, attempt: models.QuizAttempt) -> dict:
    fib_slots_q = models.QuestionFillBlankSlot.objects.order_by(
        "display_order", "id"
    ).prefetch_related(
        Prefetch(
            "acceptable_answers",
            queryset=models.QuestionFillBlankAcceptableAnswer.objects.order_by(
                "display_order", "id"
            ),
        ),
        Prefetch(
            "choice_options",
            queryset=models.QuestionFillBlankChoiceOption.objects.order_by(
                "display_order", "id"
            ),
        ),
    )
    qs = (
        models.Question.objects.filter(quiz=quiz)
        .order_by("display_order", "id")
        .prefetch_related(
            Prefetch(
                "options",
                queryset=models.QuestionOption.objects.order_by("display_order", "id"),
            ),
            Prefetch("fill_blank_slots", queryset=fib_slots_q),
        )
    )
    questions_data = sz.TakerQuestionSerializer(qs, many=True).data
    quiz_ser = sz.QuizSerializer(quiz, expand=["category", "course"])
    return {
        **quiz_ser.data,
        "questions": questions_data,
        "attempt_id": attempt.id,
        "started_at": attempt.started_at,
        "saved_answers": _saved_answers_from_attempt(attempt),
        "saved_marked_review": _saved_marked_review_from_attempt(attempt),
    }


def _attempt_has_pending_essay_grading(attempt: models.QuizAttempt) -> bool:
    for aa in attempt.answers.all():
        if (
            aa.question.question_type == models.Question.QuestionType.ESSAY
            and aa.graded_at is None
        ):
            return True
    return False


def _learner_attempt_summary_payload(
    attempt: models.QuizAttempt,
    quiz_title: str,
    *,
    include_essay_feedback: bool = False,
) -> dict:
    """Score-first result for learners when per-question review is off (`can_show_answers_afterwards` false)."""
    payload = {
        "review_mode": "summary",
        "attempt_id": attempt.id,
        "quiz_title": quiz_title,
        "submitted_at": attempt.submitted_at,
        "score": str(attempt.score),
        "max_score": attempt.max_score,
        "overdue_seconds": attempt.overdue_seconds,
        "has_pending_essay_grading": _attempt_has_pending_essay_grading(attempt),
    }
    if include_essay_feedback:
        rows = []
        for aa in attempt.answers.all():
            if aa.question.question_type != models.Question.QuestionType.ESSAY:
                continue
            rows.append(
                {
                    "answer_id": aa.id,
                    "question_id": aa.question_id,
                    "feedback": aa.feedback,
                    "comments": sz.EssayCommentSerializer(
                        aa.essay_comments.all(), many=True
                    ).data,
                }
            )
        payload["essay_feedback"] = rows
    return payload


# --- QuizCategory ---


class QuizCategoryListView(RBACListView):
    name = "Quiz category list"
    model = models.QuizCategory
    serializer = sz.QuizCategorySerializer
    required_permissions = {"GET": "quiz.author", "POST": "quiz.author"}


class QuizCategoryDetailsView(RBACDetailsView):
    name = "Quiz category details"
    model = models.QuizCategory
    serializer = sz.QuizCategorySerializer
    required_permissions = {
        "GET": "quiz.author",
        "PUT": "quiz.author",
        "PATCH": "quiz.author",
        "DELETE": "quiz.author",
    }


class QuizCategorySearchView(RBACSearchView):
    name = "Quiz category search"
    model = models.QuizCategory
    serializer = sz.QuizCategorySerializer
    required_permissions = {"POST": "quiz.author"}


# --- Quiz ---


class QuizListView(RBACListView):
    name = "Quiz V3 list"
    model = models.Quiz
    serializer = sz.QuizSerializer
    required_permissions = {"GET": "quiz.author", "POST": "quiz.author"}

    def augment_search_queryset(
        self, queryset: QuerySet, expand: list, is_csv: bool
    ) -> QuerySet:
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        return _quiz_queryset_scope_filtered(self.request, queryset)

    def get(self, request: Request, filter_ids=None):
        user = User.get_user_from_request(request)
        ids = get_visible_quiz_ids(user)
        if ids is not None:
            filter_ids = list(ids)
        return super().get(request, filter_ids=filter_ids)


class QuizDetailsView(OptimizedDetailMixin, RBACDetailsView):
    name = "Quiz V3 details"
    model = models.Quiz
    serializer = sz.QuizSerializer
    required_permissions = {
        "GET": "quiz.author",
        "PUT": "quiz.author",
        "PATCH": "quiz.author",
        "DELETE": "quiz.author",
    }

    def get_object(self, obj_id: int, prefetch_fields=None):
        if prefetch_fields is None:
            prefetch_fields = []
        prefetch_list = list(prefetch_fields)
        question_related = {
            p
            for p in prefetch_list
            if p == "questions" or str(p).startswith("questions__")
        }
        if question_related:
            prefetch_list = [
                p
                for p in prefetch_list
                if p not in question_related and not str(p).startswith("questions__")
            ]
            prefetch_list.append(
                Prefetch("questions", queryset=_questions_for_quiz_prefetch_qs())
            )
        qs = self.annotate_detail_queryset(self.model.objects.filter(pk=obj_id))
        if prefetch_list:
            qs = qs.prefetch_related(*prefetch_list)
        return qs.first()

    def get(self, request: Request, obj_id: int):
        self.description = self.model.__doc__

        query_params = self.get_query_params(request)
        query_params.pop("sorts")

        obj = self.get_object(
            obj_id, self.translate_expand_params(query_params.get("expand", []))
        )
        if obj is None:
            return self.send_not_found(obj_id)
        serialized_data = self.get_serializer(obj, **query_params)
        payload = dict(serialized_data.data)
        attempt_agg = models.QuizAttempt.objects.filter(
            quiz_id=obj_id, submitted_at__isnull=False
        ).aggregate(
            submission_count=Count("id"),
            unique_respondent_count=Count("user_id", distinct=True),
        )
        payload["submission_count"] = attempt_agg["submission_count"] or 0
        payload["unique_respondent_count"] = attempt_agg["unique_respondent_count"] or 0
        payload["total_questions"] = models.Question.objects.filter(
            quiz_id=obj_id
        ).count()
        return self.ok(payload)

    def put(self, request: Request, obj_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, obj_id)
        if err:
            return quiz_management_error_response(self, err)
        return super().put(request, obj_id)

    def delete(self, request: Request, obj_id: int):
        return self.send_response(
            True,
            "method_not_allowed",
            {"details": "Deleting quizzes is not supported. Archive the quiz instead."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class QuizSearchView(RBACSearchView):
    name = "Quiz V3 search"
    model = models.Quiz
    serializer = sz.QuizSerializer
    required_permissions = {"POST": "quiz.author"}

    def augment_search_queryset(
        self, queryset: QuerySet, expand: list, is_csv: bool
    ) -> QuerySet:
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        return _quiz_queryset_scope_filtered(self.request, queryset)

    def post(self, request, *args, **kwargs):
        user = User.get_user_from_request(request)
        ids = get_visible_quiz_ids(user)
        if ids is not None:
            return super().post(request, filter_ids=list(ids))
        return super().post(request)


class QuizAuthorPreviewView(RBACView):
    """GET learner-like quiz payload for staff preview (no attempt; any quiz status)."""

    name = "Quiz V3 author preview"
    required_permissions = {"GET": "quiz.author"}

    def get(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        quiz, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)

        fib_slots_q = models.QuestionFillBlankSlot.objects.order_by(
            "display_order", "id"
        ).prefetch_related(
            Prefetch(
                "acceptable_answers",
                queryset=models.QuestionFillBlankAcceptableAnswer.objects.order_by(
                    "display_order", "id"
                ),
            ),
            Prefetch(
                "choice_options",
                queryset=models.QuestionFillBlankChoiceOption.objects.order_by(
                    "display_order", "id"
                ),
            ),
        )
        qs = (
            models.Question.objects.filter(quiz=quiz)
            .order_by("display_order", "id")
            .prefetch_related(
                Prefetch(
                    "options",
                    queryset=models.QuestionOption.objects.order_by(
                        "display_order", "id"
                    ),
                ),
                Prefetch("fill_blank_slots", queryset=fib_slots_q),
                Prefetch(
                    "short_answer_acceptables",
                    queryset=models.QuestionShortAnswerAcceptableAnswer.objects.order_by(
                        "display_order", "id"
                    ),
                ),
            )
        )
        questions_data = sz.QuestionSerializer(
            qs, many=True, context={"request": request}
        ).data
        quiz_ser = sz.QuizSerializer(
            quiz, expand=["category", "course"], context={"request": request}
        )
        payload = dict(quiz_ser.data)
        payload.pop("questions", None)
        payload["intro_body"] = hydrate_quiz_standalone_tiptap(quiz, quiz.intro_body)
        payload["outro_body"] = hydrate_quiz_standalone_tiptap(quiz, quiz.outro_body)
        payload["questions"] = questions_data
        payload["logo_url"] = organization_logo_url(request)
        payload["organization_name"] = organization_display_name(request)
        return self.ok(payload)


class QuizQuestionBankSearchView(RBACSearchView):
    """Search all questions visible to the user (same quiz scope as QuizSearchView)."""

    name = "Quiz V3 question bank search"
    model = models.Question
    serializer = sz.QuestionBankSerializer
    required_permissions = {"POST": "questionbank.manage"}

    def post(self, request, *args, **kwargs):
        user = User.get_user_from_request(request)
        self._restrict_quiz_ids = get_visible_quiz_ids(user)
        try:
            return super().post(request, *args, **kwargs)
        finally:
            self._restrict_quiz_ids = None

    def augment_search_queryset(
        self, queryset: QuerySet, expand: list, is_csv: bool
    ) -> QuerySet:
        qs = super().augment_search_queryset(queryset, expand, is_csv)
        restrict = getattr(self, "_restrict_quiz_ids", None)
        if restrict is not None:
            qs = qs.filter(quiz_id__in=restrict)
        return qs.select_related("quiz")


# --- Questions ---


class QuizQuestionListView(RBACView):
    name = "Quiz V3 questions list/create"
    model = models.Question
    serializer = sz.QuestionSerializer
    required_permissions = {"GET": "quiz.author", "POST": "quiz.author"}

    def get(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        fib_slot_qs = models.QuestionFillBlankSlot.objects.order_by(
            "display_order", "id"
        ).prefetch_related(
            Prefetch(
                "acceptable_answers",
                queryset=models.QuestionFillBlankAcceptableAnswer.objects.order_by(
                    "display_order", "id"
                ),
            ),
            Prefetch(
                "choice_options",
                queryset=models.QuestionFillBlankChoiceOption.objects.order_by(
                    "display_order", "id"
                ),
            ),
        )
        qs = (
            models.Question.objects.filter(quiz_id=quiz_id)
            .order_by("display_order", "id")
            .prefetch_related(
                Prefetch(
                    "options",
                    queryset=models.QuestionOption.objects.order_by(
                        "display_order", "id"
                    ),
                ),
                Prefetch("fill_blank_slots", queryset=fib_slot_qs),
            )
        )
        ser = sz.QuestionSerializer(qs, many=True)
        return self.send_response(False, "success", {"data": ser.data}, status=200)

    def post(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        data = {**request.data, "quiz": quiz_id}
        ser = sz.QuestionSerializer(data=data, context={"request": request})
        if ser.is_valid():
            with transaction.atomic():
                ser.save()
            return self.created(ser.data)
        return self.send_response(
            True, "bad_request", {"details": ser.errors}, status=400
        )


class QuizQuestionDetailView(RBACView):
    name = "Quiz V3 question detail"
    model = models.Question
    serializer = sz.QuestionSerializer
    required_permissions = {
        "GET": "quiz.author",
        "PUT": "quiz.author",
        "PATCH": "quiz.author",
        "DELETE": "quiz.author",
    }

    def get(self, request: Request, quiz_id: int, question_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        fib_slot_qs = models.QuestionFillBlankSlot.objects.order_by(
            "display_order", "id"
        ).prefetch_related(
            Prefetch(
                "acceptable_answers",
                queryset=models.QuestionFillBlankAcceptableAnswer.objects.order_by(
                    "display_order", "id"
                ),
            ),
            Prefetch(
                "choice_options",
                queryset=models.QuestionFillBlankChoiceOption.objects.order_by(
                    "display_order", "id"
                ),
            ),
        )
        q = (
            models.Question.objects.filter(id=question_id, quiz_id=quiz_id)
            .prefetch_related(
                Prefetch(
                    "options",
                    queryset=models.QuestionOption.objects.order_by(
                        "display_order", "id"
                    ),
                ),
                Prefetch("fill_blank_slots", queryset=fib_slot_qs),
            )
            .first()
        )
        if not q:
            return self.not_found()
        ser = sz.QuestionSerializer(q)
        return self.send_response(False, "success", {"data": ser.data}, status=200)

    def put(self, request: Request, quiz_id: int, question_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        q = models.Question.objects.filter(id=question_id, quiz_id=quiz_id).first()
        if not q:
            return self.not_found()
        data = {**request.data, "quiz": quiz_id}
        ser = sz.QuestionSerializer(
            q, data=data, partial=True, context={"request": request}
        )
        if ser.is_valid():
            with transaction.atomic():
                ser.save()
            return self.send_response(False, "updated", {"data": ser.data}, status=200)
        return self.send_response(
            True, "bad_request", {"details": ser.errors}, status=400
        )

    def delete(self, request: Request, quiz_id: int, question_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        q = models.Question.objects.filter(id=question_id, quiz_id=quiz_id).first()
        if not q:
            return self.not_found()
        q.delete()
        return self.send_response(
            False, "deleted", {"data": {"id": question_id}}, status=200
        )


class QuizQuestionReorderView(RBACView):
    name = "Quiz V3 question reorder"
    required_permissions = {"POST": "quiz.author"}

    def post(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        ordered_ids = request.data.get("ordered_ids")
        if not isinstance(ordered_ids, list):
            return self.send_response(
                True,
                "bad_request",
                {"details": "ordered_ids must be a list"},
                status=400,
            )
        try:
            ordered_ids_int = [int(x) for x in ordered_ids]
        except (TypeError, ValueError):
            return self.bad_request("ordered_ids must be a list of integers")
        questions = list(
            models.Question.objects.filter(quiz_id=quiz_id).order_by(
                "display_order", "id"
            )
        )
        db_ids = {q.id for q in questions}
        if len(ordered_ids_int) != len(db_ids) or set(ordered_ids_int) != db_ids:
            return self.bad_request(
                "ordered_ids must list each question id for this quiz exactly once"
            )
        order_map = {qid: i for i, qid in enumerate(ordered_ids_int)}
        for q in questions:
            q.display_order = order_map[q.id]
        with transaction.atomic():
            models.Question.objects.bulk_update(questions, ["display_order"])
        return self.send_response(
            False, "updated", {"data": {"ordered_ids": ordered_ids_int}}, status=200
        )


class QuizEditorSyncView(RBACView):
    """POST optional `quiz` patch plus full `questions` list: upsert, reorder, delete missing (one round trip)."""

    name = "Quiz V3 editor sync"
    required_permissions = {"POST": "quiz.author"}

    def post(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        quiz, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        body = request.data
        if not isinstance(body, dict):
            return self.send_response(
                True, "bad_request", {"details": "Invalid body"}, status=400
            )
        quiz_patch = body.get("quiz")
        questions_raw = body.get("questions")
        if not isinstance(questions_raw, list):
            return self.send_response(
                True, "bad_request", {"details": "questions must be a list"}, status=400
            )

        existing = {
            q.id: q
            for q in models.Question.objects.filter(quiz_id=quiz_id)
            .select_related("quiz")
            .prefetch_related(
                Prefetch(
                    "options",
                    queryset=models.QuestionOption.objects.order_by(
                        "display_order", "id"
                    ),
                ),
                Prefetch("fill_blank_slots", queryset=_fib_slots_prefetch_qs()),
                Prefetch(
                    "short_answer_acceptables",
                    queryset=models.QuestionShortAnswerAcceptableAnswer.objects.order_by(
                        "display_order", "id"
                    ),
                ),
            )
        }
        incoming_existing_ids: set[int] = set()
        for qrow in questions_raw:
            if not isinstance(qrow, dict):
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "Each question must be an object"},
                    status=400,
                )
            if qrow.get("id") is not None:
                try:
                    incoming_existing_ids.add(int(qrow["id"]))
                except (TypeError, ValueError):
                    return self.send_response(
                        True,
                        "bad_request",
                        {"details": "Invalid question id"},
                        status=400,
                    )

        if not incoming_existing_ids.issubset(existing.keys()):
            unknown = incoming_existing_ids - existing.keys()
            return self.send_response(
                True,
                "bad_request",
                {"details": f"Unknown question id(s) for this quiz: {sorted(unknown)}"},
                status=400,
            )

        qz_ser = None
        if quiz_patch is not None:
            if not isinstance(quiz_patch, dict):
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "quiz must be an object"},
                    status=400,
                )
            qz_ser = sz.QuizSerializer(
                quiz, data=quiz_patch, partial=True, context={"request": request}
            )
            if not qz_ser.is_valid():
                return self.send_response(
                    True, "bad_request", {"details": qz_ser.errors}, status=400
                )

        validated_serializers: list[sz.QuestionSerializer] = []
        for idx, qdata in enumerate(questions_raw):
            data = {**qdata, "quiz": quiz_id, "display_order": idx}
            qid = qdata.get("id")
            if qid is not None:
                q_obj = existing[int(qid)]
                ser = sz.QuestionSerializer(
                    q_obj, data=data, context={"request": request}
                )
            else:
                ser = sz.QuestionSerializer(data=data, context={"request": request})
            if not ser.is_valid():
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": ser.errors, "index": idx},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            validated_serializers.append(ser)

        ids_to_delete = set(existing.keys()) - incoming_existing_ids

        with transaction.atomic():
            if qz_ser is not None:
                qz_ser.save()
            for ser in validated_serializers:
                ser.save()
            if ids_to_delete:
                models.Question.objects.filter(
                    quiz_id=quiz_id, id__in=ids_to_delete
                ).delete()

        quiz.refresh_from_db()
        qlist = (
            models.Question.objects.filter(quiz_id=quiz_id)
            .order_by("display_order", "id")
            .select_related("quiz")
            .prefetch_related(
                Prefetch(
                    "options",
                    queryset=models.QuestionOption.objects.order_by(
                        "display_order", "id"
                    ),
                ),
                Prefetch("fill_blank_slots", queryset=_fib_slots_prefetch_qs()),
                Prefetch(
                    "short_answer_acceptables",
                    queryset=models.QuestionShortAnswerAcceptableAnswer.objects.order_by(
                        "display_order", "id"
                    ),
                ),
            )
        )
        questions_for_response = list(qlist)
        all_attachment_ids: set[int] = set()
        for q in questions_for_response:
            all_attachment_ids |= collect_attachment_ids_for_question(q)
        attachment_url_map = build_quiz_attachment_url_map(quiz, all_attachment_ids)
        payload = {
            "quiz": sz.QuizSerializer(quiz, context={"request": request}).data,
            "questions": sz.QuestionSerializer(
                questions_for_response,
                many=True,
                context={"request": request, "attachment_url_map": attachment_url_map},
            ).data,
        }

        return self.send_response(False, "success", {"data": payload}, status=200)


# --- Take / Submit ---


class QuizTakeAttemptResultView(QuizTakeRBACView):
    """GET submitted attempt for the take link: summary or full review per quiz settings."""

    required_permissions = {"GET": "quiz.take"}

    def get(self, request: Request, code: str | UUID, attempt_id: int):
        code_str = str(code)
        if not is_uuid_v4(code_str):
            return self.send_response(
                True, "bad_request", {"message": "invalid uuid"}, status=400
            )
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True, "bad_request", {"details": "User not found"}, status=400
            )

        quiz = models.Quiz.objects.filter(code=code_str).first()
        if not quiz:
            return self.not_found()

        attempt = (
            models.QuizAttempt.objects.filter(
                id=attempt_id, quiz=quiz, user=user, submitted_at__isnull=False
            )
            .select_related("quiz", "user")
            .prefetch_related(
                "answers__selected_options",
                "answers__question__options",
                Prefetch(
                    "answers__essay_comments",
                    queryset=models.EssayComment.objects.order_by("id"),
                ),
            )
            .first()
        )
        if not attempt:
            return self.not_found()

        if (
            quiz_has_essay_questions(quiz.id)
            and not models.QuizResult.objects.filter(attempt=attempt).exists()
        ):
            return self.send_response(
                False,
                "success",
                {
                    "data": {
                        "review_mode": "awaiting_release",
                        "attempt_id": attempt.id,
                        "submitted_at": attempt.submitted_at,
                        "overdue_seconds": attempt.overdue_seconds,
                        "has_pending_essay_grading": _attempt_has_pending_essay_grading(
                            attempt
                        ),
                    }
                },
                status=status.HTTP_200_OK,
            )

        if not quiz.can_show_answers_afterwards:
            payload = _learner_attempt_summary_payload(
                attempt,
                quiz.title,
                include_essay_feedback=quiz_has_essay_questions(quiz.id),
            )
            return self.ok(payload)

        query_params = self.get_query_params(request)
        query_params.pop("sorts", None)
        query_params.pop("expand", None)
        ser = sz.QuizAttemptSerializer(
            attempt,
            expand=[
                "answers",
                "answers.question",
                "answers.question.options",
                "quiz",
                "user",
            ],
            context={"request": request, "view": self},
            **query_params,
        )
        data = dict(ser.data)
        data["review_mode"] = "full"
        return self.ok(data)


class QuizTakePreviewView(QuizTakeRBACView):
    """GET quiz intro and branding without creating an attempt."""

    required_permissions = {"GET": "quiz.take"}

    def get(self, request: Request, code: str | UUID):
        code_str = str(code)
        if not is_uuid_v4(code_str):
            return self.send_response(
                True, "bad_request", {"message": "invalid uuid"}, status=400
            )
        quiz = (
            models.Quiz.objects.filter(code=code_str)
            .exclude(status=models.Quiz.QuizStatus.DRAFT)
            .first()
        )
        if not quiz or quiz.status != models.Quiz.QuizStatus.OPEN:
            return self.not_found()
        if not quiz_in_take_window(quiz):
            return self.bad_request("Quiz is not available at this time.")
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True, "bad_request", {"details": "User not found"}, status=400
            )

        in_progress = models.QuizAttempt.objects.filter(
            quiz=quiz, user=user, submitted_at__isnull=True
        ).first()
        forbidden = take_flow_forbidden_detail(user, quiz, in_progress=in_progress)
        if forbidden:
            return self.send_response(
                True, "forbidden", {"details": forbidden}, status=403
            )

        completed_count = models.QuizAttempt.objects.filter(
            quiz=quiz, user=user, submitted_at__isnull=False
        ).count()

        if not in_progress and completed_count >= quiz.max_retakes:
            return self.bad_request(
                "You have exceeded the number of attempts for this quiz."
            )

        intro_hydrated = hydrate_quiz_standalone_tiptap(quiz, quiz.intro_body)
        quiz_ser = sz.QuizSerializer(quiz, expand=["category", "course"])
        data = dict(quiz_ser.data)
        data["intro_body"] = intro_hydrated
        data.pop("outro_body", None)
        data["logo_url"] = organization_logo_url(request)
        data["organization_name"] = organization_display_name(request)
        data["has_in_progress_attempt"] = bool(in_progress)
        data["may_begin_new_attempt"] = (
            in_progress is None and completed_count < quiz.max_retakes
        )
        return self.send_response(False, "success", {"data": data}, status=200)


class QuizTakeBeginView(QuizTakeRBACView):
    """POST create a new attempt or return an in-progress attempt with questions (timer starts on new attempt)."""

    required_permissions = {"POST": "quiz.take"}

    def post(self, request: Request, code: str | UUID):
        code_str = str(code)
        if not is_uuid_v4(code_str):
            return self.send_response(
                True, "bad_request", {"message": "invalid uuid"}, status=400
            )
        quiz = (
            models.Quiz.objects.filter(code=code_str)
            .exclude(status=models.Quiz.QuizStatus.DRAFT)
            .first()
        )
        if not quiz or quiz.status != models.Quiz.QuizStatus.OPEN:
            return self.not_found()
        if not quiz_in_take_window(quiz):
            return self.bad_request("Quiz is not available at this time.")
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True, "bad_request", {"details": "User not found"}, status=400
            )

        in_progress = models.QuizAttempt.objects.filter(
            quiz=quiz, user=user, submitted_at__isnull=True
        ).first()
        forbidden = take_flow_forbidden_detail(user, quiz, in_progress=in_progress)
        if forbidden:
            return self.send_response(
                True, "forbidden", {"details": forbidden}, status=403
            )

        completed_count = models.QuizAttempt.objects.filter(
            quiz=quiz, user=user, submitted_at__isnull=False
        ).count()

        if in_progress:
            attempt = in_progress
        else:
            if completed_count >= quiz.max_retakes:
                return self.bad_request(
                    "You have exceeded the number of attempts for this quiz."
                )
            attempt = models.QuizAttempt.objects.create(
                quiz=quiz,
                user=user,
                score=0,
                max_score=0,
                started_at=timezone.now(),
                client_ip=client_ip_from_request(request),
                user_agent=user_agent_from_request(request),
            )

        payload = _take_payload_dict(quiz, attempt)
        payload["logo_url"] = organization_logo_url(request)
        return self.send_response(False, "success", {"data": payload}, status=200)


class QuizTakeView(QuizTakeRBACView):
    """GET resume an in-progress attempt only (no new attempt — use POST …/begin)."""

    required_permissions = {"GET": "quiz.take"}

    def get(self, request: Request, code: str | UUID):
        code_str = str(code)
        if not is_uuid_v4(code_str):
            return self.send_response(
                True, "bad_request", {"message": "invalid uuid"}, status=400
            )
        quiz = (
            models.Quiz.objects.filter(code=code_str)
            .exclude(status=models.Quiz.QuizStatus.DRAFT)
            .first()
        )
        if not quiz or quiz.status != models.Quiz.QuizStatus.OPEN:
            return self.not_found()
        if not quiz_in_take_window(quiz):
            return self.bad_request("Quiz is not available at this time.")
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True, "bad_request", {"details": "User not found"}, status=400
            )

        in_progress = models.QuizAttempt.objects.filter(
            quiz=quiz, user=user, submitted_at__isnull=True
        ).first()
        forbidden = take_flow_forbidden_detail(user, quiz, in_progress=in_progress)
        if forbidden:
            return self.send_response(
                True, "forbidden", {"details": forbidden}, status=403
            )

        if not in_progress:
            return self.send_response(
                True,
                "bad_request",
                {
                    "details": (
                        "No quiz in progress. Open the quiz link and use “Begin quiz” to start or resume."
                    )
                },
                status=400,
            )

        payload = _take_payload_dict(quiz, in_progress)
        payload["logo_url"] = organization_logo_url(request)
        return self.send_response(False, "success", {"data": payload}, status=200)


class QuizTakeProgressView(QuizTakeRBACView):
    """PATCH partial answers for an in-progress attempt (autosave; no grading)."""

    required_permissions = {"PATCH": "quiz.take"}

    def patch(self, request: Request, code: str | UUID):
        code_str = str(code)
        if not is_uuid_v4(code_str):
            return self.send_response(
                True, "bad_request", {"message": "invalid uuid"}, status=400
            )
        quiz = (
            models.Quiz.objects.filter(code=code_str)
            .exclude(status=models.Quiz.QuizStatus.DRAFT)
            .first()
        )
        if not quiz or quiz.status != models.Quiz.QuizStatus.OPEN:
            return self.not_found()
        if not quiz_in_take_window(quiz):
            return self.bad_request("Quiz is not available at this time.")
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True, "bad_request", {"details": "User not found"}, status=400
            )

        attempt_id = request.data.get("attempt_id")
        answers = request.data.get("answers")
        marked_review = request.data.get("marked_review")
        if attempt_id is None:
            return self.bad_request("attempt_id is required.")
        if answers is None and marked_review is None:
            return self.bad_request("Provide answers and/or marked_review.")
        if answers is not None and not isinstance(answers, dict):
            return self.bad_request("answers must be an object.")
        if marked_review is not None and not isinstance(marked_review, dict):
            return self.bad_request("marked_review must be an object.")
        try:
            attempt_id = int(attempt_id)
        except (TypeError, ValueError):
            return self.send_response(
                True, "bad_request", {"details": "Invalid attempt_id"}, status=400
            )

        attempt = models.QuizAttempt.objects.filter(
            id=attempt_id, quiz=quiz, user=user, submitted_at__isnull=True
        ).first()
        if not attempt:
            return self.not_found()

        forbidden = take_flow_forbidden_detail(user, quiz, in_progress=attempt)
        if forbidden:
            return self.send_response(
                True, "forbidden", {"details": forbidden}, status=403
            )

        answers_map = answers if answers is not None else {}
        try:
            _upsert_partial_attempt_answers(attempt, quiz, answers_map)
        except TypeError:
            return self.bad_request("answers must be an object.")

        if marked_review:
            try:
                _upsert_partial_marked_review(attempt, quiz, marked_review)
            except TypeError:
                return self.bad_request("marked_review must be an object.")

        return self.send_response(False, "success", {"data": {"ok": True}}, status=200)


class QuizSubmitView(QuizTakeRBACView):
    required_permissions = {"POST": "quiz.take"}

    def post(self, request: Request, code: str | UUID):
        code_str = str(code)
        if not is_uuid_v4(code_str):
            return self.send_response(
                True, "bad_request", {"message": "invalid uuid"}, status=400
            )
        quiz = models.Quiz.objects.filter(code=code_str).first()
        if not quiz:
            return self.not_found()
        if quiz.status != models.Quiz.QuizStatus.OPEN:
            return self.send_response(
                True, "bad_request", {"details": "Quiz is not open."}, status=400
            )
        if not quiz_in_take_window(quiz):
            return self.bad_request("Quiz is not available at this time.")
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True, "bad_request", {"details": "User not found"}, status=400
            )

        attempt_id = request.data.get("attempt_id")
        answers = request.data.get("answers")
        if attempt_id is None or answers is None:
            return self.bad_request("attempt_id and answers are required.")
        try:
            attempt_id = int(attempt_id)
        except (TypeError, ValueError):
            return self.send_response(
                True, "bad_request", {"details": "Invalid attempt_id"}, status=400
            )

        idem_key = _idempotency_key_from_request(request)

        attempt_unlocked = models.QuizAttempt.objects.filter(
            id=attempt_id, quiz=quiz, user=user
        ).first()
        if not attempt_unlocked:
            return self.not_found()

        if attempt_unlocked.submitted_at:
            if idem_key and attempt_unlocked.submit_idempotency_key == idem_key:
                return _submit_success_response(self, request, attempt_unlocked, quiz)
            return self.send_response(
                True,
                "bad_request",
                {"details": "Attempt already submitted."},
                status=400,
            )

        forbidden = take_flow_forbidden_detail(user, quiz, in_progress=attempt_unlocked)
        if forbidden:
            return self.send_response(
                True, "forbidden", {"details": forbidden}, status=403
            )

        fib_slots_prefetch = Prefetch(
            "fill_blank_slots",
            queryset=models.QuestionFillBlankSlot.objects.order_by(
                "display_order", "id"
            ).prefetch_related(
                Prefetch(
                    "acceptable_answers",
                    queryset=models.QuestionFillBlankAcceptableAnswer.objects.order_by(
                        "display_order", "id"
                    ),
                )
            ),
        )
        all_questions = list(
            models.Question.objects.filter(quiz_id=quiz.id).prefetch_related(
                "options",
                fib_slots_prefetch,
            )
        )
        answers_map = answers if isinstance(answers, dict) else {}
        submit_time = timezone.now()
        deadline = attempt_unlocked.started_at + timedelta(minutes=quiz.allowed_minutes)
        overdue_seconds = max(0, int((submit_time - deadline).total_seconds()))

        with transaction.atomic():
            attempt = (
                models.QuizAttempt.objects.select_for_update()
                .filter(id=attempt_id, quiz=quiz, user=user)
                .first()
            )
            if not attempt:
                return self.not_found()
            if attempt.submitted_at:
                if idem_key and attempt.submit_idempotency_key == idem_key:
                    return _submit_success_response(self, request, attempt, quiz)
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "Attempt already submitted."},
                    status=400,
                )

            models.AttemptAnswer.objects.filter(attempt=attempt).delete()
            for question in all_questions:
                raw = answers_map.get(str(question.id), answers_map.get(question.id))
                response_text, option_ids = _parse_client_answer_for_question(
                    question, raw
                )
                valid_ids = set(question.options.values_list("id", flat=True))
                selected = []
                for x in option_ids:
                    try:
                        oid = int(x)
                    except (TypeError, ValueError):
                        continue
                    if oid in valid_ids:
                        selected.append(oid)
                if question.question_type == models.Question.QuestionType.SINGLE_CHOICE:
                    selected = selected[:1]
                aa = models.AttemptAnswer.objects.create(
                    attempt=attempt,
                    question=question,
                    score=0,
                    response_text=response_text,
                )
                if selected:
                    aa.selected_options.set(selected)

            grade_attempt(attempt)
            attempt.submitted_at = submit_time
            attempt.overdue_seconds = overdue_seconds
            update_fields = ["submitted_at", "updated_at", "overdue_seconds"]
            if idem_key:
                attempt.submit_idempotency_key = idem_key
                update_fields.append("submit_idempotency_key")
            attempt.save(update_fields=update_fields)

        return _submit_success_response(self, request, attempt, quiz)


class QuizAttemptEssayAnswerPatchView(RBACView):
    """Staff: set score for an essay AttemptAnswer on a submitted attempt."""

    name = "Quiz V3 essay answer grade"
    required_permissions = {"PATCH": "quiz.view_responses"}

    def patch(self, request: Request, attempt_id: int, answer_id: int):
        user = User.get_user_from_request(request)
        attempt = (
            models.QuizAttempt.objects.filter(id=attempt_id)
            .select_related("quiz")
            .first()
        )
        if not attempt:
            return self.not_found()
        if not can_manage_quiz_v3(user, attempt.quiz):
            return self.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if not attempt.submitted_at:
            return self.bad_request("Attempt must be submitted before grading essays.")

        aa = (
            models.AttemptAnswer.objects.filter(id=answer_id, attempt=attempt)
            .select_related("question")
            .first()
        )
        if not aa:
            return self.not_found()
        if aa.question.question_type != models.Question.QuestionType.ESSAY:
            return self.bad_request("This endpoint is only for essay answers.")

        score_raw = request.data.get("score")
        feedback_raw = request.data.get("feedback")
        comments_raw = request.data.get("comments")
        if score_raw is None and feedback_raw is None and comments_raw is None:
            return self.bad_request("Provide score, feedback, and/or comments.")
        if comments_raw is not None and not isinstance(comments_raw, list):
            return self.bad_request("comments must be a list.")
        if feedback_raw is not None and not isinstance(feedback_raw, dict):
            return self.bad_request("feedback must be a TipTap document object.")
        score_d: Decimal | None = None
        if score_raw is not None:
            try:
                score_d = Decimal(str(score_raw))
            except (InvalidOperation, TypeError, ValueError):
                return self.send_response(
                    True, "bad_request", {"details": "Invalid score."}, status=400
                )
            max_pts = Decimal(str(aa.question.points))
            if score_d < 0 or score_d > max_pts:
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": f"Score must be between 0 and {aa.question.points}."},
                    status=400,
                )

        with transaction.atomic():
            if comments_raw is not None:
                res = apply_comments_diff(aa, comments_raw, by_user=user)
                if res["errors"]:
                    return self.send_response(
                        True,
                        "bad_request",
                        {"details": "Invalid comments.", "errors": res["errors"]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            update_fields: list[str] = []
            if feedback_raw is not None:
                aa.feedback = feedback_raw
                update_fields.append("feedback")
            if score_raw is not None:
                aa.score = score_d  # type: ignore[assignment]
                aa.graded_at = timezone.now()
                aa.graded_by = user
                update_fields.extend(["score", "graded_at", "graded_by"])
            if update_fields:
                update_fields.append("updated_at")
                aa.save(update_fields=list(dict.fromkeys(update_fields)))
            if score_raw is not None:
                recalculate_attempt_totals(attempt)

        aa_fresh = (
            models.AttemptAnswer.objects.filter(id=aa.id)
            .select_related("question")
            .prefetch_related(
                Prefetch(
                    "essay_comments",
                    queryset=models.EssayComment.objects.order_by("id"),
                )
            )
            .first()
        )
        ser = sz.AttemptAnswerSerializer(aa_fresh, expand=["question"])
        return self.send_response(False, "success", {"data": ser.data}, status=200)


class QuizAttemptWaiveEssayGradingView(RBACView):
    """Staff: set or clear essay grading waiver on a submitted attempt."""

    name = "Quiz V3 attempt waive essay grading"
    required_permissions = {"POST": "quiz.view_responses", "DELETE": "quiz.view_responses"}

    def _load(self, request: Request, attempt_id: int):
        user = User.get_user_from_request(request)
        attempt = (
            models.QuizAttempt.objects.filter(id=attempt_id)
            .select_related("quiz")
            .first()
        )
        if not attempt:
            return None, None, self.send_response(True, "not_found", {}, status=404)
        if not can_manage_quiz_v3(user, attempt.quiz):
            return (
                None,
                None,
                self.send_response(
                    True, "forbidden", {"details": "Forbidden"}, status=403
                ),
            )
        if not attempt.submitted_at:
            return (
                None,
                None,
                self.send_response(
                    True,
                    "bad_request",
                    {"details": "Attempt must be submitted."},
                    status=400,
                ),
            )
        return user, attempt, None

    def post(self, request: Request, attempt_id: int):
        user, attempt, err = self._load(request, attempt_id)
        if err:
            return err
        attempt.essay_grading_waived_at = timezone.now()
        attempt.essay_grading_waived_by = user
        attempt.save(
            update_fields=[
                "essay_grading_waived_at",
                "essay_grading_waived_by",
                "updated_at",
            ]
        )
        ser = sz.QuizAttemptSerializer(
            attempt, expand=["user"], context={"request": request}
        )
        return self.send_response(False, "success", {"data": ser.data}, status=200)

    def delete(self, request: Request, attempt_id: int):
        _, attempt, err = self._load(request, attempt_id)
        if err:
            return err
        if models.QuizResult.objects.filter(attempt=attempt).exists():
            return self.bad_request(
                "Unrelease this attempt's results before clearing the acknowledgment."
            )
        attempt.essay_grading_waived_at = None
        attempt.essay_grading_waived_by = None
        attempt.save(
            update_fields=[
                "essay_grading_waived_at",
                "essay_grading_waived_by",
                "updated_at",
            ]
        )
        ser = sz.QuizAttemptSerializer(
            attempt, expand=["user"], context={"request": request}
        )
        return self.send_response(False, "success", {"data": ser.data}, status=200)


class QuizBulkWaiveEssayGradingView(RBACView):
    """Staff: waive essay grading (acknowledge ungraded as 0) for many attempts."""

    name = "Quiz V3 bulk waive essay grading"
    required_permissions = {"POST": "quiz.view_responses"}

    def post(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        quiz, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        attempt_ids = request.data.get("attempt_ids")
        if not isinstance(attempt_ids, list):
            return self.bad_request("attempt_ids must be a list of integers.")
        try:
            int_ids = [int(x) for x in attempt_ids]
        except (TypeError, ValueError):
            return self.bad_request("attempt_ids must be a list of integers.")
        now = timezone.now()
        count = models.QuizAttempt.objects.filter(
            quiz=quiz,
            id__in=int_ids,
            submitted_at__isnull=False,
            essay_grading_waived_at__isnull=True,
        ).update(
            essay_grading_waived_at=now,
            essay_grading_waived_by=user,
            updated_at=now,
        )
        return self.send_response(
            False, "success", {"data": {"waived_count": count}}, status=200
        )


class QuizReleaseView(RBACView):
    """Staff: release results for selected attempts."""

    name = "Quiz V3 release attempts"
    required_permissions = {"POST": "grade.manage"}

    def post(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        quiz, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        attempt_ids = request.data.get("attempt_ids")
        if not isinstance(attempt_ids, list):
            return self.bad_request("attempt_ids must be a list of integers.")
        try:
            int_ids = [int(x) for x in attempt_ids]
        except (TypeError, ValueError):
            return self.bad_request("attempt_ids must be a list of integers.")
        result = release_attempts(quiz, int_ids, by_user=user)
        return self.send_response(False, "success", {"data": result}, status=200)


class QuizResultDeleteView(RBACView):
    """Staff: unrelease results for one student on a quiz."""

    name = "Quiz V3 result delete"
    required_permissions = {"DELETE": "grade.manage"}

    def delete(self, request: Request, quiz_id: int, user_id: int):
        staff = User.get_user_from_request(request)
        quiz, err = get_quiz_for_management(staff, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        unrelease_for_user(quiz, user_id)
        return self.send_response(
            False, "success", {"data": {"unreleased": True}}, status=200
        )


# --- Attempts ---


class QuizAttemptListForQuizView(RBACView):
    name = "Quiz attempts for quiz"
    required_permissions = {"GET": "quiz.view_responses"}

    def get(self, request: Request, quiz_id: int):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        essay_pending = models.AttemptAnswer.objects.filter(
            attempt_id=OuterRef("pk"),
            question__question_type=models.Question.QuestionType.ESSAY,
            graded_at__isnull=True,
        )
        qs = (
            models.QuizAttempt.objects.filter(
                quiz_id=quiz_id, submitted_at__isnull=False
            )
            .select_related("user", "essay_grading_waived_by")
            .annotate(_has_pending_essay_grading=Exists(essay_pending))
            .annotate(
                _is_released=Exists(
                    models.QuizResult.objects.filter(attempt_id=OuterRef("pk"))
                )
            )
            .annotate(
                _released_at=Subquery(
                    models.QuizResult.objects.filter(attempt_id=OuterRef("pk")).values(
                        "released_at"
                    )[:1]
                )
            )
            .order_by("-submitted_at", "-id")
        )
        ser = sz.QuizAttemptSerializer(qs, many=True, expand=["user"])
        return self.send_response(False, "success", {"data": ser.data}, status=200)


class QuizAttemptSearchView(RBACSearchView):
    name = "Quiz attempt search"
    model = models.QuizAttempt
    serializer = sz.QuizAttemptSerializer
    required_permissions = {"POST": "quiz.view_responses"}

    def augment_search_queryset(
        self, queryset: QuerySet, expand: list, is_csv: bool
    ) -> QuerySet:
        """Batch release/eligibility fields and nested answer relations (search list N+1)."""
        if is_csv:
            return queryset

        essay_pending = models.AttemptAnswer.objects.filter(
            attempt_id=OuterRef("pk"),
            question__question_type=models.Question.QuestionType.ESSAY,
            graded_at__isnull=True,
        )
        queryset = queryset.select_related("user", "essay_grading_waived_by").annotate(
            _has_pending_essay_grading=Exists(essay_pending),
            _is_released=Exists(
                models.QuizResult.objects.filter(attempt_id=OuterRef("pk"))
            ),
            _released_at=Subquery(
                models.QuizResult.objects.filter(attempt_id=OuterRef("pk")).values(
                    "released_at"
                )[:1]
            ),
        )

        if "answers" in expand:
            answer_qs = models.AttemptAnswer.objects.select_related(
                "question", "graded_by"
            ).prefetch_related(
                "selected_options",
                Prefetch(
                    "essay_comments",
                    queryset=models.EssayComment.objects.select_related(
                        "created_by"
                    ).order_by("id"),
                ),
            )
            queryset = queryset.prefetch_related(
                Prefetch("answers", queryset=answer_qs)
            )

        return queryset

    def post(self, request: Request, quiz_id: int, *args, **kwargs):
        user = User.get_user_from_request(request)
        _, err = get_quiz_for_management(user, quiz_id)
        if err:
            return quiz_management_error_response(self, err)
        return super().post(
            request,
            filter_ids=list(
                models.QuizAttempt.objects.filter(quiz_id=quiz_id).values_list(
                    "id", flat=True
                )
            ),
        )


class QuizAttemptDetailsView(RBACView):
    name = "Quiz attempt detail"
    rbac_decision = "authenticated_only"

    def get(self, request: Request, obj_id: int):
        user = User.get_user_from_request(request)
        attempt = _quiz_attempt_detail_queryset().filter(id=obj_id).first()
        if not attempt:
            return self.send_response(
                True,
                "not_found",
                {"details": f"QuizAttempt with id {obj_id} does not exist."},
                status=404,
            )
        if attempt.user_id != user.id and not can_manage_quiz_v3(user, attempt.quiz):
            return self.send_response(
                True, "forbidden", {"details": "Forbidden"}, status=403
            )
        if (
            attempt.user_id == user.id
            and not can_manage_quiz_v3(user, attempt.quiz)
            and quiz_has_essay_questions(attempt.quiz_id)
            and not bool(getattr(attempt, "_is_released", False))
        ):
            return self.send_response(
                False,
                "success",
                {
                    "data": {
                        "review_mode": "awaiting_release",
                        "attempt_id": attempt.id,
                        "submitted_at": attempt.submitted_at,
                        "overdue_seconds": attempt.overdue_seconds,
                    }
                },
                status=status.HTTP_200_OK,
            )
        if (
            attempt.user_id == user.id
            and not can_manage_quiz_v3(user, attempt.quiz)
            and not attempt.quiz.can_show_answers_afterwards
        ):
            payload = _learner_attempt_summary_payload(
                attempt,
                attempt.quiz.title,
                include_essay_feedback=quiz_has_essay_questions(attempt.quiz_id),
            )
            return self.ok(payload)
        query_params = self.get_query_params(request)
        query_params.pop("sorts", None)
        expand = query_params.pop("expand", None)
        if not expand:
            expand = [
                "answers",
                "answers.question",
                "answers.question.options",
                "quiz",
                "user",
            ]
        ser = sz.QuizAttemptSerializer(
            attempt,
            expand=expand,
            context={"request": request, "view": self},
            **query_params,
        )
        data = dict(ser.data)
        data["review_mode"] = "full"
        return self.ok(data)
