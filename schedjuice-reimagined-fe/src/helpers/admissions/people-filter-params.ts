import { buildHubUserFilterParams } from "@/helpers/user-hub/filter-params";
import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import type { UserHubTab } from "@/types/user-hub";

export type AdmissionsPeopleFilterState = {
  tab: UserHubTab;
  q: string;
  page: number;
  includeInactive: boolean;
  includeAlumni: boolean;
};

function studentRoleFilter(): filterParam {
  return {
    field_name: "roles",
    operator: operatorEnum.contained_by,
    value: `{${role.student}}`,
  };
}

export function buildAdmissionsPeopleFilterParams(
  state: AdmissionsPeopleFilterState,
): Required<Pick<filterParamsBody, "filter_params">> {
  if (state.tab === "students") {
    return { filter_params: [studentRoleFilter()] };
  }
  return buildHubUserFilterParams({ ...state, incomplete: false, view: "list" });
}

export function buildAdmissionsPeopleTabCountFilterParams(
  tab: UserHubTab,
): Required<Pick<filterParamsBody, "filter_params">> {
  if (tab === "students") {
    return { filter_params: [studentRoleFilter()] };
  }
  return buildHubUserFilterParams({
    tab: "staff",
    q: "",
    page: 1,
    includeInactive: false,
    incomplete: false,
    view: "list",
  });
}
