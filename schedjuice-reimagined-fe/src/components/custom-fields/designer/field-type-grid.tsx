"use client";

import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

import { AlignLeft, Attachment as Paperclip, Calendar, Calendar as CalendarClock, CheckSquare, Hashtag as Hash, Link as Link2, List, TaskList as ListChecks, Lock, Mail, Type } from "iconoir-react";

export const FIELD_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "textarea", label: "Paragraph", icon: AlignLeft },
  { value: "number", label: "Number", icon: Hash },
  { value: "date", label: "Date", icon: Calendar },
  { value: "datetime", label: "Date & time", icon: CalendarClock },
  { value: "boolean", label: "Yes / No", icon: CheckSquare },
  { value: "choice", label: "Single choice", icon: List },
  { value: "multichoice", label: "Multi choice", icon: ListChecks },
  { value: "email", label: "Email", icon: Mail },
  { value: "url", label: "Link", icon: Link2 },
  { value: "attachment", label: "File upload", icon: Paperclip },
] as const;

export type FieldTypeValue = (typeof FIELD_TYPES)[number]["value"];

export type FieldTypeGridExtra = {
  value: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function FieldTypeGrid({
  value,
  onChange,
  disabled = false,
  extraTypes = [],
}: {
  value: string;
  onChange: (next: FieldTypeValue | string) => void;
  disabled?: boolean;
  extraTypes?: ReadonlyArray<FieldTypeGridExtra>;
}) {
  const allTypes = [...FIELD_TYPES, ...extraTypes];

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {allTypes.map(({ value: v, label, icon: Icon }) => {
        const selected = v === value;
        if (disabled && !selected) return null;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition",
              selected
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/40",
              disabled && "cursor-default opacity-80",
            )}
            aria-pressed={selected}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {disabled && selected ? <Lock className="h-3 w-3" /> : null}
          </button>
        );
      })}
    </div>
  );
}
