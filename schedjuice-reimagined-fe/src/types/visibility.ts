import * as z from "zod";
import { accountSchema, role } from "./user";
import { getPropertyPaths } from "@/helpers/getPropertyPaths";

export const getTogglableKeys = (schema: z.Schema<any>) => {
  const keys: Record<
    string,
    {
      default: boolean;
      disabled: boolean;
      label: string;
    }
  > = {};
  getPropertyPaths(schema).forEach((p: any) => {

    keys[p] = {
      default: true,
      disabled: false,
      // @ts-ignore
      label: schema.shape[p]._def.description || p
    };
  });
  return keys;
};

export const visibilitySchema = z.object({
  id: z.number(),
  name: z.string(),
  settings: z.any(),
  created_by: accountSchema.optional(),
  role: z.nativeEnum(role),
  created_at: z.date(),
  updated_at: z.date(),
});

export const visibilityCreateSchema = visibilitySchema.pick({
  name: true,
  role: true,
})
