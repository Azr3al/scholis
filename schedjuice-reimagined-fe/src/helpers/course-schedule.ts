import { makePostRequest } from "@/app/client-api/utils";
import { relationFkToPkNullable } from "@/helpers/relation-fk";
import { assertSchedjuiceSuccess } from "@/lib/schedjuice-api-response";
import type { eventType } from "@/types/course";
import type {
  ScheduleResolveMode,
  ScheduleResolveResponse,
} from "@/types/course-schedule";

export function serializeEventsForEditEventsApi(
  events: Partial<eventType>[],
  courseId?: number,
): Record<string, unknown>[] {
  return events.map((event) => {
    const row: Record<string, unknown> = {
      id: event.id,
      ...(event.title != null && { title: event.title }),
      ...(event.date != null && { date: event.date }),
      ...(event.time_from != null && { time_from: event.time_from }),
      ...(event.time_to != null && { time_to: event.time_to }),
      ...(event.is_deleted && { is_deleted: true }),
      ...(event.is_edit && { is_edit: true }),
      ...(event.is_substitution_reserve && {
        is_substitution_reserve: true,
      }),
    };
    if (!event.is_edit && !event.is_deleted && event.course != null) {
      const pk = relationFkToPkNullable(event.course) ?? courseId;
      if (pk != null) row.course = pk;
    }
    return row;
  });
}

export async function postScheduleResolveOverlaps(
  courseId: number,
  body: {
    mode: ScheduleResolveMode;
    draft_events: unknown[];
    survivor?: { draft_id?: string; event_id?: number };
    local_date?: string;
    remove_event_ids?: number[];
    remove_draft_ids?: string[];
  }
): Promise<ScheduleResolveResponse> {
  const res = await makePostRequest(
    `courses/${courseId}/schedule/resolve-overlaps`,
    body
  );
  return assertSchedjuiceSuccess(res) as ScheduleResolveResponse;
}
