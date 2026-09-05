import type { SearchListArgs } from "../core/define-search-list";
import { organizationsSearch } from "../resources/organizations";

export type OrganizationsListKeyArgs = SearchListArgs;

export const organizationsKeys = organizationsSearch.keys;
