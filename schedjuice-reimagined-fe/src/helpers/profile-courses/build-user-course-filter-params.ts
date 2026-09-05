import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import { courseStatus } from "@/types/course";

export type UserCourseListScope = "your" | "all";
export type UserCourseListStatus = "active" | "all";

export interface BuildUserCourseFilterParamsArgs {
  subjectId: number | string;
  scope: UserCourseListScope;
  status: UserCourseListStatus;
  viewerTeachingCourseIds: number[];
}

export function buildUserCourseFilterParams(
  args: BuildUserCourseFilterParamsArgs,
): Required<Pick<filterParamsBody, "filter_params">> {
  const filter_params: filterParam[] = [
    {
      field_name: "user_id",
      operator: operatorEnum.exact,
      value: String(args.subjectId),
    },
  ];

  if (args.scope === "your" && args.viewerTeachingCourseIds.length > 0) {
    filter_params.push({
      field_name: "course_id",
      operator: operatorEnum.in,
      value: args.viewerTeachingCourseIds.join(","),
    });
  }

  if (args.status === "active") {
    filter_params.push({
      field_name: "course__status",
      operator: operatorEnum.in,
      value: [courseStatus.active, courseStatus.planned].join(","),
    });
  }

  return { filter_params };
}
