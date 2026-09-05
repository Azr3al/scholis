import type { Intake } from "../_types/intakes";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListIntakesArgs = SearchListArgs;

export const intakesSearch = defineSearchListResource<Intake>({
  path: "intakes",
  keyNamespace: "intakes",
});

export const listIntakes = intakesSearch.list;
