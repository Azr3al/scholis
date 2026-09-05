import type { Organization } from "../_types/organizations";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListOrganizationsArgs = SearchListArgs;

export const organizationsSearch = defineSearchListResource<Organization>({
  path: "organizations",
  keyNamespace: "organizations",
});

export const listOrganizations = organizationsSearch.list;
