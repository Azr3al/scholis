import type { Attendance } from "../_types/attendances";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListAttendancesArgs = SearchListArgs;

export const attendancesSearch = defineSearchListResource<Attendance>({
  path: "attendances",
  keyNamespace: "attendances",
});

export const listAttendances = attendancesSearch.list;
