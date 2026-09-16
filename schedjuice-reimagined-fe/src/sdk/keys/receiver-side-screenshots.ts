import type { SearchListArgs } from "../core/define-search-list";
import { receiverSideScreenshotsSearch } from "../resources/receiver-side-screenshots";

export type ReceiverSideScreenshotsListKeyArgs = SearchListArgs;

export const receiverSideScreenshotsKeys = receiverSideScreenshotsSearch.keys;
