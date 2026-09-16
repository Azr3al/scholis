import {
  findOverlapClusters,
  isDraftEventId,
  type OverlapCheckOptions,
} from "@/helpers/calendar";
import {
  postScheduleResolveOverlaps,
  serializeEventsForEditEventsApi,
} from "@/helpers/course-schedule";
import type {
  OverlapMergeEntry,
  PinSurvivorPayload,
  ScheduleResolveMode,
  ScheduleResolveResponse,
} from "@/types/course-schedule";
import { eventType } from "@/types/course";

const timeStringToMinutes = (time: string) => {
  const [h, m] = (time || "0:0").split(":").map((x) => parseInt(x || "0", 10));
  return (h ?? 0) * 60 + (m ?? 0);
};

function pickClientSurvivor(cluster: Partial<eventType>[]): Partial<eventType> {
  return [...cluster].sort(
    (a, b) =>
      timeStringToMinutes(a.time_from || "0:0") -
        timeStringToMinutes(b.time_from || "0:0") ||
      String(a.id ?? "").localeCompare(String(b.id ?? ""))
  )[0];
}

function buildClientOnlyResult(
  clusters: Partial<eventType>[][]
): ScheduleResolveResponse {
  const clientDeletes: string[] = [];
  for (const cluster of clusters) {
    const survivor = pickClientSurvivor(cluster);
    for (const event of cluster) {
      if (event === survivor) continue;
      if (isDraftEventId(event.id)) {
        clientDeletes.push(String(event.id));
      }
    }
  }
  return {
    client_deletes: clientDeletes,
    deferred_merges: [],
    applied: {
      events_removed: [],
      events_kept: [],
      users_merged_count: 0,
    },
    events: [],
  };
}

function clusterNeedsBackend(clusters: Partial<eventType>[][]): boolean {
  return clusters.some((cluster) =>
    cluster.some((event) => !isDraftEventId(event.id))
  );
}

export function applyResolveResultToEvents(
  flatEvents: Partial<eventType>[],
  apiResult: ScheduleResolveResponse,
  refreshedEvents?: unknown[]
): {
  events: Partial<eventType>[];
  deferredMerges: OverlapMergeEntry[];
  removedCount: number;
  usersMergedCount: number;
} {
  const deleteIds = new Set(apiResult.client_deletes.map(String));
  const removedPersisted = new Set(
    apiResult.applied.events_removed.map(String)
  );

  let next = flatEvents
    .filter((event) => {
      const id = String(event.id ?? "");
      if (deleteIds.has(id)) return false;
      if (event.id != null && removedPersisted.has(String(event.id))) {
        return false;
      }
      return true;
    })
    .map((event) => ({ ...event }));

  if (Array.isArray(refreshedEvents) && refreshedEvents.length > 0) {
    const byId = new Map<string, Partial<eventType>>();
    for (const raw of refreshedEvents as Partial<eventType>[]) {
      if (raw.id != null) byId.set(String(raw.id), raw);
    }
    next = next.map((event) => {
      if (isDraftEventId(event.id)) return event;
      const refreshed = byId.get(String(event.id));
      return refreshed ? { ...event, ...refreshed, is_deleted: false } : event;
    });
  }

  const removedCount =
    apiResult.client_deletes.length + apiResult.applied.events_removed.length;

  return {
    events: next,
    deferredMerges: apiResult.deferred_merges,
    removedCount,
    usersMergedCount: apiResult.applied.users_merged_count,
  };
}

export function serializeDraftEvents(
  flatEvents: Partial<eventType>[],
  courseId?: number,
): Record<string, unknown>[] {
  return serializeEventsForEditEventsApi(flatEvents, courseId);
}

export async function resolveScheduleOverlaps(args: {
  courseId: number;
  flatEvents: Partial<eventType>[];
  mode: ScheduleResolveMode;
  pinSurvivor?: PinSurvivorPayload;
  extraDraftEvents?: Partial<eventType>[];
  overlapOptions?: OverlapCheckOptions;
}): Promise<{
  events: Partial<eventType>[];
  deferredMerges: OverlapMergeEntry[];
  summary: { removedCount: number; usersMergedCount: number };
}> {
  const combined = [...args.flatEvents, ...(args.extraDraftEvents ?? [])];
  const active = combined.filter((event) => !event.is_deleted);
  const clusters = findOverlapClusters(active, args.overlapOptions);
  if (!clusters.length) {
    return {
      events: args.flatEvents,
      deferredMerges: [],
      summary: { removedCount: 0, usersMergedCount: 0 },
    };
  }

  const draftPayload = serializeDraftEvents(combined, args.courseId);
  let apiResult: ScheduleResolveResponse;

  if (args.mode === "pin_survivor" && args.pinSurvivor) {
    apiResult = await postScheduleResolveOverlaps(args.courseId, {
      mode: "pin_survivor",
      draft_events: draftPayload,
      survivor: {
        ...(args.pinSurvivor.draftId
          ? { draft_id: args.pinSurvivor.draftId }
          : {}),
        ...(args.pinSurvivor.eventId != null
          ? { event_id: args.pinSurvivor.eventId }
          : {}),
      },
      local_date: args.pinSurvivor.localDate,
      remove_event_ids: args.pinSurvivor.removeEventIds,
      remove_draft_ids: args.pinSurvivor.removeDraftIds,
    });
  } else if (clusterNeedsBackend(clusters)) {
    apiResult = await postScheduleResolveOverlaps(args.courseId, {
      mode: "auto_global",
      draft_events: draftPayload,
    });
  } else {
    apiResult = buildClientOnlyResult(clusters);
  }

  const applied = applyResolveResultToEvents(
    args.flatEvents,
    apiResult,
    apiResult.events
  );

  return {
    events: applied.events,
    deferredMerges: applied.deferredMerges,
    summary: {
      removedCount: applied.removedCount,
      usersMergedCount: applied.usersMergedCount,
    },
  };
}

export function formatOverlapFixToast(summary: {
  removedCount: number;
  usersMergedCount: number;
}): string {
  const base = `Removed ${summary.removedCount} duplicate session${
    summary.removedCount === 1 ? "" : "s"
  }.`;
  if (summary.usersMergedCount > 0) {
    return `${base} ${summary.usersMergedCount} attendance record${
      summary.usersMergedCount === 1 ? "" : "s"
    } preserved.`;
  }
  return base;
}
