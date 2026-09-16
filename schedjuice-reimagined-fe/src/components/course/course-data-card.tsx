import { GraduationCap, Group as Users } from "iconoir-react";
import CourseInfoCard from "./course-info-card";
import { UserCheckinButton } from "./user-checkin-button";
import { CourseHeaderProps } from "./overveiw/course-header";
import { isStudentOnlyUser } from "@/helpers/authorization";
import { roundNumber } from "@/helpers/number";
import { canShowSessionCheckin } from "@/hooks/useSessionCheckinEnabled";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";

export const CourseDataCard: React.FC<CourseHeaderProps> = ({ course }) => {
  const { tenant } = useTenant();
  const { user, isTeacher } = useUser();
  const isStudent = user ? isStudentOnlyUser(user) : false;
  const showCheckin = canShowSessionCheckin({
    isTeacher,
    isStudent,
    useTeacherSessionCheckin: tenant?.use_teacher_session_checkin !== false,
    useStudentCheckin: tenant?.use_student_checkin === true,
  });
  const courseId = course.id.toString();
  const teacherTotal =
    course.main_teacher_count != null && course.assistant_teacher_count != null
      ? course.main_teacher_count + course.assistant_teacher_count
      : (course.main_teacher_count ?? null);

  const teacherDisplay =
    teacherTotal != null ? String(teacherTotal) : "N/A";

  const ratioText =
    course.student_count != null &&
    course.main_teacher_count != null &&
    course.assistant_teacher_count != null
      ? roundNumber(
          course.student_count /
            (course.main_teacher_count + course.assistant_teacher_count),
        )
      : "—";

  const studentCount = course.student_count ?? 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
      <div className="flex min-w-0 flex-wrap items-center gap-3 overflow-x-auto pb-1 no-scrollbar sm:flex-1 sm:overflow-visible sm:pb-0">
        <CourseInfoCard
          icon={<Users className="size-5" aria-hidden />}
          info={{
            label: "Students",
            text: course.student_count ?? "—",
          }}
          href={`/courses/${courseId}/students`}
          ariaLabel={`View ${studentCount} students`}
        />
        <CourseInfoCard
          icon={<GraduationCap className="size-5" aria-hidden />}
          info={{ label: "Teachers", text: teacherDisplay }}
          href={`/courses/${courseId}/members`}
          ariaLabel={`View ${teacherDisplay} teachers`}
        />
        <div className="flex shrink-0 flex-col gap-0.5 px-1 text-sm">
          <p className="text-muted-foreground">Ratio</p>
          <p className="tabular-nums font-medium text-foreground">{ratioText}</p>
        </div>
      </div>
      {showCheckin && (
        <div className="flex w-full shrink-0 sm:w-auto sm:items-end">
          <UserCheckinButton courseId={courseId} enabled={showCheckin} />
        </div>
      )}
    </div>
  );
};
