import type { SearchListArgs } from "../core/define-search-list";
import { buildingCheckinsSearch } from "../resources/building-checkins";

export type BuildingCheckinsListKeyArgs = SearchListArgs;

export const buildingCheckinsKeys = buildingCheckinsSearch.keys;
