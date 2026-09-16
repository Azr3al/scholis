import type { ReceiverSideScreenshot } from "../_types/receiver-side-screenshots";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListReceiverSideScreenshotsArgs = SearchListArgs;

export const receiverSideScreenshotsSearch = defineSearchListResource<ReceiverSideScreenshot>({
  path: "receiver-side-screenshots",
  keyNamespace: "receiver-side-screenshots",
});

export const listReceiverSideScreenshots = receiverSideScreenshotsSearch.list;
