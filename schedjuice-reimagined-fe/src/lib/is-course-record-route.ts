import { isValidApiEntityIdParam } from "@/helpers/relation-fk";

/** True for `/courses/[id]/**` (course record workspace). */
export function isCourseRecordRoute(pathname: string): boolean {
  const match = /^\/courses\/([^/]+)(?:\/.*)?$/.exec(pathname);
  if (!match) {
    return false;
  }
  return isValidApiEntityIdParam(match[1]);
}
