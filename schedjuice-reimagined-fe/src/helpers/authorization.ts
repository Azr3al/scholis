import {
  makePermissionChecker,
  SUPERADMIN_WILDCARD,
} from "@/lib/rbac/permission-checker";
import { hasSuperadminRole } from "@/lib/account-cookie";
import {
  getCreatedByIdFromCourse,
  getTeacherMemberIdsFromCourse,
  userHasTeachingAssignmentOnCourse,
} from "@/helpers/course-hub";
import { courseType } from "@/types/course";
import { isStaffSubject } from "@/lib/points/visibility";
import { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";
import type { UserImageType } from "@/types/user-image";

export const permissionsFor = (user: accountType | undefined | null) => {
  const perms = user?.permissions;
  const grantAll =
    (user != null && hasSuperadminRole(user.roles)) ||
    (Array.isArray(perms) && perms.includes(SUPERADMIN_WILDCARD));
  return makePermissionChecker(perms, { grantAll });
};

/** School-wide course visibility (vs membership-scoped). */
export const hasSchoolWideCourseAccess = (user: accountType) =>
  permissionsFor(user).canAny(["course.view_all", "course.manage_all"]);

/** Fix overlapping sessions from data health (school-wide schedule write). */
export const canFixOverlappingSessions = (user: accountType) =>
  permissionsFor(user).can("course.manage_all");

/** Staff shortcuts (non-student personas). */
export const canAccessStaffShortcuts = (user: accountType) =>
  permissionsFor(user).canAny([
    "course.update",
    "course.manage_all",
    "attendance.mark",
    "payment.view_all",
    "analytics.view",
    "user.view_all",
    "payroll.view_all",
  ]);

export const canVerifyPayments = (user: accountType) =>
  permissionsFor(user).can("payment.verify");

/** See payment plan fees in plan selectors. */
export const canShowPaymentPlanFee = (user: accountType) =>
  permissionsFor(user).can("payment.show_fee");

/** Manage own payout bank/wallet details (staff self-service). */
export const canManageOwnPaymentInfo = (user: accountType) =>
  permissionsFor(user).can("payment_info.manage_own");

/** School-wide payout info admin (finance / admin). */
export const canConfigurePaymentInfo = (user: accountType) =>
  permissionsFor(user).can("payment.configure");

export const canViewAllStaffPayments = (user: accountType) =>
  permissionsFor(user).canAny(["payment.view_all", "payroll.view_all"]);

export const canRecordStaffPayments = (user: accountType) =>
  permissionsFor(user).can("payroll.manage");
/** Create or edit payout info on a user profile (self or school-wide admin). */
export const canManagePaymentInfoForUser = (
  viewer: accountType,
  subjectUserId: number,
) =>
  canConfigurePaymentInfo(viewer) ||
  (canManageOwnPaymentInfo(viewer) && viewer.id === subjectUserId);

/** Profile-scoped payout routes (avoid exposing admin /payment-infos list). */
export const isProfileScopedPaymentInfoRoutes = (
  viewer: accountType,
  subjectUserId: number,
) =>
  canManagePaymentInfoForUser(viewer, subjectUserId) &&
  !canConfigurePaymentInfo(viewer) &&
  viewer.id === subjectUserId;

export type PaymentInfoRouteContext = {
  profileScoped: boolean;
  adminScoped: boolean;
  createHref: string | null;
  editHref: (rowId: string | number) => string | null;
};

/** Resolve create/edit hrefs for payout info from the user Finance tab. */
export function resolvePaymentInfoRoutes(
  viewer: accountType | undefined,
  subjectUserId: number,
): PaymentInfoRouteContext {
  const profileScoped =
    viewer != null && isProfileScopedPaymentInfoRoutes(viewer, subjectUserId);
  const adminScoped = viewer != null && canConfigurePaymentInfo(viewer);

  let createHref: string | null = null;
  if (profileScoped) {
    createHref = `/users/${subjectUserId}/payment-infos/create`;
  } else if (adminScoped) {
    createHref = `/payment-infos/create?user_id=${subjectUserId}`;
  }

  function editHref(rowId: string | number): string | null {
    if (profileScoped) {
      return `/users/${subjectUserId}/payment-infos/${rowId}/edit`;
    }
    if (adminScoped) {
      return `/payment-infos/${rowId}/edit`;
    }
    return null;
  }

  return { profileScoped, adminScoped, createHref, editHref };
}

/** View payment screenshots on the student payments report (school-wide or course-scoped). */
export const canViewPaymentScreenshots = (user: accountType) =>
  permissionsFor(user).can("payment.view_all") ||
  (permissionsFor(user).can("payment.view") &&
    permissionsFor(user).can("payment.record"));

export const canAccessCourseStaffActions = (user: accountType) =>
  permissionsFor(user).canAny([
    "course.update",
    "course.manage_members",
    "course.manage_content",
    "course.manage_all",
    "attendance.mark",
  ]);

/** Payment lists scoped to course membership (staff without school-wide payment view). */
export const isPaymentMembershipScoped = (user: accountType) =>
  permissionsFor(user).canAny(["payment.view", "payment.record"]) &&
  !permissionsFor(user).can("payment.view_all");

export const canRecordStudentPayments = (user: accountType) =>
  permissionsFor(user).can("payment.record");

/** Record refund / re-transfer proof on student payments. */
export const canRecordRefunds = (user: accountType) =>
  permissionsFor(user).can("payment.refund");

export const canEditOrganization = (user: accountType) => {
  return (
    (user.roles?.includes(role.superadmin) ?? false) ||
    (user.roles?.includes(role.admin) ?? false)
  );
};

export const hasAdminCredentials = (user: accountType) => {
  let has = false;
  if (!user) {
    return has;
  }
  const adminRoles = [role.superadmin, role.admin, role.manager];
  adminRoles.map((r: role) => {
    if (user?.roles?.includes(r)) {
      has = true;
    }
  });
  return has;
};

export const canDownloadPaymentReceipt = (user: accountType) => {
  if (!user) return false;
  return permissionsFor(user).canAny([
    "payment.verify",
    "payment.export",
    "payment.view_all",
  ]);
};

export const canEditUser = (accessor: accountType, accesseeId: number) => {
  return (
    hasAdminCredentials(accessor) ||
    (accesseeId === accessor.id && permissionsFor(accessor).can("user.update_own"))
  );
};

export const canEditProfileMedia = (viewer: accountType, subjectId: number) =>
  viewer.id === subjectId || hasAdminCredentials(viewer);

export const canUpdateCoverImage = (viewer: accountType, subjectId: number) =>
  canEditProfileMedia(viewer, subjectId) && !isStudent(viewer);

export const canEditUserSignature = (
  viewer: accountType,
  subject: Pick<accountType, "id" | "roles">,
) => viewer.id === subject.id && isStaffSubject(subject);

export const canUploadUserImage = (viewer: accountType, imageType: UserImageType) =>
  permissionsFor(viewer).can(`user_image.upload.${imageType}`);

export const canViewUserImage = (viewer: accountType, imageType: UserImageType) =>
  permissionsFor(viewer).can(`user_image.view.${imageType}`);

export const canViewStudentInfoSection = (viewer: accountType | undefined | null) =>
  Boolean(viewer && !isStudent(viewer));

export const canUploadUserImageOnCourse = (
  viewer: accountType,
  _imageType: UserImageType,
  ctx: { teacherMemberIds: number[]; createdById?: number | null },
) => canEditCourse(viewer, ctx.teacherMemberIds, ctx.createdById ?? null);

export const canDeleteUser = (accessor: accountType) => {
  return hasAdminCredentials(accessor);
};

export const canEditCourse = (
  accessor: accountType,
  courseMemberIds: number[],
  createdById?: number | null,
) => {
  if (hasAdminCredentials(accessor)) {
    return true;
  } else if (accessor.roles?.includes(role.teacher)) {
    return (
      courseMemberIds?.includes(accessor.id) ||
      (createdById != null && accessor.id === createdById)
    );
  }
  return false;
};

/** Teachers, students, and schedule on the course editor — not the same as `canCreateCourse`. */
export const canManageCourseRoster = (
  accessor: accountType,
  courseTeacherMemberIds: number[],
  createdById?: number | null,
) => {
  if (!permissionsFor(accessor).can("course.manage_members")) {
    return false;
  }
  if (hasAdminCredentials(accessor)) {
    return true;
  }
  if (permissionsFor(accessor).can("course.manage_all")) {
    return true;
  }
  return canEditCourse(accessor, courseTeacherMemberIds, createdById);
};

export const canAssignSelfToCourseEvents = (user: accountType) =>
  permissionsFor(user).canAny([
    "course.assign_self_events",
    "course.manage_all",
  ]);

export const canAssignTeacherToEvents = (
  accessor: accountType,
  targetTeacherId: number,
) => {
  if (targetTeacherId === accessor.id) {
    return canAssignSelfToCourseEvents(accessor);
  }
  return permissionsFor(accessor).can("course.manage_members");
};

export const canManageCourseSchedule = (
  accessor: accountType,
  courseTeacherMemberIds: number[],
  createdById?: number | null,
) => {
  if (!permissionsFor(accessor).can("course.manage_content")) {
    return false;
  }
  return canEditCourse(accessor, courseTeacherMemberIds, createdById);
};

type CourseFeedScope = {
  user_courses?: Array<{
    assigned_as?: string;
    user?: unknown;
    assigned_as_role?: { seniority?: string | null } | null;
  }>;
  created_by?: unknown;
};

/** Course feed composer (announcements / daily lessons). */
export const canManageCourseFeed = (
  accessor: accountType,
  course: CourseFeedScope | null | undefined,
) => {
  if (hasAdminCredentials(accessor)) {
    return true;
  }
  if (permissionsFor(accessor).can("course.manage_all")) {
    return true;
  }
  if (userHasTeachingAssignmentOnCourse(accessor.id, course)) {
    return true;
  }
  const teacherMemberIds = getTeacherMemberIdsFromCourse(course);
  const createdById = getCreatedByIdFromCourse(course);
  if (
    permissionsFor(accessor).can("course.manage_content") &&
    canEditCourse(accessor, teacherMemberIds, createdById)
  ) {
    return true;
  }
  return false;
};

/** Manual course status changes (e.g. end course): managers+ or teacher on this course roster. */
export const canManuallyChangeCourseStatus = (
  accessor: accountType,
  courseTeacherMemberIds: number[],
  createdById?: number | null,
) => canEditCourse(accessor, courseTeacherMemberIds, createdById);

export const canDeleteCourse = (accessor: accountType) => {
  return hasAdminCredentials(accessor);
};

export const isStudent = (accessor: accountType | undefined | null) => {
  return accessor?.roles?.includes(role.student) ?? false;
};

/** Matches backend `User.is_student()`: exactly one role and it is student. */
export const isStudentOnlyUser = (user: Pick<accountType, "roles">) => {
  const roles = user.roles ?? [];
  return roles.length === 1 && roles[0] === role.student;
};

/** Shortcuts meeting link sheet: course staff (not students). */
export const canAccessMeetingLinkSheet = (user: accountType) =>
  permissionsFor(user).canAny(["course.update", "course.manage_all", "attendance.mark"]);

export const canAccessCourseDataSheet = (user: accountType) =>
  permissionsFor(user).can("course.view_data_sheet");

export const canAccessStudentDataSheet = (user: accountType) =>
  permissionsFor(user).can("user.view_data_sheet");

/** Unpaid student reports (connected or school-wide). */
export const canViewUnpaidStudents = (user: accountType) =>
  permissionsFor(user).canAny(["payment.view_unpaid", "payment.view_unpaid_all"]);

export const hasSchoolWideUnpaidAccess = (user: accountType) =>
  permissionsFor(user).can("payment.view_unpaid_all");

/** Same permission gate as Finances → Unpaid Students (nav-routes). */
export const canAccessUnpaidCourseShortcut = (user: accountType) =>
  canViewUnpaidStudents(user);

/** Shortcuts → Analytics (matches backend reports/analytics permissions). */
export const canAccessAnalyticsShortcut = (user: accountType) =>
  permissionsFor(user).can("analytics.view");

/** Starting courses shortcut: school-wide course visibility. */
export const canAccessStartingCoursesShortcut = (user: accountType) =>
  hasSchoolWideCourseAccess(user);

/** Organization → User Activity hub (nav matches superadmin, admin, manager). */
export const canAccessUserActivity = (user: accountType) =>
  permissionsFor(user).canAny(["analytics.view", "user.view_all"]);

export const isSuperAdmin = (accessor: accountType | undefined | null) => {
  if (!accessor) return false;
  if (hasSuperadminRole(accessor.roles)) return true;
  // Auth payloads only include platform-internal permissions for superadmins.
  const perms = accessor.permissions;
  return Array.isArray(perms) && perms.includes("org.manage_all");
};
export const isAdmin = (accessor: accountType) => {
  return accessor.roles?.includes(role.admin) ?? false;
};

/** Demo guide for school admins on provisioned demo tenants. */
export const canAccessDemoGuide = (
  user: accountType | undefined | null,
  tenant: organizationType | null | undefined,
) => Boolean(tenant?.is_demo && user && isAdmin(user));

/** Platform org list/management: superadmin on the Schedjuice admin tenant only. */
export const canAccessPlatformOrganizations = (
  user: accountType,
  tenant: organizationType,
) => Boolean(isSuperAdmin(user) && tenant?.is_admin);

/** Demo provisioning from brief detail: same gate as platform org management. */
export const canAccessDemoProvision = (
  user: accountType | undefined | null,
  tenant: organizationType | null | undefined,
) => Boolean(user && tenant && canAccessPlatformOrganizations(user, tenant));

export const userHasRoles = (user: accountType, roles: role[]) => {
  return roles.some((r) => user.roles?.includes(r) ?? false);
};

export const canCreateCourse = (
  tenant: organizationType,
  user: accountType,
  course?: courseType
) => {
  if (hasAdminCredentials(user)) {
    return true;
  }
  if (isStudent(user)) {
    return false;
  }
  if (user.roles?.includes(role.teacher)) {
    return tenant.can_teacher_create_course;
  }
  return false;
};
