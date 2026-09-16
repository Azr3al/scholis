import {
  canAccessCourseDataSheet,
  canAccessStudentDataSheet,
  canViewUnpaidStudents,
  hasSchoolWideCourseAccess,
} from "@/helpers/authorization";
import type { ComponentType, SVGProps } from "react";
import { StatsUpSquare as BarChart3, Book as BookOpen, Calendar as CalendarDays, Calendar as CalendarSearch, DollarCircle as CircleDollarSign, ClipboardCheck as ClipboardList, GraduationCap as School, Page as Sheet, Table2Columns as Table2, Group as Users, UserScan as UserSearch } from "iconoir-react";
import {
  TransactionScreenshotStrategy,
  type organizationType,
} from "@/types/organization";
import { accountType, role } from "@/types/user";

export type ShortcutToolDef = {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Role gate for this shortcut. Still role-based on purpose: the shortcut
   * access helpers in `helpers/authorization.ts` are also role-based, so the
   * permission migration of shortcuts is done together in RBAC Plan-3 Task 6.
   */
  roles: role[];
};

export const SHORTCUT_TOOLS: ShortcutToolDef[] = [
  {
    title: "School welcome",
    description:
      "Your school’s onboarding message, links, and shared files for your role.",
    href: "/shortcuts/school-welcome",
    icon: School,
    roles: [
      role.superadmin,
      role.admin,
      role.manager,
      role.teacher,
      role.finance,
      role.hr,
      role.student,
    ],
  },
  {
    title: "Today's classes",
    description: "Sessions scheduled for today, grouped by time.",
    href: "/shortcuts/todays-classes",
    icon: CalendarDays,
    roles: [
      role.superadmin,
      role.admin,
      role.manager,
      role.teacher,
      role.finance,
      role.hr,
    ],
  },
  {
    title: "Meeting link sheet",
    description: "Teams links, join IDs, and passcodes by category.",
    href: "/shortcuts/meeting-link-sheet",
    icon: Table2,
    roles: [
      role.superadmin,
      role.admin,
      role.manager,
      role.teacher,
    ],
  },
  {
    title: "User schedule lookup",
    description:
      "Find a user by name or email and view their sessions for a date range.",
    href: "/shortcuts/user-schedule",
    icon: CalendarSearch,
    roles: [role.superadmin, role.admin, role.manager],
  },
  {
    title: "Available teachers",
    description:
      "Staff with no collision-counted class on selected weekdays in a month during a timeslot.",
    href: "/shortcuts/available-teachers",
    icon: Users,
    roles: [role.superadmin, role.admin, role.manager],
  },
  {
    title: "Starting courses",
    description:
      "Classes whose start date falls in the selected month, grouped by category.",
    href: "/shortcuts/starting-courses",
    icon: BookOpen,
    roles: [role.superadmin, role.admin, role.manager],
  },
  {
    title: "Course insights",
    description:
      "Find active courses missing schedule, roster, or recent session attendance/check-in data.",
    href: "/shortcuts/course-insights",
    icon: ClipboardList,
    roles: [role.superadmin, role.admin, role.manager],
  },
  {
    title: "User insights",
    description:
      "Find duplicate student accounts and review user data quality.",
    href: "/shortcuts/user-insights",
    icon: UserSearch,
    roles: [role.superadmin, role.admin, role.manager],
  },
  {
    title: "Analytics",
    description:
      "Registrations, courses, revenue, and teaching load in one place. Daily time ranges and live snapshots.",
    href: "/shortcuts/analytics",
    icon: BarChart3,
    roles: [
      role.superadmin,
      role.admin,
      role.manager,
      role.finance,
    ],
  },
  {
    title: "Unpaid students by course",
    description:
      "Unpaid counts per class by category for a month—copy blocks for internal chat. Dropped-out students excluded.",
    href: "/shortcuts/unpaid-course-counts",
    icon: CircleDollarSign,
    roles: [
      role.superadmin,
      role.admin,
      role.manager,
      role.teacher,
      role.finance,
    ],
  },
  {
    title: "Course Data",
    description:
      "Classes for a month as a spreadsheet, grouped by category with WD/WE side-by-side and student totals.",
    href: "/shortcuts/course-data",
    icon: Sheet,
    roles: [role.superadmin, role.admin, role.manager],
  },
  {
    title: "Student Data",
    description:
      "Current students with assigned active courses, as a spreadsheet.",
    href: "/shortcuts/student-data",
    icon: Table2,
    roles: [role.superadmin, role.admin, role.manager],
  },
  {
    title: "Staff Data",
    description:
      "All active staff (non-students) with profile fields and ID photos.",
    href: "/shortcuts/staff-data",
    icon: Users,
    roles: [role.superadmin, role.admin, role.manager],
  },
];

const UNPAID_COURSE_SHORTCUT_HREF = "/shortcuts/unpaid-course-counts";
const COURSE_INSIGHTS_SHORTCUT_HREF = "/shortcuts/course-insights";
const USER_INSIGHTS_SHORTCUT_HREF = "/shortcuts/user-insights";
const COURSE_DATA_SHORTCUT_HREF = "/shortcuts/course-data";
const STUDENT_DATA_SHORTCUT_HREF = "/shortcuts/student-data";
const STAFF_DATA_SHORTCUT_HREF = "/shortcuts/staff-data";

export function filterShortcutToolsForUser(
  user: accountType | undefined,
  tenant?: organizationType | null,
): ShortcutToolDef[] {
  if (!user) return [];
  return SHORTCUT_TOOLS.filter((t) => {
    if (t.href === UNPAID_COURSE_SHORTCUT_HREF) {
      if (!canViewUnpaidStudents(user)) {
        return false;
      }
      return (
        tenant?.transaction_screenshot_strategy ===
        TransactionScreenshotStrategy.admin_upload
      );
    }
    if (t.href === COURSE_INSIGHTS_SHORTCUT_HREF) {
      return hasSchoolWideCourseAccess(user);
    }
    if (t.href === USER_INSIGHTS_SHORTCUT_HREF) {
      return hasSchoolWideCourseAccess(user);
    }
    if (t.href === COURSE_DATA_SHORTCUT_HREF) {
      return (
        canAccessCourseDataSheet(user) && tenant?.course_sheet_template != null
      );
    }
    if (t.href === STUDENT_DATA_SHORTCUT_HREF) {
      return canAccessStudentDataSheet(user);
    }
    if (t.href === STAFF_DATA_SHORTCUT_HREF) {
      return canAccessStudentDataSheet(user);
    }
    if (!t.roles.some((r) => user.roles?.includes(r) ?? false)) {
      return false;
    }
    return true;
  });
}
