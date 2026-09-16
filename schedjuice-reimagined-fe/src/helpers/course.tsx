import { filterParamsBody, operatorEnum } from "@/types/api";
import { getActiveCourseFilterParams } from "./date";
import { accountType, role } from "@/types/user";
import { hasSchoolWideCourseAccess } from "./authorization";

export const getCourseOfUserFilterParams = (u: accountType) => {
    const fParams: filterParamsBody = {
        filter_params: [...getActiveCourseFilterParams()],
    };
    if (u.roles?.includes(role.teacher) && !hasSchoolWideCourseAccess(u)) {
        fParams.filter_params?.push({
            field_name: "user_courses__user_id|created_by",
            operator: operatorEnum.exact,
            value: String(u.id),
        });
    }
    return fParams;
};

export const getCourseStudentFilterParams = (courseId: string) => {
    const fParams: filterParamsBody = {
        filter_params: [
            {
                field_name: "user_courses__course_id",
                value: String(courseId),
                operator: operatorEnum.exact,
            },
            {
                field_name: "user_courses__assigned_as",
                value: "student",
                operator: operatorEnum.exact,
            },
        ],
    }
    return fParams;
}