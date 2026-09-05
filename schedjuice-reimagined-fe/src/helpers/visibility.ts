import { accountType } from "@/types/user";
import * as z from "zod";
import { getPropertyPaths } from "./getPropertyPaths";

/**
 *
 * @param user logged in user
 * @param visibilitySchema the schema defining excludable columns of a particular model
 * @param visibilityKey the key where the chosen columns are stored in user.visibility.settings field
 */
export const getExcludedColumns = (
  user: accountType,
  visibilitySchema: z.Schema<any>,
  visibilityKey: string
) => {
  let excludedColumns: string[] = [];
  // @ts-ignore
  if (user && user.visibility && user.visibility.settings) {
    const propertyPaths = getPropertyPaths(visibilitySchema);
    // @ts-ignore
    const userSettings = user.visibility.settings[visibilityKey] || [];
    
    const temp = propertyPaths.filter(path => !userSettings.includes(path));
    excludedColumns = temp;
  }
  return excludedColumns;
};
