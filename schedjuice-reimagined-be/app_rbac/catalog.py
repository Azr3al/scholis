# app_rbac/catalog.py
from __future__ import annotations
from dataclasses import dataclass

SCHOOL = "SCHOOL"
SCHOOL_SETUP = "SCHOOL_SETUP"
PLATFORM_INTERNAL = "PLATFORM_INTERNAL"

DATA_CLASSES = ("Personal", "Financial", "Payroll", "Academic", "Operational")


@dataclass(frozen=True)
class Permission:
    code: str
    label: str
    sentence: str  # used by the Policy Overview rule synthesizer
    data_class: str
    tier: str = SCHOOL
    sensitive: bool = False


def _p(code, label, sentence, data_class, tier=SCHOOL, sensitive=False):
    return Permission(code, label, sentence, data_class, tier, sensitive)


ALL_PERMISSIONS: tuple[Permission, ...] = (
    # course
    _p("course.view", "View courses", "view courses they are connected to", "Academic"),
    _p(
        "course.view_all",
        "View all courses",
        "view every course in the school",
        "Academic",
    ),
    _p("course.create", "Create courses", "create courses", "Academic"),
    _p("course.update", "Edit courses", "edit courses", "Academic"),
    _p("course.delete", "Delete courses", "delete courses", "Academic"),
    _p(
        "course.manage_members",
        "Manage course members",
        "add or remove course members",
        "Academic",
    ),
    _p(
        "course.assign_self_events",
        "Assign self to events",
        "assign themselves to course event timeslots",
        "Academic",
    ),
    _p(
        "course.manage_content",
        "Manage course content",
        "manage course materials, announcements and recordings",
        "Academic",
    ),
    _p(
        "course.manage_all",
        "Manage all courses",
        "manage every course across the school",
        "Academic",
        sensitive=True,
    ),
    _p(
        "course.view_data_sheet",
        "View course data sheet",
        "view the course data spreadsheet",
        "Academic",
    ),
    # user
    _p("user.view", "View people", "view people they are connected to", "Personal"),
    _p(
        "user.view_all",
        "View all people",
        "view the entire people directory",
        "Personal",
        sensitive=True,
    ),
    _p("user.create", "Create users", "create user accounts", "Personal"),
    _p("user.update", "Edit users", "edit user accounts", "Personal"),
    _p("user.update_own", "Edit own profile", "edit your own profile", "Personal"),
    _p(
        "user.delete",
        "Delete users",
        "delete user accounts",
        "Personal",
        sensitive=True,
    ),
    _p(
        "user.assign_roles",
        "Assign roles",
        "assign roles to users",
        "Personal",
        sensitive=True,
    ),
    _p("user.import", "Import users", "bulk-import users", "Personal"),
    _p(
        "user.view_data_sheet",
        "View student data sheet",
        "view the student data spreadsheet",
        "Personal",
    ),
    _p(
        "user_image.upload.award_image",
        "Upload award photos",
        "upload award photos for users",
        "Personal",
    ),
    _p(
        "user_image.upload.id_image",
        "Upload ID photos",
        "upload ID photos for users",
        "Personal",
    ),
    _p(
        "user_image.view.award_image",
        "View award photos",
        "view award photos for users",
        "Personal",
    ),
    _p(
        "user_image.view.id_image",
        "View ID photos",
        "view ID photos for users",
        "Personal",
    ),
    # admissions
    _p(
        "admissions.view",
        "View admissions",
        "use the admissions desk to look up people and courses, including verified class payments",
        "Operational",
        sensitive=True,
    ),
    # crm / leads
    _p("lead.view", "View leads", "view the leads board", "Personal"),
    _p("lead.create", "Create leads", "create leads", "Personal"),
    _p(
        "lead.update",
        "Edit leads",
        "edit leads, move them between columns and convert them to students",
        "Personal",
    ),
    _p("lead.delete", "Delete leads", "delete leads", "Personal", sensitive=True),
    _p(
        "crm.configure",
        "Configure CRM",
        "configure lead statuses and sources",
        "Operational",
    ),
    # issues
    _p("issue.view", "View issues", "view the issues board", "Personal"),
    _p("issue.create", "Create issues", "create issues", "Personal"),
    _p(
        "issue.update",
        "Edit issues",
        "edit issues and move them between columns",
        "Personal",
    ),
    _p("issue.delete", "Delete issues", "delete issues", "Personal", sensitive=True),
    _p(
        "issue.configure",
        "Configure issues",
        "configure issue statuses",
        "Operational",
    ),
    _p("complaint.create", "File parent complaint", "file a parent complaint", "Personal"),
    _p("complaint.view_own", "View own complaints", "view own parent complaints", "Personal"),
    _p(
        "complaint.comment",
        "Comment on own complaint",
        "reply on own open parent complaint",
        "Personal",
    ),
    _p(
        "complaint.reopen",
        "Reopen own complaint",
        "reopen a closed parent complaint",
        "Personal",
    ),
    # user logs
    _p(
        "userlog.view",
        "View user logs",
        "view user log entries",
        "Personal",
        sensitive=True,
    ),
    _p("userlog.create", "Create user logs", "create user log entries", "Personal"),
    _p(
        "userlog.update",
        "Edit own user logs",
        "edit user log entries they authored",
        "Personal",
    ),
    _p(
        "userlog.delete",
        "Delete own user logs",
        "delete user log entries they authored",
        "Personal",
        sensitive=True,
    ),
    _p(
        "userlog.manage",
        "Manage all user logs",
        "edit and delete any user log entry",
        "Personal",
        sensitive=True,
    ),
    _p(
        "userlog.configure",
        "Configure user log types",
        "configure user log report types and their fields",
        "Operational",
    ),
    # points
    _p(
        "points.view",
        "View staff points",
        "view staff point balances and transaction history",
        "Operational",
    ),
    _p(
        "points.award",
        "Award staff points",
        "post point transactions for staff",
        "Operational",
    ),
    _p(
        "points.configure",
        "Configure point types",
        "create and edit staff point currencies",
        "Operational",
    ),
    # attendance
    _p(
        "attendance.mark",
        "Take attendance",
        "take attendance for their sessions",
        "Academic",
    ),
    _p(
        "attendance.view_all",
        "View all attendance",
        "view attendance across the whole school",
        "Academic",
    ),
    _p(
        "attendance.manage_all",
        "Manage all attendance",
        "mark and edit attendance across the whole school",
        "Academic",
        sensitive=True,
    ),
    _p(
        "attendance.view_removed_students",
        "View removed student attendance",
        "include previously enrolled students when viewing or marking course attendance",
        "Academic",
    ),
    _p(
        "attendance.correct_own_checkin",
        "Correct own check-in times",
        "correct or backfill own session check-in/out times from course check-in history",
        "Academic",
    ),
    _p(
        "attendance.view_own",
        "View own attendance",
        "view their own attendance records in enrolled courses",
        "Academic",
    ),
    _p("leave.create", "Submit leave request", "submit a leave request", "Personal"),
    _p(
        "leave.view_own",
        "View own leave requests",
        "view own leave requests",
        "Personal",
    ),
    _p(
        "leave.update_own",
        "Edit own leave requests",
        "edit or cancel own pending leave requests",
        "Personal",
    ),
    _p(
        "leave.view_all",
        "View all leave requests",
        "view all student leave requests",
        "Academic",
    ),
    _p(
        "leave.manage_all",
        "Manage leave requests",
        "approve or deny student leave requests",
        "Academic",
        sensitive=True,
    ),
    # payment
    _p("payment.view", "View own payments", "view their own payments", "Financial"),
    _p("payment.make", "Make payments", "make payments", "Financial"),
    _p(
        "payment.view_all",
        "View all payments",
        "view all student payments across the school",
        "Financial",
        sensitive=True,
    ),
    _p(
        "payment.view_unpaid",
        "View unpaid in assigned courses",
        "view unpaid students in courses they are connected to",
        "Financial",
    ),
    _p(
        "payment.view_unpaid_all",
        "View all unpaid students",
        "view unpaid students across the school",
        "Financial",
        sensitive=True,
    ),
    _p("payment.record", "Record payments", "record student payments", "Financial"),
    _p(
        "payment.verify",
        "Verify payments",
        "verify and approve student payments",
        "Financial",
        sensitive=True,
    ),
    _p(
        "payment.refund",
        "Refund payments",
        "issue refunds",
        "Financial",
        sensitive=True,
    ),
    _p(
        "payment.configure",
        "Configure payment plans",
        "configure payment plans, methods and info",
        "Financial",
    ),
    _p(
        "payment.show_fee",
        "Show payment fee",
        "see payment plan fees in plan selectors",
        "Financial",
    ),
    _p(
        "payment.export",
        "Export payment data",
        "export payment data",
        "Financial",
        sensitive=True,
    ),
    _p(
        "payment_info.view_own",
        "View own payout accounts",
        "view their own payout bank and wallet details",
        "Financial",
    ),
    _p(
        "payment_info.manage_own",
        "Manage own payout accounts",
        "create, update, and delete their own payout bank and wallet details",
        "Financial",
    ),
    # payroll
    _p("payroll.view", "View own earnings", "view their own earnings", "Payroll"),
    _p(
        "payroll.view_all",
        "View all payroll",
        "view payroll for all staff",
        "Payroll",
        sensitive=True,
    ),
    _p(
        "payroll.manage",
        "Manage payroll",
        "run and manage payroll",
        "Payroll",
        sensitive=True,
    ),
    _p(
        "rate.manage",
        "Manage rates",
        "set hourly and teaching rates",
        "Payroll",
        sensitive=True,
    ),
    _p(
        "checkin.view_all",
        "View check-in stats",
        "view staff check-in/check-out statistics",
        "Payroll",
    ),
    # assessment
    _p("quiz.author", "Author quizzes", "create and edit quizzes", "Academic"),
    _p("quiz.view_responses", "View quiz responses", "view quiz responses", "Academic"),
    _p("quiz.take", "Take quizzes", "take quizzes", "Academic"),
    _p(
        "questionbank.manage",
        "Manage question bank",
        "manage the question bank",
        "Academic",
    ),
    _p(
        "assignment.author",
        "Author assignments",
        "create and edit assignments",
        "Academic",
    ),
    _p("assignment.grade", "Grade assignments", "grade assignments", "Academic"),
    _p("assignment.submit", "Submit assignments", "submit assignments", "Academic"),
    _p(
        "submission.track",
        "Track submissions",
        "track submissions across courses",
        "Academic",
    ),
    # grade
    _p("grade.view", "View own grades", "view their own grades", "Academic"),
    _p(
        "grade.view_all",
        "View all grades",
        "view grades across the school",
        "Academic",
        sensitive=True,
    ),
    _p("grade.manage", "Manage grades", "manage and release grades", "Academic"),
    # content
    _p(
        "announcement.manage",
        "Manage announcements",
        "manage global announcements",
        "Operational",
    ),
    _p("news.manage", "Manage news/blog", "manage news and blog posts", "Operational"),
    _p(
        "document_template.manage",
        "Manage document templates",
        "manage document templates",
        "Operational",
    ),
    _p("library.view", "View library", "browse the library", "Operational"),
    _p("library.manage", "Manage library", "manage the library", "Operational"),
    # analytics
    _p(
        "analytics.view",
        "View analytics",
        "view dashboards and analytics",
        "Operational",
    ),
    _p("report.export", "Export reports", "export reports", "Operational"),
    # verification
    _p(
        "verification.view",
        "View verification requests",
        "view data-verification requests",
        "Personal",
    ),
    _p(
        "verification.process",
        "Process verification requests",
        "process data-verification requests",
        "Personal",
        sensitive=True,
    ),
    # chat
    _p("chat.participate", "Participate in chat", "participate in chat", "Operational"),
    _p(
        "chat.moderate",
        "Moderate chat",
        "moderate chat in their courses",
        "Operational",
    ),
    # misc
    _p("category.manage", "Manage categories", "manage categories", "Operational"),
    _p(
        "award_title.manage",
        "Manage award titles",
        "manage the org award title catalog",
        "Operational",
    ),
    _p("storage.view", "View storage", "view the storage audit", "Operational"),
    _p(
        "visibility.manage",
        "Manage field visibility",
        "manage profile field visibility presets",
        "Operational",
    ),
    _p(
        "form.manage",
        "Manage forms",
        "manage the form designer and custom fields",
        "Operational",
    ),
    _p(
        "ai.telegram_use",
        "Use Telegram assistant",
        "use the Telegram natural-language assistant",
        "Operational",
        sensitive=True,
    ),
    _p(
        "ai.usage.view_own",
        "View own AI usage",
        "view their own AI usage statistics",
        "Operational",
    ),
    _p(
        "ai.usage.view_all",
        "View all AI usage",
        "view any user's AI usage statistics",
        "Operational",
        sensitive=True,
    ),
    _p(
        "ai.memory.view_own",
        "View own AI memory",
        "view their own AI assistant preferences",
        "Operational",
    ),
    _p(
        "ai.memory.manage_own",
        "Manage own AI memory",
        "edit their own AI assistant preferences",
        "Operational",
    ),
    _p(
        "ai.memory.view_all",
        "View all AI memory",
        "view any user's AI assistant preferences",
        "Operational",
        sensitive=True,
    ),
    _p(
        "ai.memory.manage_all",
        "Manage all AI memory",
        "edit any user's AI assistant preferences",
        "Operational",
        sensitive=True,
    ),
    # consultation
    _p(
        "consultation.view",
        "View own consultations",
        "view their own consultation bookings",
        "Operational",
    ),
    _p(
        "consultation.create",
        "Create consultations",
        "create consultation bookings manually",
        "Operational",
    ),
    _p(
        "consultation.update",
        "Edit own consultations",
        "cancel their own consultation bookings",
        "Operational",
    ),
    _p(
        "consultation.delete",
        "Delete own consultations",
        "delete their own consultation bookings",
        "Operational",
    ),
    _p(
        "consultation.manage_schedule",
        "Manage consultation schedule",
        "manage their own weekly consultation availability",
        "Operational",
    ),
    # rbac meta
    _p(
        "rbac.view",
        "View roles & policy",
        "view roles and the policy overview",
        "Operational",
    ),
    _p(
        "rbac.manage",
        "Manage roles & permissions",
        "edit roles, the permission matrix, and role assignments",
        "Operational",
        sensitive=True,
    ),
    # SCHOOL_SETUP tier (default OFF for all school roles)
    _p("program.view", "View programs", "view programs", "Academic", tier=SCHOOL_SETUP),
    _p(
        "program.manage",
        "Manage programs",
        "manage programs",
        "Academic",
        tier=SCHOOL_SETUP,
    ),
    _p("subject.view", "View subjects", "view subjects", "Academic", tier=SCHOOL_SETUP),
    _p(
        "subject.manage",
        "Manage subjects",
        "manage subjects",
        "Academic",
        tier=SCHOOL_SETUP,
    ),
    _p("intake.view", "View intakes", "view intakes", "Academic", tier=SCHOOL_SETUP),
    _p(
        "intake.manage",
        "Manage intakes",
        "manage intakes",
        "Academic",
        tier=SCHOOL_SETUP,
    ),
    _p(
        "course_role.manage",
        "Manage course roles",
        "manage course role titles",
        "Academic",
        tier=SCHOOL_SETUP,
    ),
    _p(
        "organization.manage",
        "Manage organization settings",
        "manage organization settings and integrations",
        "Operational",
        tier=SCHOOL_SETUP,
    ),
    # PLATFORM_INTERNAL tier (superadmin only; never in tenant matrix)
    _p(
        "microsoft.configure",
        "Configure Microsoft",
        "configure the Microsoft integration",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "microsoft.repair",
        "Repair Microsoft",
        "run Microsoft repair jobs",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "telegram.configure",
        "Configure Telegram",
        "configure the Telegram integration",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "telegram.link_on_behalf",
        "Link Telegram on behalf of users",
        "generate link tokens and unlink Telegram for users on behalf of support",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "google.link_on_behalf",
        "Link Google on behalf of users",
        "unlink Google accounts for users on behalf of support",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "org.configure",
        "Configure organization",
        "configure org/tenant settings and theme",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "org.manage_all",
        "Manage all organizations",
        "manage all organizations",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "billing.manage",
        "Manage billing",
        "manage billing",
        "Financial",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "zoom.configure",
        "Configure Zoom",
        "configure Zoom accounts",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "ai.usage.view",
        "View AI usage",
        "view AI usage and spend reports",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "debug.access",
        "Access debug tools",
        "access platform debug tools",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "docs.view",
        "View product docs CMS",
        "view the platform product documentation CMS",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
    _p(
        "docs.manage",
        "Manage product docs",
        "create, edit, publish, and upload videos for product documentation",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
)

BY_CODE = {p.code: p for p in ALL_PERMISSIONS}
ALL_CODES = frozenset(BY_CODE)
SCHOOL_TIER_CODES = frozenset(p.code for p in ALL_PERMISSIONS if p.tier == SCHOOL)
SCHOOL_SETUP_CODES = frozenset(
    p.code for p in ALL_PERMISSIONS if p.tier == SCHOOL_SETUP
)
PLATFORM_INTERNAL_CODES = frozenset(
    p.code for p in ALL_PERMISSIONS if p.tier == PLATFORM_INTERNAL
)
TENANT_MATRIX_CODES = (
    SCHOOL_TIER_CODES | SCHOOL_SETUP_CODES
)  # editable in the tenant matrix
