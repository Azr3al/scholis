// src/components/home/widget-registry.tsx
import { ComponentType, lazy } from "react";

export type WidgetDef = {
  id: string;
  title: string;
  requiredPermissions: string[];   // canAny; [] = always
  span: "sm" | "md" | "lg";        // bento sizing
  Component: ComponentType;
};

const w = (
  id: string,
  title: string,
  requiredPermissions: string[],
  span: WidgetDef["span"],
  importer: () => Promise<{ default: ComponentType }>,
): WidgetDef => ({
  id, title, requiredPermissions, span, Component: lazy(importer),
});

export const WIDGETS: WidgetDef[] = [
  w("welcome", "Welcome", [], "lg", () => import("./widgets/welcome-widget")),
  w("next-class", "Your next class", ["course.view"], "md", () => import("./widgets/next-class-widget")),
  w("assignments-due", "Assignments due", ["assignment.submit"], "md", () => import("./widgets/assignments-due-widget")),
  w("recent-grades", "Recent grades", ["grade.view"], "sm", () => import("./widgets/recent-grades-widget")),
  w("outstanding-balance", "Outstanding balance", ["payment.make"], "sm", () => import("./widgets/outstanding-balance-widget")),
  w("todays-classes", "Today's classes", ["attendance.mark"], "lg", () => import("./widgets/todays-classes-widget")),
  w("pending-grading", "Pending grading", ["assignment.grade"], "md", () => import("./widgets/pending-grading-widget")),
  w("my-earnings", "My earnings", ["payroll.view"], "sm", () => import("./widgets/my-earnings-widget")),
  w("cash-flow", "Cash flow", ["analytics.view"], "lg", () => import("./widgets/cash-flow-widget")),
  w("unpaid-students", "Unpaid students", ["payment.view_unpaid", "payment.view_unpaid_all"], "sm", () => import("./widgets/unpaid-students-widget")),
  w("todays-checkins", "Today's check-ins", ["checkin.view_all"], "md", () => import("./widgets/todays-checkins-widget")),
  w("payroll-period", "Payroll period", ["payroll.view_all"], "sm", () => import("./widgets/payroll-period-widget")),
  w("contracts-expiring", "Contracts expiring", ["payroll.view_all"], "sm", () => import("./widgets/contracts-expiring-widget")),
  w("courses-starting", "Courses starting soon", ["course.view_all"], "md", () => import("./widgets/courses-starting-widget")),
  w("new-registrations", "New registrations", ["user.view_all"], "sm", () => import("./widgets/new-registrations-widget")),
  w("attendance-overview", "Attendance overview", ["attendance.view_all"], "md", () => import("./widgets/attendance-overview-widget")),
];

export function visibleWidgets(canAny: (codes: string[]) => boolean): WidgetDef[] {
  return WIDGETS.filter((x) => x.requiredPermissions.length === 0 || canAny(x.requiredPermissions));
}
