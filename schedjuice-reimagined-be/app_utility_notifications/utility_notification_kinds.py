from enum import Enum


class UtilityNotificationKind(str, Enum):
    TODAY_SCHEDULE = "today_schedule"
    CLASS_STARTING_SOON = "class_starting_soon"
    CLASS_IN_PROGRESS = "class_in_progress"
    ASSIGNMENT_DUE = "assignment_due"
    PAYMENT_PENDING = "payment_pending"
    PAYMENT_PENDING_VERIFICATION = "payment_pending_verification"
    ATTENDANCE_MARKED = "attendance_marked"
    ANNOUNCEMENT_NEW = "announcement_new"
    ATTENDANCE_UNMARKED = "attendance_unmarked"
    ASSIGNMENT_TO_GRADE = "assignment_to_grade"
    ADMIN_UNPAID_SUMMARY = "admin_unpaid_summary"
    ADMIN_PAYMENTS_TO_VERIFY = "admin_payments_to_verify"
    ADMIN_TODAY_OVERVIEW = "admin_today_overview"
    COMPLAINT_NEW = "complaint_new"
    COMPLAINT_ASSIGNED = "complaint_assigned"
    COMPLAINT_REOPENED = "complaint_reopened"
    COMPLAINT_REPLY = "complaint_reply"
    LEAVE_SUBMITTED = "leave_submitted"
    LEAVE_APPROVED = "leave_approved"
    LEAVE_DENIED = "leave_denied"
