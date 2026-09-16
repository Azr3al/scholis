import uuid

from django.core.exceptions import ValidationError
from django.db import models

from app_auth.models import User
from app_course.models import Course
from utilitas.models import BaseModel


def _empty_tiptap_doc():
    return {"type": "doc", "content": []}


class QuizCategory(BaseModel):
    title = models.CharField(max_length=512)
    description = models.TextField(null=True, blank=True)


class Quiz(BaseModel):
    class QuizStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    class QuizTheme(models.TextChoices):
        SLATE = "slate", "Slate"
        FOREST = "forest", "Forest"
        OCEAN = "ocean", "Ocean"
        PLUM = "plum", "Plum"
        AMBER = "amber", "Amber"
        HIGH_CONTRAST = "high_contrast", "High contrast"

    title = models.CharField(max_length=2048)
    status = models.CharField(max_length=32, choices=QuizStatus.choices, default=QuizStatus.DRAFT)
    code = models.UUIDField(default=uuid.uuid4, editable=True, unique=True)
    version = models.PositiveIntegerField(default=1)

    can_show_answers_afterwards = models.BooleanField(default=False)
    can_navigate_questions = models.BooleanField(default=False)
    max_retakes = models.PositiveIntegerField(default=3)
    allowed_minutes = models.PositiveIntegerField(default=60)

    activation_date = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateTimeField(null=True, blank=True)

    category = models.ForeignKey(
        QuizCategory,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quizzes",
    )
    course = models.ForeignKey(
        Course,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quizzes_v3",
    )
    """When set, this quiz was duplicated from another (e.g. import into a course)."""
    source_quiz = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="derived_quizzes",
    )
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="quizzes_v3_created")

    intro_body = models.JSONField(default=_empty_tiptap_doc)
    outro_body = models.JSONField(default=_empty_tiptap_doc)
    quiz_theme = models.CharField(
        max_length=32,
        choices=QuizTheme.choices,
        default=QuizTheme.SLATE,
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    """When set, new attempts are blocked; in-progress attempts may still submit."""
    take_rate_per_minute = models.PositiveSmallIntegerField(null=True, blank=True)
    """Cap for take endpoints; null = use platform default in throttle."""


class Question(BaseModel):
    class QuestionType(models.TextChoices):
        SINGLE_CHOICE = "SINGLE_CHOICE", "Single choice"
        MULTIPLE_CHOICE = "MULTIPLE_CHOICE", "Multiple choice"
        FILL_IN_BLANK = "FILL_IN_BLANK", "Fill in the blank"
        TRUE_FALSE = "TRUE_FALSE", "True / false"
        SHORT_ANSWER = "SHORT_ANSWER", "Short answer"
        ESSAY = "ESSAY", "Essay"

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    question_type = models.CharField(max_length=32, choices=QuestionType.choices)
    body = models.JSONField(default=dict)
    body_plaintext = models.CharField(max_length=4096, blank=True, default="")
    points = models.PositiveIntegerField(default=1)
    display_order = models.PositiveIntegerField(default=0)
    is_partial_scoring_enabled = models.BooleanField(default=False)
    """When False (default), blank grading compares case-insensitively after trimming."""
    is_case_sensitive = models.BooleanField(default=False)
    """For TRUE_FALSE: whether the keyed answer is True."""
    correct_true = models.BooleanField(null=True, blank=True)
    """Shown in review when solutions are visible (TipTap JSON)."""
    explanation_body = models.JSONField(default=_empty_tiptap_doc)

    class Meta:
        ordering = ["display_order", "id"]

    def clean(self):
        super().clean()
        if (
            self.question_type == self.QuestionType.SINGLE_CHOICE
            and self.is_partial_scoring_enabled
        ):
            raise ValidationError(
                {"is_partial_scoring_enabled": "Only applies to multiple-choice questions."}
            )
        if (
            self.question_type == self.QuestionType.FILL_IN_BLANK
            and self.is_partial_scoring_enabled
        ):
            raise ValidationError(
                {"is_partial_scoring_enabled": "Does not apply to fill-in-the-blank questions."}
            )
        if self.question_type in (
            self.QuestionType.TRUE_FALSE,
            self.QuestionType.SHORT_ANSWER,
            self.QuestionType.ESSAY,
        ) and self.is_partial_scoring_enabled:
            raise ValidationError(
                {"is_partial_scoring_enabled": "Does not apply to this question type."}
            )


class QuestionOption(BaseModel):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    body = models.JSONField(default=_empty_tiptap_doc)
    is_correct = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)


class QuestionFillBlankSlot(BaseModel):
    """One scored gap in a fill-in-the-blank prompt; `blank_uuid` matches TipTap `quizFillBlank.attrs.blankId`."""

    class AnswerMode(models.TextChoices):
        TYPED = "typed", "Typed answer"
        SINGLE_CHOICE = "single_choice", "Single choice"

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="fill_blank_slots")
    blank_uuid = models.UUIDField(db_index=True)
    points = models.PositiveIntegerField(default=1)
    display_order = models.PositiveIntegerField(default=0)
    answer_mode = models.CharField(
        max_length=32,
        choices=AnswerMode.choices,
        default=AnswerMode.TYPED,
    )
    """Last time typed (acceptable-answer) configuration was saved."""
    typed_config_at = models.DateTimeField(null=True, blank=True)
    """Last time single-choice configuration was saved."""
    single_choice_config_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["display_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["question", "blank_uuid"], name="uniq_question_fill_blank_uuid")
        ]


class QuestionFillBlankAcceptableAnswer(BaseModel):
    slot = models.ForeignKey(
        QuestionFillBlankSlot,
        on_delete=models.CASCADE,
        related_name="acceptable_answers",
    )
    body = models.JSONField(default=_empty_tiptap_doc)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "id"]


class QuestionFillBlankChoiceOption(BaseModel):
    """Plain-text distractors for a fill-blank when `answer_mode` is single_choice."""

    slot = models.ForeignKey(
        QuestionFillBlankSlot,
        on_delete=models.CASCADE,
        related_name="choice_options",
    )
    text = models.CharField(max_length=2048)
    is_correct = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "id"]


class QuestionShortAnswerAcceptableAnswer(BaseModel):
    """Plain-text acceptable answers for SHORT_ANSWER questions."""

    question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name="short_answer_acceptables",
    )
    body = models.TextField()
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["display_order", "id"]


class QuizAttempt(BaseModel):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="quiz_attempts_v3")
    score = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    max_score = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField()
    submitted_at = models.DateTimeField(null=True, blank=True)
    """Seconds after the time limit (started_at + allowed_minutes) at submit; 0 if submitted on time."""
    overdue_seconds = models.PositiveIntegerField(default=0)
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    submit_idempotency_key = models.CharField(max_length=64, null=True, blank=True)
    essay_grading_waived_at = models.DateTimeField(null=True, blank=True)
    """When set, staff acknowledged ungraded essays count as 0 for release eligibility."""
    essay_grading_waived_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quiz_v3_essay_waivers",
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["submit_idempotency_key"],
                condition=models.Q(submit_idempotency_key__isnull=False),
                name="uniq_quizattempt_submit_idempotency_key_nonnull",
            ),
        ]


class AttemptAnswer(BaseModel):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    """Learner-flagged \"review later\"; persisted via take progress PATCH."""
    marked_review = models.BooleanField(default=False)
    score = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    selected_options = models.ManyToManyField(QuestionOption, related_name="attempt_answers", blank=True)
    """Fill-in-the-blank: map `{blank_uuid: answer text}`. Choice questions use empty `{}`."""
    response_text = models.JSONField(default=dict, blank=True)
    graded_at = models.DateTimeField(null=True, blank=True)
    graded_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quiz_v3_attempt_answers_graded",
    )
    feedback = models.JSONField(default=_empty_tiptap_doc)
    """TipTap JSON shown to the student under the essay answer once results are released. Only meaningful for ESSAY questions."""


class QuizResult(BaseModel):
    """Per-quiz, per-student pointer to the released attempt (essay quizzes — results not visible until release)."""

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="released_results")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="quiz_v3_released_results")
    attempt = models.ForeignKey(
        QuizAttempt,
        on_delete=models.PROTECT,
        related_name="quiz_results",
    )
    released_at = models.DateTimeField()
    released_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quiz_v3_results_released",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["quiz", "user"], name="uniq_quizresult_quiz_user"),
        ]


class EssayComment(BaseModel):
    """Range-anchored teacher note on an essay answer (plain text body)."""

    attempt_answer = models.ForeignKey(
        AttemptAnswer,
        on_delete=models.CASCADE,
        related_name="essay_comments",
    )
    anchor_start = models.PositiveIntegerField()
    """Inclusive character offset in essay plain text."""
    anchor_end = models.PositiveIntegerField()
    """Exclusive."""
    body = models.TextField()
    created_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quiz_v3_essay_comments_created",
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(anchor_end__gt=models.F("anchor_start")),
                name="ck_essay_comment_anchor_range",
            ),
        ]
