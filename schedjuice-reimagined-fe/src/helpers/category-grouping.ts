import type { categoryType, courseType } from "@/types/course";

export function getCategoryDisplayName(course: courseType): string {
  const c = course.category;
  if (c && typeof c === "object" && "name" in c) {
    return (c as categoryType).name || "Uncategorized";
  }
  return "Uncategorized";
}

export function getCategorySortOrderFromCourse(course: courseType): number {
  const c = course.category;
  if (
    c &&
    typeof c === "object" &&
    typeof (c as categoryType).sort_order === "number"
  ) {
    return (c as categoryType).sort_order;
  }
  return 0;
}
