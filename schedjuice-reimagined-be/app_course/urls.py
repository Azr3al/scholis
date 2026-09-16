from django.urls import path

from app_attendance.views import CheckinHistoryBootstrapView
from app_announcement import staging_views
from app_course import assessment_views, views

urlpatterns = [
    path("campuses", views.CampusListView.as_view(), name="campus-list"),
    path(
        "campuses/<int:obj_id>",
        views.CampusDetailsView.as_view(),
        name="campus-details",
    ),
    path(
        "campuses/search", views.CampusSearchView.as_view(), name="campus-search"
    ),
    path("categories", views.CategoryListView.as_view(), name="category-list"),
    path(
        "categories/reorder",
        views.CategoryReorderView.as_view(),
        name="category-reorder",
    ),
    path(
        "categories/<int:obj_id>",
        views.CategoryDetailsView.as_view(),
        name="category-details",
    ),
    path(
        "categories/search", views.CategorySearchView.as_view(), name="category-search"
    ),
    path("subjects", views.SubjectListView.as_view(), name="subject-list"),
    path(
        "subjects/<int:obj_id>",
        views.SubjectDetailsView.as_view(),
        name="subject-details",
    ),
    path(
        "subjects/search", views.SubjectSearchView.as_view(), name="subject-search"
    ),
    path("programs", views.ProgramListView.as_view(), name="program-list"),
    path(
        "programs/<int:obj_id>",
        views.ProgramDetailsView.as_view(),
        name="program-details",
    ),
    path("programs/search", views.ProgramSearchView.as_view(), name="program-search"),
    path(
        "programs/<int:obj_id>/setup-structure",
        views.ProgramSetupStructureView.as_view(),
        name="program-setup-structure",
    ),
    path(
        "programs/<int:obj_id>/setup-curriculum",
        views.ProgramSetupCurriculumView.as_view(),
        name="program-setup-curriculum",
    ),
    path(
        "programs/<int:obj_id>/add-subjects",
        views.ProgramAddSubjectsView.as_view(),
        name="program-add-subjects",
    ),
    path("program-subjects", views.ProgramSubjectListView.as_view(), name="program-subject-list"),
    path(
        "program-subjects/<int:obj_id>",
        views.ProgramSubjectDetailsView.as_view(),
        name="program-subject-details",
    ),
    path(
        "program-subjects/search",
        views.ProgramSubjectSearchView.as_view(),
        name="program-subject-search",
    ),
    path(
        "program-level-subjects",
        views.ProgramLevelSubjectListView.as_view(),
        name="program-level-subject-list",
    ),
    path(
        "program-level-subjects/<int:obj_id>",
        views.ProgramLevelSubjectDetailsView.as_view(),
        name="program-level-subject-details",
    ),
    path(
        "program-level-subjects/search",
        views.ProgramLevelSubjectSearchView.as_view(),
        name="program-level-subject-search",
    ),
    path("program-levels", views.ProgramLevelListView.as_view(), name="program-level-list"),
    path(
        "program-levels/<int:obj_id>",
        views.ProgramLevelDetailsView.as_view(),
        name="program-level-details",
    ),
    path(
        "program-levels/search",
        views.ProgramLevelSearchView.as_view(),
        name="program-level-search",
    ),
    path(
        "program-level-sections",
        views.ProgramLevelSectionListView.as_view(),
        name="program-level-section-list",
    ),
    path(
        "program-level-sections/<int:obj_id>",
        views.ProgramLevelSectionDetailsView.as_view(),
        name="program-level-section-details",
    ),
    path(
        "program-level-sections/search",
        views.ProgramLevelSectionSearchView.as_view(),
        name="program-level-section-search",
    ),
    path("intakes", views.IntakeListView.as_view(), name="intake-list"),
    path(
        "intakes/<int:obj_id>",
        views.IntakeDetailsView.as_view(),
        name="intake-details",
    ),
    path("intakes/search", views.IntakeSearchView.as_view(), name="intake-search"),
    path(
        "intakes/<int:obj_id>/preview-courses",
        views.IntakePreviewCoursesView.as_view(),
        name="intake-preview-courses",
    ),
    path(
        "intakes/<int:obj_id>/generate-courses",
        views.IntakeGenerateCoursesView.as_view(),
        name="intake-generate-courses",
    ),
    path(
        "course-subjects",
        views.CourseSubjectListView.as_view(),
        name="course-subject-list",
    ),
    path(
        "course-subjects/<int:obj_id>",
        views.CourseSubjectDetailsView.as_view(),
        name="course-subject-details",
    ),
    path("courses/join/<str:join_code>", views.SearchCourseByJoinCodeView.as_view(), name="course-join"),
    path(
        "courses/join/<str:join_code>/request",
        views.StudentCourseJoinRequestView.as_view(),
        name="student-course-join-request",
    ),

    path("courses", views.CourseListView.as_view(), name="course-list"),
    path(
        "courses/<int:obj_id>", views.CourseDetailsView.as_view(), name="course-details"
    ),
    path(
        "courses/<int:course_id>/scope-overseers",
        views.CourseScopeOverseersView.as_view(),
        name="course-scope-overseers",
    ),
    path(
        "courses/<int:course_id>/pause",
        views.CoursePauseView.as_view(),
        name="course-pause",
    ),
    path(
        "courses/<int:course_id>/resume",
        views.CourseResumeView.as_view(),
        name="course-resume",
    ),
    path(
        "courses/<int:course_id>/end",
        views.CourseEndView.as_view(),
        name="course-end",
    ),
    path(
        "courses/<int:course_id>/reactivate",
        views.CourseReactivateView.as_view(),
        name="course-reactivate",
    ),
    path("courses/search", views.CourseSearchView.as_view(), name="course-search"),
    path(
        "courses/insights/search",
        views.CourseInsightsSearchView.as_view(),
        name="course-insights-search",
    ),
    path(
        "courses/<int:course_id>/data-health/fix-overlapping-events/preview",
        views.OverlapFixPreviewView.as_view(),
        name="overlap-fix-preview",
    ),
    path(
        "courses/<int:course_id>/data-health/fix-overlapping-events/apply",
        views.OverlapFixApplyView.as_view(),
        name="overlap-fix-apply",
    ),
    path(
        "courses/<int:course_id>/data-health/reschedule-overlapping-events/preview",
        views.OverlapReschedulePreviewView.as_view(),
        name="overlap-reschedule-preview",
    ),
    path(
        "courses/<int:course_id>/data-health/reschedule-overlapping-events/apply",
        views.OverlapRescheduleApplyView.as_view(),
        name="overlap-reschedule-apply",
    ),
    path("courses/suggest", views.CourseSuggestView.as_view(), name="course-suggest"),
    path(
        "courses/resolve-bulk",
        views.CourseResolveBulkView.as_view(),
        name="course-resolve-bulk",
    ),
    path(
        "courses/aggregate",
        views.CourseAggregateView.as_view(),
        name="course-aggregate",
    ),
    path(
        "courses/subject-usage",
        views.CourseSubjectUsageView.as_view(),
        name="course-subject-usage",
    ),

    path(
        "courses/<int:course_id>/create-microsoft-team",
        views.CourseCreateMicrosoftTeamView.as_view(),
        name="course-create-microsoft-team",
    ),
    path(
        "courses/<int:course_id>/link-microsoft-team",
        views.CourseLinkMicrosoftTeamView.as_view(),
        name="course-link-microsoft-team",
    ),
    path(
        "courses/<int:course_id>/microsoft-channels",
        views.CourseMicrosoftChannelsView.as_view(),
        name="course-microsoft-channels",
    ),
    path(
        "courses/<int:course_id>/announcement-attachments",
        staging_views.CourseAnnouncementAttachmentUploadView.as_view(),
        name="course-announcement-attachment-upload",
    ),
    path(
        "courses/<int:course_id>/zoom-meeting/schedule",
        views.CourseScheduleZoomMeetingView.as_view(),
        name="course-schedule-zoom-meeting",
    ),
    path(
        "courses/<int:course_id>/zoom-meeting",
        views.CourseUpdateZoomMeetingView.as_view(),
        name="course-update-zoom-meeting",
    ),
    path(
        "courses/<int:course_id>/zoom-meeting/refresh",
        views.CourseRefreshZoomMeetingView.as_view(),
        name="course-refresh-zoom-meeting",
    ),
    path(
        "courses/<int:course_id>/zoom-meeting/sync-from-schedule",
        views.CourseSyncZoomMeetingFromScheduleView.as_view(),
        name="course-sync-zoom-meeting-from-schedule",
    ),
    path(
        "courses/<int:course_id>/zoom-meeting/validate",
        views.CourseValidateZoomMeetingView.as_view(),
        name="course-validate-zoom-meeting",
    ),
    path(
        "courses/<int:course_id>/meeting-attendance-dashboard",
        views.CourseMeetingAttendanceDashboardView.as_view(),
        name="course-meeting-attendance-dashboard",
    ),
    path(
        "courses/<int:course_id>/attendance-marking",
        views.CourseAttendanceMarkingBootstrapView.as_view(),
        name="course-attendance-marking-bootstrap",
    ),
    path(
        "courses/<int:course_id>/checkin-history/bootstrap",
        CheckinHistoryBootstrapView.as_view(),
        name="course-checkin-history-bootstrap",
    ),
    # Legacy alias (same view) — prefer meeting-attendance-dashboard for new clients.
    path(
        "courses/<int:course_id>/teams-attendance-dashboard",
        views.CourseMeetingAttendanceDashboardView.as_view(),
        name="course-teams-attendance-dashboard",
    ),
    path(
        "courses/<int:course_id>/payment-assignment-month-status",
        views.CoursePaymentAssignmentMonthStatusView.as_view(),
        name="course-payment-assignment-month-status",
    ),
    path(
        "courses/<int:obj_id>/edit-events",
        views.CourseEventEditView.as_view(),
        name="course-event-edit",
    ),
    path(
        "courses/<int:course_id>/schedule/resolve-overlaps",
        views.ScheduleResolveOverlapsView.as_view(),
        name="schedule-resolve-overlaps",
    ),
    path(
        "courses/<int:course_id>/available-users",
        views.CourseAvailabilityView.as_view(),
        name="course-available-users",
    ),
    path("courses/<int:course_id>/assign-events", views.TeacherAssignView.as_view(), name="course-assign-events"),
    path(
        "courses/<int:course_id>/generate-join-code",
        views.GenerateJoinCodeView.as_view(),
        name="course-generate-join-code",
    ),
    path(
        "courses/<int:course_id>/students",
        views.CourseStudentListCreateView.as_view(),
        name="course-students",
    ),
    path(
        "courses/<int:course_id>/students/membership-history",
        views.CourseMembershipHistoryView.as_view(),
        name="course-students-membership-history",
    ),
    path(
        "courses/<int:course_id>/students/<int:user_id>",
        views.CourseStudentRemoveView.as_view(),
        name="course-student-remove",
    ),
    path(
        "courses/<int:course_id>/student-candidates/search",
        views.CourseStudentCandidateSearchView.as_view(),
        name="course-student-candidates-search",
    ),
    path(
        "courses/<int:course_id>/assessments",
        assessment_views.CourseAssessmentsListView.as_view(),
        name="course-assessments-list",
    ),
    path(
        "courses/<int:course_id>/quizzes/duplicate",
        assessment_views.QuizDuplicateToCourseView.as_view(),
        name="course-quiz-duplicate",
    ),
    path(
        "assessments/submission-tracker/search",
        assessment_views.SubmissionTrackerSearchView.as_view(),
        name="submission-tracker-search",
    ),
    path(
        "assessments/submission-tracker/detail",
        assessment_views.SubmissionTrackerDetailView.as_view(),
        name="submission-tracker-detail",
    ),
    path(
        "assigned-as-roles",
        views.AssignedAsRoleListView.as_view(),
        name="assignedasrole-list",
    ),
    path(
        "assigned-as-roles/<int:obj_id>",
        views.AssignedAsRoleDetailsView.as_view(),
        name="assignedasrole-details",
    ),
    path(
        "assigned-as-roles/search",
        views.AssignedAsRoleSearchView.as_view(),
        name="assignedasrole-search",
    ),
    path("user-courses", views.UserCourseListView.as_view(), name="usercourse-list"),
    path(
        "user-courses/<int:obj_id>",
        views.UserCourseDetailsView.as_view(),
        name="usercourse-details",
    ),
    path(
        "user-courses/search",
        views.UserCourseSearchView.as_view(),
        name="usercourse-search",
    ),
    path(
        "user-courses/management",
        views.UserCourseManagementView.as_view(),
        name="usercourse-management",
    ),
    path("events", views.EventListView.as_view(), name="event-list"),
    path("events/<int:obj_id>", views.EventDetailsView.as_view(), name="event-details"),
    path("events/search", views.EventSearchView.as_view(), name="event-search"),
    path("assignments", views.AssignmentListView.as_view(), name="assignment-list"),
    path(
        "assignments/<int:obj_id>",
        views.AssignmentDetailsView.as_view(),
        name="assignment-details",
    ),
    path(
        "assignments/search",
        views.AssignmentSearchView.as_view(),
        name="assignment-search",
    ),
    path("submissions", views.SubmissionListView.as_view(), name="submission-list"),
    path(
        "submissions/<int:obj_id>",
        views.SubmissionDetailView.as_view(),
        name="submission-details",
    ),
    path(
        "submissions/search",
        views.SubmissionSearchView.as_view(),
        name="submissions-search",
    ),
    path(
        "student-submissions/<int:submission_id>",
        views.StudentSubmissionView.as_view(),
        name="student-submission-view",
    ),
    path(
        "submissions/bulk-release",
        views.BulkReleaseSubmissionsView.as_view(),
        name="bulk-release-submissions",
    ),
    path("daily-notes", views.DailyNoteListView.as_view(), name="dailynote-list"),
    path(
        "daily-notes/<int:obj_id>",
        views.DailyNoteDetailsView.as_view(),
        name="dailynote-details",
    ),
    path(
        "daily-notes/search",
        views.DailyNoteSearchView.as_view(),
        name="dailynote-search",
    ),
    path(
        "course-histories",
        views.CourseHistoryListView.as_view(),
        name="coursehistory-list",
    ),
    path(
        "course-histories/<int:obj_id>",
        views.CourseHistoryDetailsView.as_view(),
        name="coursehistory-details",
    ),
    path(
        "course-histories/search",
        views.CourseHistorySearchView.as_view(),
        name="coursehistory-search",
    ),
    path(
        "user-attendances",
        views.UserAttendanceListView.as_view(),
        name="userattendance-list",
    ),
    path(
        "user-attendances/<int:obj_id>",
        views.UserAttendanceDetailsView.as_view(),
        name="userattendance-details",
    ),
    path(
        "user-attendances/search",
        views.UserAttendanceSearchView.as_view(),
        name="userattendance-search",
    ),
    path("user-events/<int:obj_id>", views.UserEventDetailsView.as_view(), name="userevent-details"),
    path("user-events/search", views.UserEventSearchView.as_view(), name="userevent-search"),
    path("course-join-requests", views.CourseJoinRequestListView.as_view(), name="coursejoinrequest-list"),
    path("course-join-requests/<int:obj_id>", views.CourseJoinRequestDetailsView.as_view(),
         name="coursejoinrequest-details"),
    path("course-join-requests/search", views.CourseJoinRequestSearchView.as_view(), name="coursejoinrequest-search"),
    path("recordings", views.RecordingListView.as_view(), name="recording-list"),
    path("recordings/<int:obj_id>", views.RecordingDetailsView.as_view(), name="recording-details"),
    path("recordings/<int:obj_id>/share", views.RecordingShareView.as_view(), name="recording-share"),
    path("user-recordings", views.UserUploadedRecordingListView.as_view(), name="userrecording-list"),
    path("user-recordings/<int:obj_id>", views.UserUploadedRecordingDetailsView.as_view(), name="userrecording-details"),
    path("user-recordings/<int:obj_id>/share", views.UserRecordingShareView.as_view(), name="userrecording-share"),
    path("shared-recording/<str:token>", views.SharedRecordingView.as_view(), name="shared-recording"),
]
