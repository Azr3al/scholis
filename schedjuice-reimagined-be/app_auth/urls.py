from django.urls import path

from app_auth import certification_views, teaching_subject_views, views
from app_auth import user_insights_views
from app_auth.completeness_views import UserCompletenessView
from app_auth.home_dashboard_views import HomeDashboardView
from app_auth.home_facts_views import HomeFactsView
from app_auth.id_photo_url_views import IdPhotoUrlsView
from app_auth.field_change_views import UserFieldChangeListView
from app_auth.mobile_device_views import (
    MobileDeviceBulkRevokeView,
    MobileDeviceDetailView,
    MobileDeviceListView,
    MobileDeviceRevokeStaleView,
    MobileDeviceRevokeView,
    UserMobileDeviceListView,
)
from app_auth.user_image_views import (
    UserImageListCreateView,
    UserImageResolveView,
    UserImageUrlsView,
)
from app_ai.user_views import UserAIPreferencesView, UserAIUsageView
from app_course import assessment_views, views as course_views

urlpatterns = [
    path("users", views.UserListView.as_view(), name="user-list"),
    path("users/<int:user_id>/resend-welcome-email", views.UserResendWelcomeEmailView.as_view(), name="user-resend-welcome-email"),
    path("users/<int:user_id>/resign", views.UserResignView.as_view(), name="user-resign"),
    path(
        "users/<int:user_id>/create-microsoft-account",
        views.UserCreateMicrosoftAccountView.as_view(),
        name="user-create-microsoft-account",
    ),
    path(
        "users/<int:user_id>/link-microsoft-account",
        views.UserLinkMicrosoftAccountView.as_view(),
        name="user-link-microsoft-account",
    ),
    path(
        "users/<int:user_id>/microsoft-suggestions",
        views.UserMicrosoftSuggestionsView.as_view(),
        name="user-microsoft-suggestions",
    ),
    path(
        "users/<int:user_id>/telegram-link-token",
        views.UserTelegramLinkTokenView.as_view(),
        name="user-telegram-link-token",
    ),
    path(
        "users/<int:user_id>/unlink-telegram",
        views.UserUnlinkTelegramView.as_view(),
        name="user-unlink-telegram",
    ),
    path(
        "users/<int:user_id>/unlink-google",
        views.UserUnlinkGoogleView.as_view(),
        name="user-unlink-google",
    ),
    path("users/<int:obj_id>", views.UserDetailsView.as_view(), name="user-details"),
    path("users/<int:user_id>/assignments", course_views.UserAssignmentView.as_view(), name="user-assignments"),
    path(
        "users/<int:user_id>/assessments",
        assessment_views.UserAssessmentsSummaryView.as_view(),
        name="user-assessments-summary",
    ),
    path(
        "users/<int:user_id>/teaching-assessments",
        assessment_views.UserTeachingAssessmentsView.as_view(),
        name="user-teaching-assessments",
    ),
    path("users/search", views.UserSearchView.as_view(), name="user-search"),
    path("users/suggest", views.UserSuggestView.as_view(), name="user-suggest"),
    path(
        "users/assign-role-bulk",
        views.UserAssignRoleBulkView.as_view(),
        name="user-assign-role-bulk",
    ),
    path("users/resolve-bulk", views.UserResolveBulkView.as_view(), name="user-resolve-bulk"),
    path("users/match-bulk", views.UserMatchBulkView.as_view(), name="user-match-bulk"),
    path(
        "users/insights/duplicates/search",
        user_insights_views.UserInsightsDuplicateSearchView.as_view(),
        name="user-insights-duplicates-search",
    ),
    path(
        "users/microsoft-sign-in-activity",
        user_insights_views.MicrosoftSignInActivityView.as_view(),
        name="microsoft-sign-in-activity",
    ),
    path(
        "users/insights/merge/preview",
        user_insights_views.UserInsightsMergePreviewView.as_view(),
        name="user-insights-merge-preview",
    ),
    path(
        "users/insights/merge/apply",
        user_insights_views.UserInsightsMergeApplyView.as_view(),
        name="user-insights-merge-apply",
    ),
    path(
        "users/available-for-timeslot",
        views.UsersAvailableForTimeslotView.as_view(),
        name="users-available-for-timeslot",
    ),
    path("users/profile", views.UserProfileView.as_view(), name="user-profile"),
    path(
        "users/<int:user_id>/completeness",
        UserCompletenessView.as_view(),
        name="user-completeness",
    ),
    path(
        "users/<int:user_id>/certifications",
        certification_views.UserCertificationListCreateView.as_view(),
        name="user-certifications",
    ),
    path(
        "users/<int:user_id>/certifications/<int:cert_id>",
        certification_views.UserCertificationDetailView.as_view(),
        name="user-certification-detail",
    ),
    path(
        "users/<int:user_id>/teaching-subjects/search",
        teaching_subject_views.UserTeachingSubjectSearchView.as_view(),
        name="user-teaching-subjects-search",
    ),
    path(
        "users/<int:user_id>/teaching-subjects",
        teaching_subject_views.UserTeachingSubjectListCreateView.as_view(),
        name="user-teaching-subjects",
    ),
    path(
        "users/<int:user_id>/teaching-subjects/<int:row_id>",
        teaching_subject_views.UserTeachingSubjectDetailView.as_view(),
        name="user-teaching-subject-detail",
    ),
    path(
        "users/<int:user_id>/ai-usage",
        UserAIUsageView.as_view(),
        name="user-ai-usage",
    ),
    path(
        "users/<int:user_id>/ai-preferences",
        UserAIPreferencesView.as_view(),
        name="user-ai-preferences",
    ),
    path(
        "users/<int:user_id>/field-changes",
        UserFieldChangeListView.as_view(),
        name="user-field-changes",
    ),
    path(
        "users/<int:user_id>/mobile-devices",
        UserMobileDeviceListView.as_view(),
        name="user-mobile-devices",
    ),
    path("mobile-devices", MobileDeviceListView.as_view(), name="mobile-devices"),
    path(
        "mobile-devices/bulk-revoke",
        MobileDeviceBulkRevokeView.as_view(),
        name="mobile-devices-bulk-revoke",
    ),
    path(
        "mobile-devices/revoke-stale",
        MobileDeviceRevokeStaleView.as_view(),
        name="mobile-devices-revoke-stale",
    ),
    path(
        "mobile-devices/<int:device_id>/revoke",
        MobileDeviceRevokeView.as_view(),
        name="mobile-device-revoke",
    ),
    path(
        "mobile-devices/<int:device_id>",
        MobileDeviceDetailView.as_view(),
        name="mobile-device-detail",
    ),
    path(
        "users/<int:user_id>/user-images/resolve",
        UserImageResolveView.as_view(),
        name="user-images-resolve",
    ),
    path(
        "users/<int:user_id>/user-images",
        UserImageListCreateView.as_view(),
        name="user-images",
    ),
    path("user-image-urls", UserImageUrlsView.as_view(), name="user-image-urls"),
    path("id-photo-urls", IdPhotoUrlsView.as_view(), name="id-photo-urls"),
    path("home/dashboard", HomeDashboardView.as_view(), name="home-dashboard"),
    path("home/facts", HomeFactsView.as_view(), name="home-facts"),
    path("expo-token", views.ExpoTokenUpsertView.as_view(), name="expo-token-upsert"),
    path(
        "expo-token/deactivate",
        views.ExpoTokenDeactivateView.as_view(),
        name="expo-token-deactivate",
    ),
    path(
        "web-push-subscriptions",
        views.WebPushSubscriptionUpsertView.as_view(),
        name="web-push-subscription-upsert",
    ),
    path(
        "web-push-subscriptions/deactivate",
        views.WebPushSubscriptionDeactivateView.as_view(),
        name="web-push-subscription-deactivate",
    ),
    path("visibilities", views.VisibilityListView.as_view(), name="visibility-list"),
    path(
        "visibilities/<int:obj_id>",
        views.VisibilityDetailsView.as_view(),
        name="visibility-details",
    ),
    path(
        "visibilities/search",
        views.VisibilitySearchView.as_view(),
        name="visibility-search",
    ),
    path("data-verification-requests", views.DataVerificationRequestListView.as_view(),
         name="data-verification-request-list"),
    path("data-verification-requests/<int:obj_id>", views.DataVerificationRequestDetailsView.as_view(),
         name="data-verification-request-details"),
    path("data-verification-requests/search", views.DataVerificationRequestSearchView.as_view(),
         name="data-verification-request-search"),
    path("user-data-verification-requests", views.UserDataVerificationRequestListView.as_view(),
         name="user-data-verification-request-list"),
    path("user-data-verification-requests/<int:obj_id>", views.UserDataVerificationRequestDetailsView.as_view(),
         name="user-data-verification-request-details"),
    path("user-data-verification-requests/search", views.UserDataVerificationRequestSearchView.as_view(),
         name="user-data-verification-request-search"),
    path("login", views.LoginView.as_view(), name="login"),
    path("ms-login", views.MSLoginView.as_view(), name="ms-login"),
    path("telegram-login", views.TelegramLoginView.as_view(), name="telegram-login"),
    path(
        "telegram-login/bot/session",
        views.TelegramBotLoginSessionView.as_view(),
        name="telegram-login-bot-session",
    ),
    path(
        "telegram-login/bot/verify",
        views.TelegramBotLoginVerifyView.as_view(),
        name="telegram-login-bot-verify",
    ),
    path("token/refresh", views.TokenRefreshView.as_view(), name="token-refresh"),
    path("logout", views.LogoutView.as_view(), name="logout"),
    path("logout-all", views.LogoutAllView.as_view(), name="logout-all"),
    path("password-reset/oauth", views.OauthPasswordResetView.as_view(), name="oauth-password-reset"),
    path("password-reset", views.PasswordResetView.as_view(), name="password-reset"),
    path(
        "password-reset/request",
        views.PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
    path("verification-code", views.VerificationCodeRequestView.as_view(), name="verification-code-request"),
    path("verification-code/validate", views.VerificationCodeValidateView.as_view(), name="verification-code-validate"),
    path("search-user/<str:email>", views.SearchUserByEmailView.as_view(), name="search-user-by-email"),
    path(
        "registration/form-config",
        views.RegistrationFormConfigView.as_view(),
        name="registration-form-config",
    ),
    path("self-register/student", views.StudentSelfRegisterView.as_view(), name="self-register"),
    path("activate-account/<str:user_id>", views.StudentActivationView.as_view(), name="activate-account"),
    path(
        "public/people/<str:slug>",
        views.PublicProfileView.as_view(),
        name="public-profile",
    ),
    path(
        "public/id-verify/<str:token>",
        views.PublicIdVerifyView.as_view(),
        name="public-id-verify",
    ),
]
