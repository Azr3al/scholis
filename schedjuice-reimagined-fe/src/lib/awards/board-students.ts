import type { AwardBoardStudent } from "@/types/award";

export function studentsWithGrants(
  students: AwardBoardStudent[],
): AwardBoardStudent[] {
  return students.filter((row) => row.grants.length > 0);
}

export function hasAnyGrant(students: AwardBoardStudent[]): boolean {
  return students.some((row) => row.grants.length > 0);
}
