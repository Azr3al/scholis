import type { UserEvent } from "../_types/user-events";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListUserEventsArgs = SearchListArgs;

export const userEventsSearch = defineSearchListResource<UserEvent>({
  path: "user-events",
  keyNamespace: "user-events",
});

export const listUserEvents = userEventsSearch.list;
