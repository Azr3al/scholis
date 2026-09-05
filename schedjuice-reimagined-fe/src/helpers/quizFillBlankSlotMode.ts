import {
  FillBlankAnswerMode,
  type FillBlankChoiceOptionType,
  type FillBlankSlotType,
} from "@/types/quiz-v3";

/** Slots from API/editor: supports snake_case and camelCase keys. */
export function getFillBlankSlotsArray(question: unknown): FillBlankSlotType[] {
  const q = question as Record<string, unknown> | null | undefined;
  if (!q || typeof q !== "object") return [];
  const a = q.fill_blank_slots;
  const b = q.fillBlankSlots;
  const raw =
    Array.isArray(a) && a.length > 0
      ? a
      : Array.isArray(b) && b.length > 0
        ? b
        : Array.isArray(a)
          ? a
          : Array.isArray(b)
            ? b
            : [];
  return raw.filter(Boolean) as FillBlankSlotType[];
}

export function getFillBlankSlotBlankUuid(slot: FillBlankSlotType): string {
  const s = slot as FillBlankSlotType & { blankUuid?: string };
  return String(slot.blank_uuid ?? s.blankUuid ?? "");
}

function coerceChoiceOption(
  item: unknown,
  index: number,
): FillBlankChoiceOptionType {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { text: "", display_order: index };
  }
  const o = item as Record<string, unknown>;
  const text =
    typeof o.text === "string"
      ? o.text
      : typeof o.label === "string"
        ? o.label
        : "";
  const id = typeof o.id === "number" ? o.id : undefined;
  const display_order =
    typeof o.display_order === "number"
      ? o.display_order
      : typeof o.displayOrder === "number"
        ? o.displayOrder
        : index;
  const is_correct =
    typeof o.is_correct === "boolean"
      ? o.is_correct
      : typeof o.isCorrect === "boolean"
        ? o.isCorrect
        : undefined;
  return { id, text, display_order, is_correct };
}

/** Choice rows from slot; reads `choice_options` or `choiceOptions`, coerces DRF shapes. */
export function normalizedFillBlankChoiceOptions(
  slot: FillBlankSlotType,
): FillBlankChoiceOptionType[] {
  const s = slot as unknown as Record<string, unknown>;
  const raw = s.choice_options ?? s.choiceOptions;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item, i) => coerceChoiceOption(item, i));
}

export function getFillBlankSlotAnswerMode(
  slot: FillBlankSlotType,
): FillBlankAnswerMode {
  if (slot.answer_mode === FillBlankAnswerMode.SingleChoice) {
    return FillBlankAnswerMode.SingleChoice;
  }
  if (slot.answer_mode === FillBlankAnswerMode.Typed) {
    return FillBlankAnswerMode.Typed;
  }
  const n = normalizedFillBlankChoiceOptions(slot).length;
  if (n >= 1) {
    return FillBlankAnswerMode.SingleChoice;
  }
  return FillBlankAnswerMode.Typed;
}

export function sortedFillBlankChoiceOptions(
  slot: FillBlankSlotType,
): FillBlankChoiceOptionType[] {
  return [...normalizedFillBlankChoiceOptions(slot)].sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      (a.id ?? 0) - (b.id ?? 0),
  );
}

export function findFillBlankSlotByBlankUuid(
  question: unknown,
  blankUuid: string,
): FillBlankSlotType | undefined {
  return getFillBlankSlotsArray(question).find(
    (s) => getFillBlankSlotBlankUuid(s) === blankUuid,
  );
}
