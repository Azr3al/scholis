import type { BuildingCheckin } from "../_types/building-checkins";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListBuildingCheckinsArgs = SearchListArgs;

export const buildingCheckinsSearch = defineSearchListResource<BuildingCheckin>({
  path: "building-checkins",
  keyNamespace: "building-checkins",
});

export const listBuildingCheckins = buildingCheckinsSearch.list;
