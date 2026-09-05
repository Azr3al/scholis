import { getObjectFormSchema } from "@/components/auto-form";
import { getBaseType } from "@/components/auto-form/schema-utils";
import type { FieldConfigItem } from "@/components/auto-form";
import { organizationOwnerEditSchema } from "@/types/organization";
import type { z } from "zod";

/** Default org profile booleans to switch controls (label left, toggle right). */
export function orgBooleanSwitchDefaults(): Record<string, FieldConfigItem> {
  const shape = getObjectFormSchema(organizationOwnerEditSchema).shape;
  return Object.fromEntries(
    Object.entries(shape)
      .filter(
        ([, zodItem]) =>
          getBaseType(zodItem as z.ZodTypeAny) === "ZodBoolean",
      )
      .map(([key]) => [key, { fieldType: "switch" as const }]),
  );
}
