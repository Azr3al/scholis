import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import { HUB_PROGRAM_ALL, HubFilterSet } from "@/types/academic-hub";

export interface HubFilterContext {
  userId: number | string;
}

export function buildHubFilterParams(
  state: HubFilterSet,
  ctx: HubFilterContext,
): Required<Pick<filterParamsBody, "filter_params">> {
  const filter_params: filterParam[] = [];

  if (state.program && state.program !== HUB_PROGRAM_ALL) {
    filter_params.push({
      field_name: "program",
      operator: operatorEnum.exact,
      value: String(state.program),
    });
  }

  if (!state.q && state.status.length > 0) {
    const statuses = new Set<string>(state.status);
    if (statuses.has("active")) statuses.add("paused");
    filter_params.push({
      field_name: "status",
      operator: operatorEnum.in,
      value: Array.from(statuses).join(","),
    });
  }

  if (state.intake) {
    filter_params.push({
      field_name: "intake",
      operator: operatorEnum.exact,
      value: String(state.intake),
    });
  }

  if (state.subjects.length > 0) {
    filter_params.push({
      field_name: "subject",
      operator: operatorEnum.in,
      value: state.subjects.join(","),
    });
  }

  if (state.categories.length > 0) {
    filter_params.push({
      field_name: "category",
      operator: operatorEnum.in,
      value: state.categories.join(","),
    });
  }

  if (state.my) {
    filter_params.push({
      field_name: "user_courses__user_id|created_by",
      operator: operatorEnum.exact,
      value: String(ctx.userId),
    });
  }

  return { filter_params };
}
