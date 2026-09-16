"use client";

import { Menu, buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { QuestionType } from "@/types/quiz-v3";
import { NavArrowDown as ChevronDown } from "iconoir-react";

const QUESTION_TYPE_MENU: { type: QuestionType; label: string }[] = [
  { type: QuestionType.SingleChoice, label: "Single choice" },
  { type: QuestionType.MultipleChoice, label: "Multiple choice" },
  { type: QuestionType.FillInBlank, label: "Fill in the blank" },
  { type: QuestionType.TrueFalse, label: "True / False" },
  { type: QuestionType.ShortAnswer, label: "Short answer" },
  { type: QuestionType.Essay, label: "Essay" },
];

type Props = {
  value: QuestionType;
  onChange: (t: QuestionType) => void;
  disabled?: boolean;
};

export function QuestionTypeMenu({ value, onChange, disabled }: Props) {
  const selectedLabel =
    QUESTION_TYPE_MENU.find((item) => item.type === value)?.label ??
    "Question type";

  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "secondary", size: "md" }),
          "cursor-pointer gap-1 min-w-0 max-w-full justify-between",
        )}
        aria-label={`Question type: ${selectedLabel}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup>
            {QUESTION_TYPE_MENU.map(({ type, label }) => (
              <Menu.Item
                key={type}
                className="cursor-pointer"
                onClick={() => onChange(type)}
                disabled={value === type}
              >
                {label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
