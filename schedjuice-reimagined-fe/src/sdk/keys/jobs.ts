import type { SearchListArgs } from "../core/define-search-list";
import { jobsSearch } from "../resources/jobs";

export type JobsListKeyArgs = SearchListArgs;

export const jobsKeys = jobsSearch.keys;
