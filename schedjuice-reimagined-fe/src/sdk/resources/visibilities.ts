import type { Visibility } from "../_types/visibilities";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListVisibilitiesArgs = SearchListArgs;

export const visibilitiesSearch = defineSearchListResource<Visibility>({
  path: "visibilities",
  keyNamespace: "visibilities",
});

export const listVisibilities = visibilitiesSearch.list;
