import json
from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch

from app_quiz_v3.models import (
    AttemptAnswer,
    Question,
    QuestionFillBlankAcceptableAnswer,
    QuestionFillBlankChoiceOption,
    QuestionFillBlankSlot,
    QuestionShortAnswerAcceptableAnswer,
    QuizAttempt,
)
from app_quiz_v3.rich_content import tiptap_doc_plaintext


def _score_single_choice(question: Question, selected_ids: set[int]) -> Decimal:
    correct = {
        o.id for o in question.options.all() if o.is_correct
    }
    if len(selected_ids) != 1:
        return Decimal("0")
    oid = next(iter(selected_ids))
    if oid in correct:
        return Decimal(question.points)
    return Decimal("0")


def _score_multiple_all_or_nothing(question: Question, selected_ids: set[int]) -> Decimal:
    correct = {o.id for o in question.options.all() if o.is_correct}
    if selected_ids == correct:
        return Decimal(question.points)
    return Decimal("0")


def _score_multiple_partial(question: Question, selected_ids: set[int]) -> Decimal:
    options = list(question.options.all())
    correct_ids = {o.id for o in options if o.is_correct}
    total_correct = len(correct_ids)
    if total_correct == 0:
        return Decimal("0")
    correct_selected = len(selected_ids & correct_ids)
    incorrect_selected = len(selected_ids - correct_ids)
    pts = Decimal(question.points)
    raw = pts * Decimal(correct_selected - incorrect_selected) / Decimal(total_correct)
    if raw < 0:
        return Decimal("0")
    if raw > pts:
        return pts
    return raw


def _parse_response_map(response_text) -> dict[str, str]:
    if response_text is None:
        return {}
    if isinstance(response_text, dict):
        return {
            str(k): (v if isinstance(v, str) else str(v)).strip()
            for k, v in response_text.items()
        }
    if isinstance(response_text, str):
        t = response_text.strip()
        if t.startswith("{"):
            try:
                obj = json.loads(t)
                if isinstance(obj, dict):
                    return {
                        str(k): (v or "").strip() if isinstance(v, str) else str(v).strip()
                        for k, v in obj.items()
                    }
            except json.JSONDecodeError:
                return {}
        return {}
    return {}


def _acceptable_answer_plaintext(body) -> str:
    """Match stored acceptable answers: TipTap JSON dict, or plain string."""
    if isinstance(body, str):
        return body.strip()
    if isinstance(body, dict):
        return tiptap_doc_plaintext(body).strip()
    return ""


def _learner_matches_acceptable(
    learner_norm: str,
    bodies: list,
    case_sensitive: bool,
) -> bool:
    for body in bodies:
        candidate = _acceptable_answer_plaintext(body)
        if not candidate:
            continue
        compare_opt = candidate if case_sensitive else candidate.casefold()
        if learner_norm == compare_opt:
            return True
    return False


def _score_fill_in_blank(question: Question, response_text, prefetched_slots: list | None = None) -> Decimal:
    if prefetched_slots is not None:
        slots = prefetched_slots
    else:
        slots = list(
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
    learner_map = _parse_response_map(response_text)
    total = Decimal("0")
    case_sensitive = question.is_case_sensitive
    for slot in slots:
        key = str(slot.blank_uuid)
        raw = (learner_map.get(key) or "").strip()
        if not raw:
            continue
        learner = raw if case_sensitive else raw.casefold()
        if slot.answer_mode == QuestionFillBlankSlot.AnswerMode.SINGLE_CHOICE:
            correct_text = None
            for co in slot.choice_options.all():
                if co.is_correct:
                    correct_text = co.text.strip()
                    break
            if not correct_text:
                continue
            compare = correct_text if case_sensitive else correct_text.casefold()
            if learner == compare:
                total += Decimal(slot.points)
            continue
        bodies = [a.body for a in slot.acceptable_answers.all()]
        if _learner_matches_acceptable(learner, bodies, case_sensitive):
            total += Decimal(slot.points)
    return total


def _score_true_false(question: Question, response_text) -> Decimal:
    if not isinstance(response_text, dict) or "value" not in response_text:
        return Decimal("0")
    if question.correct_true is None:
        return Decimal("0")
    learner = bool(response_text.get("value"))
    if learner == bool(question.correct_true):
        return Decimal(question.points)
    return Decimal("0")


def _score_short_answer(question: Question, response_text) -> Decimal:
    if not isinstance(response_text, dict):
        return Decimal("0")
    text = response_text.get("text")
    learner = (str(text) if text is not None else "").strip()
    if not learner:
        return Decimal("0")
    case_sensitive = question.is_case_sensitive
    learner_norm = learner if case_sensitive else learner.casefold()
    for acc in question.short_answer_acceptables.all():
        candidate = (acc.body or "").strip()
        if not candidate:
            continue
        compare = candidate if case_sensitive else candidate.casefold()
        if learner_norm == compare:
            return Decimal(question.points)
    return Decimal("0")


def score_question(question: Question, selected_ids: set[int]) -> Decimal:
    if question.question_type == Question.QuestionType.SINGLE_CHOICE:
        return _score_single_choice(question, selected_ids)
    if question.question_type == Question.QuestionType.MULTIPLE_CHOICE:
        if question.is_partial_scoring_enabled:
            return _score_multiple_partial(question, selected_ids)
        return _score_multiple_all_or_nothing(question, selected_ids)
    return Decimal("0")


def score_attempt_answer_row(
    aa: AttemptAnswer,
    *,
    fib_slots: list | None = None,
) -> Decimal:
    q = aa.question
    if q.question_type == Question.QuestionType.FILL_IN_BLANK:
        return _score_fill_in_blank(q, aa.response_text, prefetched_slots=fib_slots)
    if q.question_type == Question.QuestionType.TRUE_FALSE:
        return _score_true_false(q, aa.response_text)
    if q.question_type == Question.QuestionType.SHORT_ANSWER:
        return _score_short_answer(q, aa.response_text)
    if q.question_type == Question.QuestionType.ESSAY:
        if aa.graded_at:
            return aa.score
        return Decimal("0")
    selected_ids = {o.id for o in aa.selected_options.all()}
    return score_question(q, selected_ids)


@transaction.atomic
def grade_attempt(attempt: QuizAttempt) -> None:
    """Recompute scores from saved AttemptAnswer rows (batched updates)."""
    fib_prefetch = Prefetch(
        "question__fill_blank_slots",
        queryset=QuestionFillBlankSlot.objects.order_by("display_order", "id").prefetch_related(
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
        ),
    )
    sa_prefetch = Prefetch(
        "question__short_answer_acceptables",
        queryset=QuestionShortAnswerAcceptableAnswer.objects.order_by(
            "display_order", "id"
        ),
    )
    answers_qs = attempt.answers.select_related("question").prefetch_related(
        "selected_options",
        fib_prefetch,
        sa_prefetch,
        "question__options",
    )

    total_score = Decimal("0")
    max_score = 0
    to_update: list[AttemptAnswer] = []

    for aa in answers_qs:
        q = aa.question
        max_score += q.points
        fib_slots = None
        if q.question_type == Question.QuestionType.FILL_IN_BLANK:
            fib_slots = list(q.fill_blank_slots.all())
        s = score_attempt_answer_row(aa, fib_slots=fib_slots)
        aa.score = s
        total_score += s
        to_update.append(aa)

    if to_update:
        AttemptAnswer.objects.bulk_update(to_update, ["score", "updated_at"])

    attempt.score = total_score
    attempt.max_score = max_score
    attempt.save(update_fields=["score", "max_score", "updated_at"])


@transaction.atomic
def recalculate_attempt_totals(attempt: QuizAttempt) -> None:
    """Re-sum stored per-answer scores (e.g. after manual essay grading)."""
    rows = list(attempt.answers.select_related("question"))
    total_score = Decimal("0")
    max_score = 0
    for aa in rows:
        total_score += aa.score
        max_score += aa.question.points
    attempt.score = total_score
    attempt.max_score = max_score
    attempt.save(update_fields=["score", "max_score", "updated_at"])
