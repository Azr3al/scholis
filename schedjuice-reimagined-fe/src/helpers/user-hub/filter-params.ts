import { listToApiArray } from "@/helpers/filter-params";
import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import { UserHubFilterSet, UserHubTab } from "@/types/user-hub";

const STAFF_ROLES = [
  role.admin,
  role.manager,
  role.teacher,
  role.superadmin,
  role.finance,
  role.hr,
];

function buildHubUserRoleFilter(tab: UserHubTab): filterParam {
  if (tab === "staff") {
    return {
      field_name: "roles",
      operator: operatorEnum.overlap,
      value: listToApiArray(STAFF_ROLES),
    };
  }

  return {
    field_name: "roles",
    operator: operatorEnum.contained_by,
    value: listToApiArray([role.student]),
  };
}

function buildHubUserActiveFilter(): filterParam {
  return {
    field_name: "is_active",
    operator: operatorEnum.exact,
    value: "true",
  };
}

export function buildHubUserTabCountFilterParams(
  tab: UserHubTab,
): Required<Pick<filterParamsBody, "filter_params">> {
  return {
    filter_params: [buildHubUserRoleFilter(tab), buildHubUserActiveFilter()],
  };
}

export function buildHubUserFilterParams(
  state: UserHubFilterSet,
): Required<Pick<filterParamsBody, "filter_params">> {
  const filter_params: filterParam[] = [buildHubUserRoleFilter(state.tab)];

  if (!state.q && !state.includeInactive) {
    filter_params.push(buildHubUserActiveFilter());
  }

  if (state.incomplete) {
    filter_params.push({
      field_name: "profile_completeness",
      operator: operatorEnum.lt,
      value: "100",
    });
  }

  return { filter_params };
}
