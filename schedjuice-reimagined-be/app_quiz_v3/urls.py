from django.urls import path

from app_quiz_v3 import views

urlpatterns = [
    path(
        "quiz-questions/search",
        views.QuizQuestionBankSearchView.as_view(),
        name="quiz-v3-question-bank-search",
    ),
    path("quiz-categories/search", views.QuizCategorySearchView.as_view(), name="quiz-v3-category-search"),
    path("quiz-categories/<int:obj_id>", views.QuizCategoryDetailsView.as_view(), name="quiz-v3-category-details"),
    path("quiz-categories", views.QuizCategoryListView.as_view(), name="quiz-v3-category-list"),
    path(
        "quizzes/take/<uuid:code>/preview",
        views.QuizTakePreviewView.as_view(),
        name="quiz-v3-take-preview",
    ),
    path(
        "quizzes/take/<uuid:code>/begin",
        views.QuizTakeBeginView.as_view(),
        name="quiz-v3-take-begin",
    ),
    path(
        "quizzes/take/<uuid:code>/progress",
        views.QuizTakeProgressView.as_view(),
        name="quiz-v3-take-progress",
    ),
    path(
        "quizzes/take/<uuid:code>/submit",
        views.QuizSubmitView.as_view(),
        name="quiz-v3-submit",
    ),
    path(
        "quizzes/take/<uuid:code>/attempts/<int:attempt_id>",
        views.QuizTakeAttemptResultView.as_view(),
        name="quiz-v3-take-attempt-result",
    ),
    path(
        "quizzes/take/<uuid:code>",
        views.QuizTakeView.as_view(),
        name="quiz-v3-take",
    ),
    path(
        "quizzes/<int:quiz_id>/author-preview",
        views.QuizAuthorPreviewView.as_view(),
        name="quiz-v3-author-preview",
    ),
    path(
        "quizzes/<int:quiz_id>/questions/reorder",
        views.QuizQuestionReorderView.as_view(),
        name="quiz-v3-questions-reorder",
    ),
    path(
        "quizzes/<int:quiz_id>/editor-sync",
        views.QuizEditorSyncView.as_view(),
        name="quiz-v3-editor-sync",
    ),
    path(
        "quizzes/<int:quiz_id>/questions/<int:question_id>",
        views.QuizQuestionDetailView.as_view(),
        name="quiz-v3-question-detail",
    ),
    path(
        "quizzes/<int:quiz_id>/questions",
        views.QuizQuestionListView.as_view(),
        name="quiz-v3-questions-list",
    ),
    path(
        "quizzes/<int:quiz_id>/attempts/search",
        views.QuizAttemptSearchView.as_view(),
        name="quiz-v3-attempts-search",
    ),
    path(
        "quizzes/<int:quiz_id>/attempts",
        views.QuizAttemptListForQuizView.as_view(),
        name="quiz-v3-attempts-list",
    ),
    path(
        "quizzes/attempts/<int:attempt_id>/answers/<int:answer_id>",
        views.QuizAttemptEssayAnswerPatchView.as_view(),
        name="quiz-v3-attempt-essay-grade",
    ),
    path(
        "quizzes/attempts/<int:attempt_id>/waive-essay-grading",
        views.QuizAttemptWaiveEssayGradingView.as_view(),
        name="quiz-v3-attempt-waive-essay",
    ),
    path(
        "quizzes/<int:quiz_id>/waive-essay-grading-bulk",
        views.QuizBulkWaiveEssayGradingView.as_view(),
        name="quiz-v3-bulk-waive-essay",
    ),
    path(
        "quizzes/<int:quiz_id>/release",
        views.QuizReleaseView.as_view(),
        name="quiz-v3-release",
    ),
    path(
        "quizzes/<int:quiz_id>/results/<int:user_id>",
        views.QuizResultDeleteView.as_view(),
        name="quiz-v3-result-delete",
    ),
    path(
        "quizzes/attempts/<int:obj_id>",
        views.QuizAttemptDetailsView.as_view(),
        name="quiz-v3-attempt-detail",
    ),
    path("quizzes/search", views.QuizSearchView.as_view(), name="quiz-v3-search"),
    path("quizzes/<int:obj_id>", views.QuizDetailsView.as_view(), name="quiz-v3-details"),
    path("quizzes", views.QuizListView.as_view(), name="quiz-v3-list"),
]
