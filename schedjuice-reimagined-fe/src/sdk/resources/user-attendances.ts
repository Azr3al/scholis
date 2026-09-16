import type { UserAttendance } from "../_types/user-attendances";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListUserAttendancesArgs = SearchListArgs;

export const userAttendancesSearch = defineSearchListResource<UserAttendance>({
  path: "user-attendances",
  keyNamespace: "user-attendances",
});

export const listUserAttendances = userAttendancesSearch.list;
