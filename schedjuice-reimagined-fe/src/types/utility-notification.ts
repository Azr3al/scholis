export enum UtilityNotificationKind {
  TodaySchedule = "today_schedule",
  ClassStartingSoon = "class_starting_soon",
  ClassInProgress = "class_in_progress",
  AssignmentDue = "assignment_due",
  PaymentPending = "payment_pending",
  PaymentPendingVerification = "payment_pending_verification",
  AttendanceMarked = "attendance_marked",
  AnnouncementNew = "announcement_new",
  AttendanceUnmarked = "attendance_unmarked",
  AssignmentToGrade = "assignment_to_grade",
  AdminUnpaidSummary = "admin_unpaid_summary",
  AdminPaymentsToVerify = "admin_payments_to_verify",
  AdminTodayOverview = "admin_today_overview",
  ComplaintNew = "complaint_new",
  ComplaintAssigned = "complaint_assigned",
  ComplaintReopened = "complaint_reopened",
  ComplaintReply = "complaint_reply",
  LeaveSubmitted = "leave_submitted",
  LeaveApproved = "leave_approved",
  LeaveDenied = "leave_denied",
}

export enum UtilityNotificationSeverity {
  Success = "success",
  Warning = "warning",
  Danger = "danger",
}

export type UtilityNotificationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type UtilityNotificationItem = {
  id: string;
  kind: string;
  severity: UtilityNotificationSeverity;
  title: string;
  body: string;
  created_at: string;
  route: string;
  params: UtilityNotificationParams;
};
