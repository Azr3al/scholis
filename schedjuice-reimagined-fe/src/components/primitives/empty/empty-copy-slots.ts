export type EmptyCopySlots = {
  enBefore?: string;
  enHighlight: string;
  enAfter?: string;
  myBefore?: string;
  myHighlight: string;
  myAfter?: string;
};

export function plainTextFromSlots(slots: EmptyCopySlots): string {
  const enBefore = slots.enBefore ?? "";
  const enAfter = slots.enAfter ?? "";
  const myBefore = slots.myBefore ?? "";
  const myAfter = slots.myAfter ?? "";
  return `${enBefore}${slots.enHighlight}${enAfter} · ${myBefore}${slots.myHighlight}${myAfter}`;
}
