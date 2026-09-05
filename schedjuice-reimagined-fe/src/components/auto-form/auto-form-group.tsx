"use client";

import { useState, type ReactNode } from "react";
import { NavArrowDown } from "iconoir-react";
import type { z } from "zod";

import { cn } from "@/lib/utils";

import { AutoFormField } from "./auto-form-field";
import type { AutoFormGroup, FieldConfigItem } from "./types";
import type { FieldMeasure } from "@/lib/ui/field-measure";

export type AutoFormGroupProps = {
  group: AutoFormGroup;
  shape: z.ZodRawShape;
  fieldConfig?: Record<string, FieldConfigItem>;
  formMeasure?: FieldMeasure;
  isLoading?: boolean;
  onFieldBlur?: (name: string) => void;
  /** Optional whisper when the group has failed autosaves. */
  statusSlot?: ReactNode;
  /** When true, skip the group title/description header (panel already shows h2). */
  hideHeader?: boolean;
};

export function AutoFormGroupSection({
  group,
  shape,
  fieldConfig,
  formMeasure,
  isLoading,
  onFieldBlur,
  statusSlot,
  hideHeader = false,
}: AutoFormGroupProps) {
  const [open, setOpen] = useState(!group.collapsible);

  return (
    <section
      data-slot="auto-form-group"
      data-group-id={group.id}
      className="flex flex-col gap-4"
    >
      {!hideHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            {group.collapsible ? (
              <button
                type="button"
                className="flex items-center gap-1.5 text-left text-base font-medium text-text-primary"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                <NavArrowDown
                  width={16}
                  height={16}
                  className={cn(
                    "shrink-0 text-text-muted transition-transform duration-[var(--duration-fast)]",
                    !open && "-rotate-90",
                  )}
                  aria-hidden
                />
                {group.title}
              </button>
            ) : (
              <h3 className="text-base font-medium text-text-primary">
                {group.title}
              </h3>
            )}
            {group.description ? (
              <p className="text-sm text-text-muted">{group.description}</p>
            ) : null}
          </div>
          {statusSlot ? (
            <div className="min-h-5 shrink-0" data-slot="auto-form-group-status">
              {statusSlot}
            </div>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="flex w-full flex-col gap-5 max-sm:gap-4">
          {group.fields.map((fieldName) => {
            const zodItem = shape[fieldName] as z.ZodTypeAny | undefined;
            if (!zodItem) return null;
            return (
              <AutoFormField
                key={fieldName}
                name={fieldName}
                zodItem={zodItem}
                fieldConfigItem={fieldConfig?.[fieldName]}
                formMeasure={formMeasure}
                groupMeasure={group.measure}
                isLoading={isLoading}
                onFieldBlur={onFieldBlur}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
