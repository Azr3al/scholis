import type { Program } from "../_types/programs";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListProgramsArgs = SearchListArgs;

export const programsSearch = defineSearchListResource<Program>({
  path: "programs",
  keyNamespace: "programs",
});

export const listPrograms = programsSearch.list;
