import type { UtilityNotificationParams } from "@/types/utility-notification";

type RouteResolver = (params: UtilityNotificationParams) => string | null;

const ROUTE_RESOLVERS: Record<string, RouteResolver> = {
  "/shortcuts/todays-classes": () => "/shortcuts/todays-classes",
  "/shortcuts/unpaid-course-counts": () => "/shortcuts/unpaid-course-counts",
  "/class/course/[id]": (params) => {
    const courseId = params.id ?? params.courseId;
    if (courseId == null) return null;
    return `/courses/${courseId}`;
  },
  "/class/course/assignment/[id]": (params) => {
    if (params.id == null) return null;
    return `/assignments/${params.id}`;
  },
  "/class/course/[id]/announcement/[announcementId]": (params) => {
    const announcementId = params.announcementId;
    if (announcementId == null) return null;
    return `/announcements/${announcementId}`;
  },
  "/class/course/attendance/marking/[eventIndex]": (params) => {
    const courseId = params.id ?? params.courseId;
    if (courseId == null || params.eventIndex == null) return null;
    return `/courses/${courseId}/attendance/marking/${params.eventIndex}`;
  },
  "/finances/make-payment": () => "/finances/make-payment",
  "/finances/student-payments": () => "/finances/student-payments",
  "/finances/recent-transactions": () => "/finances/recent-transactions",
  "/services/org-wide-announcements": () => "/content/announcement-center",
  "/crm/issues": (params) => {
    if (params.issue == null) return "/crm/issues";
    return `/crm/issues?issue=${params.issue}`;
  },
  "/complaints/[id]": (params) => {
    if (params.id == null) return null;
    return `/complaints/${params.id}`;
  },
};

export function resolveUtilityNotificationHref(
  route: string,
  params: UtilityNotificationParams
): string | null {
  const resolver = ROUTE_RESOLVERS[route];
  if (resolver) {
    return resolver(params);
  }

  let path = route;
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    const segment = `[${key}]`;
    if (path.includes(segment)) {
      path = path.replace(segment, String(value));
    } else {
      query[key] = String(value);
    }
  }

  if (path.includes("[")) {
    return null;
  }

  const queryKeys = Object.keys(query);
  if (queryKeys.length === 0) {
    return path;
  }

  const search = new URLSearchParams(query).toString();
  return `${path}?${search}`;
}
