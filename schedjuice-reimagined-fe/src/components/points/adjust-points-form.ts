export const MIN_ADJUST_POINTS_NOTE_LENGTH = 3;

export function isAdjustPointsSubmitDisabled(input: {
  pointTypeId: number | null;
  delta: string;
  note: string;
  saving: boolean;
}): boolean {
  if (input.saving) return true;
  if (input.pointTypeId == null) return true;
  const delta = Number(input.delta);
  if (!Number.isFinite(delta) || delta === 0) return true;
  if (input.note.trim().length < MIN_ADJUST_POINTS_NOTE_LENGTH) return true;
  return false;
}
