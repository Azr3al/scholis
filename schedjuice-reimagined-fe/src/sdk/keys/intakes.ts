import type { SearchListArgs } from "../core/define-search-list";
import { intakesSearch } from "../resources/intakes";

export type IntakesListKeyArgs = SearchListArgs;

export const intakesKeys = intakesSearch.keys;
