import type { InputHTMLAttributes } from "react";
import type { DefaultValues } from "react-hook-form";
import { z } from "zod";

import type { AutoFormGroup, ZodObjectOrWrapped } from "./types";

export function beautifyObjectName(string: string) {
  const withSpaces = string
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim();
  return withSpaces.replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettifyEnumLabel(label: string): string {
  return label.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getBaseSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if ("innerType" in schema._def) {
    return getBaseSchema(schema._def.innerType as z.ZodTypeAny);
  }
  if ("schema" in schema._def) {
    return getBaseSchema(schema._def.schema as z.ZodTypeAny);
  }
  return schema;
}

export function getBaseType(schema: z.ZodTypeAny): string {
  return getBaseSchema(schema)._def.typeName as string;
}

function getZodFieldDescription(
  schema: z.ZodTypeAny,
): string | undefined {
  let current: z.ZodTypeAny = schema;
  for (let depth = 0; depth < 24; depth++) {
    if (!current?._def) return undefined;
    const d = current._def.description;
    if (typeof d === "string" && d.trim().length > 0) {
      return d.trim();
    }
    if ("innerType" in current._def) {
      current = current._def.innerType as z.ZodTypeAny;
      continue;
    }
    if ("schema" in current._def) {
      current = current._def.schema as z.ZodTypeAny;
      continue;
    }
    return undefined;
  }
  return undefined;
}

export function resolveAutoFormLabel(
  fieldKey: string,
  zodItem: z.ZodTypeAny,
  customLabel?: string,
): string {
  if (typeof customLabel === "string" && customLabel.trim().length > 0) {
    return customLabel.trim();
  }
  const fromZod = getZodFieldDescription(zodItem);
  if (fromZod) return fromZod;
  const pretty = beautifyObjectName(fieldKey).trim();
  return pretty.length > 0 ? pretty : fieldKey;
}

export function getObjectFormSchema(
  schema: ZodObjectOrWrapped | undefined,
): z.ZodObject<any, any> {
  if (schema == null || !("_def" in schema)) {
    throw new Error(
      "AutoForm: formSchema is missing or invalid. This often indicates a circular import between types.",
    );
  }
  if (schema._def.typeName === "ZodEffects") {
    const typedSchema = schema as z.ZodEffects<z.ZodObject<any, any>>;
    const inner = typedSchema._def.schema;
    if (inner == null) {
      throw new Error("AutoForm: ZodEffects inner schema is undefined.");
    }
    return getObjectFormSchema(inner as ZodObjectOrWrapped);
  }
  const rootDef = (schema as z.ZodTypeAny)._def;
  if (rootDef.typeName !== "ZodObject") {
    throw new Error(
      `AutoForm: root schema must be ZodObject (or ZodEffects wrapping one); got ${String(rootDef.typeName)}.`,
    );
  }
  return schema as z.ZodObject<any, any>;
}

function getDefaultValueInZodStack(schema: z.ZodTypeAny): any {
  const typedSchema = schema as unknown as z.ZodDefault<
    z.ZodNumber | z.ZodString
  >;

  if (typedSchema._def.typeName === "ZodDefault") {
    return typedSchema._def.defaultValue();
  }

  if ("innerType" in typedSchema._def) {
    return getDefaultValueInZodStack(
      typedSchema._def.innerType as unknown as z.ZodTypeAny,
    );
  }
  if ("schema" in typedSchema._def) {
    return getDefaultValueInZodStack(
      (typedSchema._def as any).schema as z.ZodTypeAny,
    );
  }
  return undefined;
}

export function getDefaultValues<Schema extends z.ZodObject<any, any>>(
  schema: Schema | ZodObjectOrWrapped,
) {
  const objectSchema = getObjectFormSchema(schema as ZodObjectOrWrapped) as Schema;
  const { shape } = objectSchema;
  type DefaultValuesType = DefaultValues<Partial<z.infer<Schema>>>;
  const defaultValues = {} as DefaultValuesType;

  for (const key of Object.keys(shape)) {
    const item = shape[key] as z.ZodTypeAny;

    if (getBaseType(item) === "ZodObject") {
      const defaultItems = getDefaultValues(
        getBaseSchema(item) as unknown as z.ZodObject<any, any>,
      );
      for (const defaultItemKey of Object.keys(defaultItems)) {
        const pathKey = `${key}.${defaultItemKey}` as keyof DefaultValuesType;
        defaultValues[pathKey] = defaultItems[defaultItemKey];
      }
    } else {
      const defaultValue = getDefaultValueInZodStack(item);
      if (defaultValue !== undefined) {
        defaultValues[key as keyof DefaultValuesType] = defaultValue;
      }
    }
  }

  return defaultValues;
}

export function getZodEnumSelectOptions(
  zodItem: z.ZodTypeAny,
  labelOverrides?: Record<string, string>,
) {
  const baseValues = (getBaseSchema(zodItem) as z.ZodNativeEnum<any>)._def
    .values;
  const rawValues: (string | number)[] = Array.isArray(baseValues)
    ? baseValues
    : (Object.values(baseValues) as (string | number)[]).filter(
        (v) => typeof v === "string" || typeof v === "number",
      );

  const seen = new Set<string>();
  const options: {
    rawValue: string | number;
    valueStr: string;
    labelText: string;
  }[] = [];

  for (const raw of rawValues) {
    const valueStr = String(raw);
    if (seen.has(valueStr)) continue;
    seen.add(valueStr);
    options.push({
      rawValue: raw,
      valueStr,
      labelText: labelOverrides?.[valueStr] ?? prettifyEnumLabel(valueStr),
    });
  }

  return options;
}

export function isZodFieldRequired(schema: z.ZodTypeAny): boolean {
  let current = schema;
  for (let i = 0; i < 24; i++) {
    const typeName = current._def.typeName as string;
    if (typeName === "ZodOptional" || typeName === "ZodNullable") return false;
    if (typeName === "ZodDefault") return false;
    if (typeName === "ZodEffects" && "schema" in current._def) {
      current = current._def.schema as z.ZodTypeAny;
      continue;
    }
    if ("innerType" in current._def) {
      current = current._def.innerType as z.ZodTypeAny;
      continue;
    }
    break;
  }
  return true;
}

function stringSchemaHasMinCheck(schema: z.ZodTypeAny): boolean {
  const base = getBaseSchema(schema);
  if (base._def.typeName !== "ZodString") return false;
  const checks = (base._def as z.ZodStringDef).checks ?? [];
  return checks.some((check) => check.kind === "min");
}

function addMinLengthToZodString(
  schema: z.ZodTypeAny,
  message: string,
): z.ZodTypeAny {
  const typeName = schema._def.typeName as string;

  if (typeName === "ZodEffects" && "schema" in schema._def) {
    const effect = schema._def.effect as {
      type: string;
      refinement?: (arg: unknown, ctx: z.RefinementCtx) => void;
      transform?: (arg: unknown, ctx: z.RefinementCtx) => unknown;
    };
    const inner = addMinLengthToZodString(schema._def.schema as z.ZodTypeAny, message);
    if (effect.type === "refinement" && effect.refinement) {
      return inner.superRefine(effect.refinement);
    }
    if (effect.type === "transform" && effect.transform) {
      return inner.transform(effect.transform);
    }
    return inner;
  }

  if (typeName === "ZodCoerce") {
    const desc = schema._def.description;
    let result = z.coerce.string().min(1, message);
    if (typeof desc === "string") result = result.describe(desc);
    return result;
  }

  if (typeName === "ZodString") {
    const desc = schema._def.description;
    let result = (schema as z.ZodString).min(1, message);
    if (typeof desc === "string") result = result.describe(desc);
    return result;
  }

  return schema;
}

function enhanceRequiredStringField(
  fieldKey: string,
  zodItem: z.ZodTypeAny,
): z.ZodTypeAny {
  if (!isZodFieldRequired(zodItem)) return zodItem;
  if (getBaseType(zodItem) !== "ZodString") return zodItem;
  if (stringSchemaHasMinCheck(zodItem)) return zodItem;

  const label = resolveAutoFormLabel(fieldKey, zodItem);
  return addMinLengthToZodString(zodItem, `${label} is required`);
}

function enhanceObjectShape(
  objectSchema: z.ZodObject<any, any>,
): z.ZodObject<any, any> {
  const shape = objectSchema.shape;
  const nextShape: Record<string, z.ZodTypeAny> = {};

  for (const [key, zodItem] of Object.entries(shape)) {
    nextShape[key] = enhanceRequiredStringField(key, zodItem as z.ZodTypeAny);
  }

  return z.object(nextShape);
}

function collectEffects(
  schema: z.ZodTypeAny,
): Array<{
  type: string;
  refinement?: (arg: unknown, ctx: z.RefinementCtx) => void;
  transform?: (arg: unknown, ctx: z.RefinementCtx) => unknown;
}> {
  const effects: Array<{
    type: string;
    refinement?: (arg: unknown, ctx: z.RefinementCtx) => void;
    transform?: (arg: unknown, ctx: z.RefinementCtx) => unknown;
  }> = [];
  let current = schema;
  while (current._def.typeName === "ZodEffects") {
    effects.push(current._def.effect);
    current = current._def.schema as z.ZodTypeAny;
  }
  return effects;
}

function applyEffects(
  schema: z.ZodTypeAny,
  effects: ReturnType<typeof collectEffects>,
): z.ZodTypeAny {
  let result = schema;
  for (const effect of effects) {
    if (effect.type === "refinement" && effect.refinement) {
      result = result.superRefine(effect.refinement);
      continue;
    }
    if (effect.type === "transform" && effect.transform) {
      result = result.transform(effect.transform);
    }
  }
  return result;
}

/** Adds field-specific empty-string messages for required string fields in AutoForm. */
export function withRequiredEmptyStringMessages(
  schema: ZodObjectOrWrapped,
): ZodObjectOrWrapped {
  const effects = collectEffects(schema as z.ZodTypeAny);
  const objectSchema = getObjectFormSchema(schema);
  const enhancedObject = enhanceObjectShape(objectSchema);
  return applyEffects(enhancedObject, effects) as ZodObjectOrWrapped;
}

export function zodToHtmlInputProps(
  schema:
    | z.ZodNumber
    | z.ZodString
    | z.ZodOptional<z.ZodNumber | z.ZodString>
    | any,
): InputHTMLAttributes<HTMLInputElement> {
  if (["ZodOptional", "ZodNullable"].includes(schema._def.typeName)) {
    const typedSchema = schema as z.ZodOptional<z.ZodNumber | z.ZodString>;
    return {
      ...zodToHtmlInputProps(typedSchema._def.innerType),
      required: false,
    };
  }

  const typedSchema = schema as z.ZodNumber | z.ZodString;

  if (!("checks" in typedSchema._def)) return {};

  const { checks } = typedSchema._def;
  const inputProps: InputHTMLAttributes<HTMLInputElement> = {
    required: true,
  };
  const type = getBaseType(schema);

  for (const check of checks) {
    if (check.kind === "min") {
      if (type === "ZodString") {
        inputProps.minLength = check.value;
      } else {
        inputProps.min = check.value;
      }
    }
    if (check.kind === "max") {
      if (type === "ZodString") {
        inputProps.maxLength = check.value;
      } else {
        inputProps.max = check.value;
      }
    }
  }

  return inputProps;
}

/** Temporary default until F1/F2 pages supply real groups. */
export function defaultDetailsGroup(
  schema: ZodObjectOrWrapped,
): AutoFormGroup[] {
  const objectSchema = getObjectFormSchema(schema);
  return [
    {
      id: "details",
      title: "Details",
      fields: Object.keys(objectSchema.shape),
    },
  ];
}
