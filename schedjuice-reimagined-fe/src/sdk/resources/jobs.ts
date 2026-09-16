import type { Job } from "../_types/jobs";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListJobsArgs = SearchListArgs;

export const jobsSearch = defineSearchListResource<Job>({
  path: "jobs",
  keyNamespace: "jobs",
});

export const listJobs = jobsSearch.list;
