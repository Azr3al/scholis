export type ScheduleResolveMode = "auto_global" | "pin_survivor";

export type OverlapMergeEntry = {
  survivor_draft_id: string;
  source_event_ids: number[];
};

export type ScheduleResolveResponse = {
  client_deletes: string[];
  deferred_merges: OverlapMergeEntry[];
  applied: {
    events_removed: number[];
    events_kept: number[];
    users_merged_count: number;
  };
  events: unknown[];
};

export type PinSurvivorPayload = {
  draftId?: string;
  eventId?: number;
  localDate: string;
  removeEventIds: number[];
  removeDraftIds: string[];
};
