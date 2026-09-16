import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";

export type ProfileCourseScope = "your" | "all";

export interface BuildProfileCourseFilterParamsArgs {
  subjectId: number | string;
  scope: ProfileCourseScope;
  sharedIds: number[];
}

export function buildProfileCourseFilterParams(
  args: BuildProfileCourseFilterParamsArgs,
): Required<Pick<filterParamsBody, "filter_params">> {
  const filter_params: filterParam[] = [
    {
      field_name: "user_courses__user_id",
      operator: operatorEnum.exact,
      value: String(args.subjectId),
    },
  ];

  if (args.scope === "your" && args.sharedIds.length > 0) {
    filter_params.push({
      field_name: "id",
      operator: operatorEnum.in,
      value: args.sharedIds.join(","),
    });
  }

  return { filter_params };
}
