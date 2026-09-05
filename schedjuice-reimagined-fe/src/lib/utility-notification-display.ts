
import type { ComponentType, SVGProps } from "react";
import {
  BellNotification as BellRing,
  Calendar,
  Calendar as CalendarClock,
  ChatBubble as MessageCircle,
  Play as CirclePlay,
  ClipboardCheck,
  ClipboardCheck as ClipboardList,
  CreditCard,
  Megaphone,
  Refresh as RefreshCw,
  ShieldAlert,
  UserBadgeCheck as UserCheck,
  UserXmark as UserX,
  WarningCircle as AlertCircle,
} from "iconoir-react";

import { UtilityNotificationKind, UtilityNotificationSeverity } from "@/types/utility-notification";

const SEVERITY_ICON_COLORS: Record<UtilityNotificationSeverity, string> = {
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

const KIND_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  [UtilityNotificationKind.TodaySchedule]: Calendar,
  [UtilityNotificationKind.ClassStartingSoon]: CalendarClock,
  [UtilityNotificationKind.ClassInProgress]: CirclePlay,
  [UtilityNotificationKind.AssignmentDue]: ClipboardList,
  [UtilityNotificationKind.PaymentPending]: CreditCard,
  [UtilityNotificationKind.PaymentPendingVerification]: ShieldAlert,
  [UtilityNotificationKind.AttendanceMarked]: UserCheck,
  [UtilityNotificationKind.AnnouncementNew]: Megaphone,
  [UtilityNotificationKind.AttendanceUnmarked]: UserX,
  [UtilityNotificationKind.AssignmentToGrade]: ClipboardCheck,
  [UtilityNotificationKind.AdminUnpaidSummary]: BellRing,
  [UtilityNotificationKind.AdminPaymentsToVerify]: CreditCard,
  [UtilityNotificationKind.AdminTodayOverview]: Calendar,
  [UtilityNotificationKind.ComplaintNew]: AlertCircle,
  [UtilityNotificationKind.ComplaintAssigned]: UserCheck,
  [UtilityNotificationKind.ComplaintReopened]: RefreshCw,
  [UtilityNotificationKind.ComplaintReply]: MessageCircle,
  [UtilityNotificationKind.LeaveSubmitted]: ClipboardList,
  [UtilityNotificationKind.LeaveApproved]: UserCheck,
  [UtilityNotificationKind.LeaveDenied]: UserX,
};

export function getUtilityNotificationIcon(
  kind: string,
  severity: UtilityNotificationSeverity
): { Icon: ComponentType<SVGProps<SVGSVGElement>>; colorClass: string } {
  const Icon = KIND_ICONS[kind] ?? BellRing;
  const colorClass = SEVERITY_ICON_COLORS[severity] ?? SEVERITY_ICON_COLORS.warning;
  return { Icon, colorClass };
}