// copied from https://github.com/colinhacks/zod/discussions/2134
import * as Zod from "zod";

export const getPropertyPaths = (
  schema: Zod.ZodType,
  ignoreOptional = false
): string[] => {
  // Adjusted: Signature now uses Zod.ZodType to eliminate null& undefined check
  // check if schema is nullable or optional
  if (schema instanceof Zod.ZodNullable || schema instanceof Zod.ZodOptional) {
    return getPropertyPaths(schema.unwrap());
  }
  // check if schema is an array
  if (schema instanceof Zod.ZodArray) {
    return getPropertyPaths(schema.element);
  }
  // check if schema is an object
  if (schema instanceof Zod.ZodObject) {
    // get key/value pairs from schema
    let entries = Object.entries<Zod.ZodType>(schema.shape); // Adjusted: Uses Zod.ZodType as generic to remove instanceof check. Since .shape returns ZodRawShape which has Zod.ZodType as type for each key.
    if (ignoreOptional) {
      entries = entries.filter(([key, value]) => {
        return !(
          value instanceof Zod.ZodOptional || value instanceof Zod.ZodNullable
        );
      });
    }
    // loop through key/value pairs
    return entries.flatMap(([key, value]) => {
      // get nested keys
      const nested = getPropertyPaths(value).map(
        (subKey) => `${key}.${subKey}`
      );
      // return nested keys
      return nested.length ? nested : key;
    });
  }
  // return empty array
  return [];
};
