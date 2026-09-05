import type { AttendanceDirtyEditKind } from "./attendance-autosave-debounce";

/** Row IDs that should update AttendanceRowSaveIndicator (status + note). */
export function filterIdsForRowSaveIndicator(
  ids: number[],
  dirtyKindByRow: Record<number, AttendanceDirtyEditKind>,
): number[] {
  return ids.filter((id) => {
    const kind = dirtyKindByRow[id];
    return kind === "status" || kind === "note";
  });
}
