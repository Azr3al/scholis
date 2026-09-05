"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { ReceiverSideScreenshot } from "../_types/receiver-side-screenshots";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { receiverSideScreenshotsSearch } from "../resources/receiver-side-screenshots";

export type UseReceiverSideScreenshotsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useReceiverSideScreenshotsList(
  args: UseReceiverSideScreenshotsListArgs,
): ResourceListResult<ReceiverSideScreenshot> {
  return useSearchListQuery(receiverSideScreenshotsSearch, args);
}
