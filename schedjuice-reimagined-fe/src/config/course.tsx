import { canAccessCourseAttendance, permissionsFor } from "@/helpers/authorization";
import { tenantShowsMeetingAttendance } from "@/helpers/meeting-attendance-gate";
import { courseType } from "@/types/course";
import { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import { Book as BookOpenCheck, CreditCard, EditPencil as Edit, Fish, GraduationCap, ClockRotateRight, Mail, Notes as StickyNote, UserBadgeCheck as UserCheck, UserPlus, VideoCamera as Video, CalendarCheck } from "iconoir-react";

const dropdownMenuItems: {
  title: string;
  href: string;
  icon: React.ReactNode;
  canShow?: (
    user: accountType,
    course?: courseType,
    tenant?: organizationType | null,
  ) => boolean;
}[][] = [
    [
      {
        title: "Edit Course",
        href: "edit",
        icon: <Edit></Edit>,
        canShow: (user) => permissionsFor(user).can("course.update"),
      },
      {
        title: "Edit Teachers",
        href: "edit?tab=edit-members",
        icon: <GraduationCap></GraduationCap>,
        canShow: (user) => permissionsFor(user).can("course.manage_members"),
      },
    ],
    [

      {
        title: "Availability",
        href: "availability",
        icon: <Fish />,
        canShow: (user) => permissionsFor(user).can("course.update"),
      },
      {
        title: "Attendance",
        href: "attendance",
        icon: <UserCheck />,
        canShow: (user) => canAccessCourseAttendance(user),
      },
      {
        title: "Check-in History",
        href: "checkin-history",
        icon: <ClockRotateRight />,
        canShow: (user) =>
          permissionsFor(user).canAny(["checkin.view_all", "attendance.mark"]),
      },
      {
        title: "Meeting attendance",
        href: "meeting-attendance",
        icon: <CalendarCheck />,
        canShow: (user, _course, tenant) =>
          permissionsFor(user).can("attendance.mark") &&
          tenantShowsMeetingAttendance(tenant ?? null),
      },
    ],
    [
      {
        title: "Notes",
        href: "daily-notes",
        icon: <StickyNote />,
        canShow: (user) => permissionsFor(user).can("course.manage_content"),
      },
      {
        title: "Recordings",
        href: "recordings",
        icon: <Video />,
        canShow: (user) => permissionsFor(user).can("course.manage_content"),
      },
      {
        title: "Grading",
        href: "grading",
        icon: <BookOpenCheck />,
        canShow: (user) =>
          permissionsFor(user).canAny(["assignment.grade", "grade.manage"]),
      },
      {
        title: "Student Payments",
        href: "student-payments",
        icon: <CreditCard />,
        canShow: (user) =>
          permissionsFor(user).canAny(["payment.view_all", "payment.record"]),
      },
    ],
    [
      {
        title: "Join Requests",
        href: "join-requests",
        icon: <UserPlus />,
        canShow: (user) => permissionsFor(user).can("course.manage_members"),
      },
      {
        title: "Email Templates",
        href: "email-templates",
        icon: <Mail />,
        canShow: (user) => permissionsFor(user).can("course.update"),
      },
    ],
  ];

export const getDropdownMenuItems = (
  user: accountType,
  course: courseType,
  tenant?: organizationType | null,
) => {
  const returnList: {
    title: string;
    href: string;
    icon: React.ReactNode;
  }[][] = [];
  dropdownMenuItems.forEach((items) => {
    const tempList: {
      title: string;
      href: string;
      icon: React.ReactNode;
    }[] = [];
    items.forEach((item) => {
      if (item.canShow) {
        if (item.canShow(user, course, tenant ?? null)) {
          tempList.push(item);
        }
      } else {
        tempList.push(item);
      }
    });
    returnList.push(tempList);
  });
  return returnList.filter((x) => x.length > 0);
};
