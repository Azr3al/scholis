import { searchEntities } from "@/app/client-api/utils";
import {
  readMainTeacher,
  type MainTeacherPreview,
} from "@/lib/image-template/bind-award-preview";
import { operatorEnum } from "@/types/api";
import { seniorityEnum } from "@/types/course";

export async function fetchCourseMainTeacher(
  courseId: number | string,
): Promise<MainTeacherPreview> {
  const payload = await searchEntities(
    "user-courses",
    { size: -1, expand: ["user", "assigned_as_role"] },
    {
      filter_params: [
        {
          field_name: "course_id",
          operator: operatorEnum.exact,
          value: String(courseId),
        },
        {
          field_name: "assigned_as_role__seniority",
          operator: operatorEnum.exact,
          value: seniorityEnum.MAIN_TEACHER,
        },
      ],
    },
  );
  return readMainTeacher(payload);
}
