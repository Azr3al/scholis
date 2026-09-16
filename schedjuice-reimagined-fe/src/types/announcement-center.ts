export enum AnnouncementCenterScope {
  OrgWide = "org_wide",
  PerCourse = "per_course",
}

export type AnnouncementCourseFilters = {
  month_type: "ALL" | "FM" | "HM";
  category_ids?: number[];
};
