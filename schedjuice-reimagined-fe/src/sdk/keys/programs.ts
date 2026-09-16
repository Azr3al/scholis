import type { SearchListArgs } from "../core/define-search-list";
import { programsSearch } from "../resources/programs";

export type ProgramsListKeyArgs = SearchListArgs;

export const programsKeys = programsSearch.keys;
