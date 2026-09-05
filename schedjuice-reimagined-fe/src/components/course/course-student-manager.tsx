"use client";

import * as React from "react";

import { makeGetRequest } from "@/app/client-api/utils";
import { CourseStudentAddBar } from "@/components/course/course-student-add-bar";
import {
  CourseStudentRemoveDialog,
  CourseStudentRemoveTarget,
} from "@/components/course/course-student-remove-dialog";
import { FormSaveTick } from "@/components/product-docs/form-save-tick";
import { Button } from "@/components/primitives";
import { Skeleton } from "@/components/primitives";
import { EnrollmentDiscountDialog } from "@/components/finance/enrollment-discount-dialog";
import { canManageCourseRoster, permissionsFor } from "@/helpers/authorization";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { useCourseStudentRoster } from "@/hooks/use-course-student-roster";
import { useUser } from "@/hooks/useUser";
import { assignedAsEnum, courseType } from "@/types/course";
import { useQuery } from "@tanstack/react-query";

type courseStudentType = {
  id: number;
  name: string;
  email: string;
  code?: string | null;
  user_course_id: number;
};

type courseStudentManagerCourseType = {
  id?: courseType["id"];
  payment_plan?: number | { id?: number } | null;
  user_courses?: courseType["user_courses"];
};

interface ICourseStudentManagerProps {
  course: courseStudentManagerCourseType;
}

const TICK_MS = 2000;

const CourseStudentManager: React.FC<ICourseStudentManagerProps> = ({
  course,
}) => {
  const { user } = useUser();

  const [studentToRemove, setStudentToRemove] =
    React.useState<CourseStudentRemoveTarget | null>(null);
  const [showRemovedTick, setShowRemovedTick] = React.useState(false);
  const removedTickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const teacherMemberIds = React.useMemo((): number[] => {
    return (
      course.user_courses
        ?.filter(
          (userCourse: { assigned_as?: string }) =>
            userCourse.assigned_as === assignedAsEnum.teacher,
        )
        .map((userCourse: { user: number | { id?: number } }) => {
          const userValue = userCourse.user;
          if (typeof userValue === "number") {
            return userValue;
          }
          return userValue?.id;
        })
        .filter((userId: number | undefined): userId is number => typeof userId === "number") || []
    );
  }, [course.user_courses]);

  const canManageStudents = Boolean(
    user &&
      canManageCourseRoster(
        user,
        teacherMemberIds,
        getCreatedByIdFromCourse(course),
      ),
  );

  const canConfigureDiscount = Boolean(
    user && permissionsFor(user).can("payment.configure"),
  );

  const courseHasPaymentPlan = React.useMemo(() => {
    const plan = course.payment_plan;
    if (plan == null) return false;
    if (typeof plan === "number") return plan > 0;
    return Boolean(plan.id);
  }, [course.payment_plan]);

  const { addStudent, removeStudent, isPending } = useCourseStudentRoster(
    course.id,
  );

  const flashRemovedTick = React.useCallback(() => {
    if (removedTickTimerRef.current) {
      clearTimeout(removedTickTimerRef.current);
    }
    setShowRemovedTick(true);
    removedTickTimerRef.current = setTimeout(
      () => setShowRemovedTick(false),
      TICK_MS,
    );
  }, []);

  React.useEffect(() => {
    return () => {
      if (removedTickTimerRef.current) {
        clearTimeout(removedTickTimerRef.current);
      }
    };
  }, []);

  const fetchStudents = useQuery({
    enabled: Boolean(course.id),
    queryKey: ["fetchStudents", course.id],
    queryFn: () => {
      return makeGetRequest(`courses/${course.id}/students`);
    },
  });

  const students = React.useMemo((): courseStudentType[] => {
    const ax = fetchStudents.data;
    const list = ax?.data?.data;
    if (!Array.isArray(list)) {
      return [];
    }
    return [...list].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, {
        sensitivity: "base",
      }),
    );
  }, [fetchStudents.data]);

  const handleRemoveDialogOpenChange = (open: boolean) => {
    if (!open && removeStudent.isPending) {
      return;
    }
    if (!open) {
      setStudentToRemove(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-xl font-semibold">Students</p>
          <FormSaveTick visible={showRemovedTick} label="Removed" />
        </div>

        {canManageStudents && course.id != null && (
          <CourseStudentAddBar
            courseId={course.id}
            addStudent={addStudent}
            disabled={isPending}
          />
        )}
      </div>

      <div className="space-y-2">
        {fetchStudents.isLoading && (
          <div
            className="space-y-3 rounded-2xl border border-border/70 p-4"
            aria-busy="true"
            aria-label="Loading students"
          >
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        )}

        {fetchStudents.isError && (
          <p className="text-sm text-destructive" role="alert">
            Could not load students. Please try again.
          </p>
        )}

        {!fetchStudents.isLoading &&
          !fetchStudents.isError &&
          students.length === 0 && (
            <p className="text-sm text-muted-foreground">No students assigned.</p>
          )}

        <div className="space-y-2">
          {students.map((student) => (
            <div
              key={student.id}
              className="flex items-start justify-between rounded-md border border-border bg-card p-3 flex-wrap gap-2"
            >
              <div className="space-y-0.5">
                <p className="font-medium leading-none">{student.name}</p>
                <p className="text-sm text-muted-foreground">{student.email}</p>
                {student.code && (
                  <p className="text-xs text-muted-foreground">
                    User ID: {student.code}
                  </p>
                )}
                {courseHasPaymentPlan ? (
                  <div className="pt-2">
                    <EnrollmentDiscountDialog
                      userCourseId={student.user_course_id}
                      canConfigure={canConfigureDiscount}
                    />
                  </div>
                ) : null}
              </div>

              {canManageStudents && (
                <div className="flex flex-wrap gap-3 items-center">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={isPending}
                    onClick={() => setStudentToRemove(student)}
                  >
                    Remove from class
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <CourseStudentRemoveDialog
        student={studentToRemove}
        isLoading={removeStudent.isPending}
        onOpenChange={handleRemoveDialogOpenChange}
        onConfirm={() => {
          if (!studentToRemove) {
            return;
          }
          removeStudent.mutate(studentToRemove.id, {
            onSuccess: () => {
              setStudentToRemove(null);
              fetchStudents.refetch();
              flashRemovedTick();
            },
          });
        }}
      />
    </div>
  );
};

export default CourseStudentManager;
