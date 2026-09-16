import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { seniorityEnum } from "@/types/course";

type UserCourseRow = {
  course?: { id: number } | number | null;
};

export async function fetchTeachingCourseIds(userId: number): Promise<number[]> {
  const res = await searchEntities(
    "user-courses",
    { size: -1, fields: ["course"] },
    {
      filter_params: [
        { field_name: "user_id", operator: operatorEnum.exact, value: String(userId) },
        {
          field_name: "assigned_as_role__seniority",
          operator: operatorEnum.in,
          value: [seniorityEnum.MAIN_TEACHER, seniorityEnum.ASSISTANT_TEACHER].join(","),
        },
      ],
    },
  );

  const ids = new Set<number>();
  for (const row of (res.data.data ?? []) as UserCourseRow[]) {
    const course = row.course;
    if (typeof course === "number") {
      ids.add(course);
    } else if (course && typeof course.id === "number") {
      ids.add(course.id);
    }
  }
  return Array.from(ids);
}
