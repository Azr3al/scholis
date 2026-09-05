"use client";

import { useMemo, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Skeleton } from "@/components/primitives";
import { useCourseHub } from "@/contexts/course-hub-context";
import {
  canUploadUserImage,
  canUploadUserImageOnCourse,
  canViewUserImage,
} from "@/helpers/authorization";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { useCourseStudentPhotoFilters } from "@/hooks/course-student-info/use-course-student-photo-filters";
import { useCourseStudentPhotoUrls } from "@/hooks/course-student-info/use-course-student-photo-urls";
import { useUser } from "@/hooks/useUser";
import { crossfadeInstant, crossfadeOpacity } from "@/lib/sj/motion";
import { operatorEnum } from "@/types/api";
import type { UserCourse } from "@/sdk";
import { useUserCoursesList } from "@/sdk/hooks/user-courses";
import { StudentPhotoGalleryCard } from "./student-photo-gallery-card";
import { StudentPhotoGalleryTable } from "./student-photo-gallery-table";
import { StudentPhotoToolbar } from "./student-photo-toolbar";

function userFromRow(row: UserCourse) {
  return typeof row.user === "object" && row.user ? row.user : null;
}

export function CourseStudentInfoPhotoGallery() {
  const { user } = useUser();
  const reducedMotion = useReducedMotion();
  const viewVariants = reducedMotion ? crossfadeInstant : crossfadeOpacity;
  const { courseId, course, teacherMemberIds } = useCourseHub();
  const { state, setType, setView, setQ } = useCourseStudentPhotoFilters();

  const filterParams = useMemo(
    () => [
      {
        field_name: "course_id",
        operator: operatorEnum.exact,
        value: courseId,
      },
      {
        field_name: "assigned_as",
        operator: operatorEnum.exact,
        value: "student",
      },
    ],
    [courseId],
  );

  const list = useUserCoursesList({
    page: 1,
    pageSize: 500,
    sorts: [],
    q: "",
    expand: ["user"],
    student_roster_order: true,
    filterParams,
  });

  const students = useMemo(() => {
    return list.rows
      .map((row) => {
        const u = userFromRow(row);
        if (!u?.id) return null;
        return {
          id: u.id,
          name: u.name ?? null,
          email: u.email ?? null,
        };
      })
      .filter((s): s is { id: number; name: string | null; email: string | null } =>
        Boolean(s),
      );
  }, [list.rows]);

  const filteredStudents = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const hay = `${s.name ?? ""} ${s.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [state.q, students]);

  const studentIds = useMemo(
    () => filteredStudents.map((s) => s.id),
    [filteredStudents],
  );

  const { idUrls, idSources, awardUrls, awardSources, isLoading: urlsLoading } =
    useCourseStudentPhotoUrls(studentIds, state.type);

  const numericCourseId = Number(courseId);
  const recordQueryKey = useMemo(
    () => ["course-student-info-photos", courseId],
    [courseId],
  );

  const createdById = getCreatedByIdFromCourse(course);
  const courseCtx = { teacherMemberIds, createdById };

  const canUploadOnCourse = Boolean(
    user && canUploadUserImageOnCourse(user, "id_image", courseCtx),
  );

  const tableRows = useMemo(() => {
    if (!user) return [];
    return filteredStudents.map((student) => {
      const canViewId = canViewUserImage(user, "id_image");
      const canViewAward = canViewUserImage(user, "award_image");
      const canUploadId =
        canUploadOnCourse || canUploadUserImage(user, "id_image");
      const canUploadAward =
        canUploadOnCourse || canUploadUserImage(user, "award_image");
      return {
        id: student.id,
        name: student.name,
        email: student.email,
        idUrl: idUrls[String(student.id)] ?? null,
        awardUrl: awardUrls[String(student.id)] ?? null,
        idSource: idSources[String(student.id)] ?? null,
        canUploadId,
        canUploadAward,
        canViewId,
        canViewAward,
      };
    });
  }, [
    awardSources,
    awardUrls,
    canUploadOnCourse,
    filteredStudents,
    idSources,
    idUrls,
    user,
  ]);

  if (!user) return null;

  const loading = list.isLoading || urlsLoading;

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    );
  } else if (filteredStudents.length === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        {students.length === 0
          ? "No students in this class yet."
          : "No students match your search."}
      </p>
    );
  } else if (state.view === "gallery") {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredStudents.map((student) => {
          const canViewId = canViewUserImage(user, "id_image");
          const canViewAward = canViewUserImage(user, "award_image");
          const canUploadId =
            canUploadOnCourse || canUploadUserImage(user, "id_image");
          const canUploadAward =
            canUploadOnCourse || canUploadUserImage(user, "award_image");
          return (
            <StudentPhotoGalleryCard
              key={student.id}
              student={student}
              typeFilter={state.type}
              idUrl={idUrls[String(student.id)] ?? null}
              awardUrl={awardUrls[String(student.id)] ?? null}
              idSource={idSources[String(student.id)] ?? null}
              awardSource={awardSources[String(student.id)] ?? null}
              canUploadId={canUploadId}
              canUploadAward={canUploadAward}
              canViewId={canViewId}
              canViewAward={canViewAward}
              courseId={numericCourseId}
              recordQueryKey={recordQueryKey}
            />
          );
        })}
      </div>
    );
  } else {
    body = (
      <StudentPhotoGalleryTable
        rows={tableRows}
        typeFilter={state.type}
        courseId={numericCourseId}
        recordQueryKey={recordQueryKey}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <StudentPhotoToolbar
        typeFilter={state.type}
        viewMode={state.view}
        search={state.q}
        onTypeChange={setType}
        onViewChange={setView}
        onSearchChange={setQ}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.view}
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="min-w-0"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={loading ? "loading" : "ready"}
              variants={viewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="min-w-0"
            >
              {body}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
