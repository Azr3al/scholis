import * as z from "zod";

import type { FormConfig, FormConfigField, FormSurface } from "@/types/form-config";
import { isFieldRequired } from "./field-policy";

const TEXT_DEFAULT_MAX = 100;

function maxLen(rules: Record<string, unknown> | null): number {
  const m = rules?.max_length;
  return typeof m === "number" && m > 0 ? m : TEXT_DEFAULT_MAX;
}

/** Zod for one config field's *value* (before required/optional wrapping). */
function baseZodFor(field: FormConfigField): z.ZodTypeAny {
  const rules = field.validationRules;
  switch (field.fieldType) {
    case "textarea":
    case "text":
      return z.string().max(maxLen(rules));
    case "email":
      return z.string().max(maxLen(rules)).email();
    case "url":
      return z.string().max(maxLen(rules)).url();
    case "number": {
      let n = z.coerce.number();
      if (typeof rules?.min === "number") n = n.min(rules.min as number);
      if (typeof rules?.max === "number") n = n.max(rules.max as number);
      return n;
    }
    case "date":
      return z.coerce.date();
    case "datetime":
      return z.string();
    case "boolean":
      return z.boolean();
    case "choice": {
      const vals = (field.choices ?? []).map((c) => c.value);
      return vals.length ? z.enum(vals as [string, ...string[]]) : z.string();
    }
    case "multichoice":
      return z.array(z.string());
    case "attachment": {
      const maxFiles =
        typeof rules?.max_files === "number" ? (rules.max_files as number) : 1;
      return z
        .array(
          z.object({
            id: z.number(),
          }),
        )
        .max(maxFiles);
    }
    default:
      return z.unknown();
  }
}

function wrapRequired(zod: z.ZodTypeAny, required: boolean): z.ZodTypeAny {
  return required ? zod : zod.optional();
}

/**
 * Overlay /form-config policy onto the hardcoded base user schema.
 * - custom fields -> `custom_data` object shape (passthrough, optional)
 * - builtin fields -> tighten the matching top-level base field to required when policy requires it
 */
export function buildConfigSchema(
  base: z.ZodObject<any, any, any, any, any>,
  config: FormConfig,
  surface: FormSurface
): z.ZodObject<any, any, any, any, any> {
  const customShape: Record<string, z.ZodTypeAny> = {};
  const builtinOverrides: Record<string, z.ZodTypeAny> = {};

  for (const group of config.groups) {
    for (const field of group.fields) {
      const required = isFieldRequired(field, surface);
      if (field.source === "custom") {
        let zodType = baseZodFor(field);
        if (required && field.fieldType === "attachment") {
          zodType = (zodType as z.ZodArray<z.ZodTypeAny>).min(
            1,
            "At least one file is required.",
          );
        }
        customShape[field.fieldKey] = wrapRequired(zodType, required);
      } else if (required) {
        // Only tighten; build a fresh required validator for the builtin value.
        builtinOverrides[field.fieldKey] = baseZodFor(field);
      }
    }
  }

  let next = base;
  if (Object.keys(builtinOverrides).length > 0) {
    next = next.merge(z.object(builtinOverrides));
  }

  const hasCustom = Object.keys(customShape).length > 0;
  next = next.merge(
    z.object({
      custom_data: hasCustom
        ? z.object(customShape).passthrough().optional().describe("Custom fields")
        : z.record(z.string(), z.unknown()).optional(),
    })
  );

  return next;
}
