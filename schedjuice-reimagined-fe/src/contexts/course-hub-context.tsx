"use client";

import { fetchEntity, searchEntities } from "@/app/client-api/utils";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { getTeacherMemberIdsFromCourse } from "@/helpers/course-hub";
import { rawToFormattedEvents } from "@/helpers/calendar";
import { useTenant } from "@/hooks/useTenant";
import useCourseCreateUpdateStore from "@/store/course-create-update";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

type CourseHubContextValue = {
  courseId: string;
  /** Loaded course; empty object while loading / missing. */
  course: Record<string, unknown> & { id?: number };
  isCourseLoading: boolean;
  eventData: { data?: { data?: unknown[] } } | undefined;
  teacherMemberIds: number[];
};

const CourseHubContext = createContext<CourseHubContextValue | null>(null);

export function useCourseHub(): CourseHubContextValue {
  const ctx = useContext(CourseHubContext);
  if (!ctx) {
    throw new Error("useCourseHub must be used within CourseHubProvider");
  }
  return ctx;
}

/**
 * Loads course + events once for hub routes; syncs course-create-update store (same behavior as former monolithic page).
 */
export function CourseHubProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const courseId = params.id ?? "";
  const courseIdValid = isValidApiEntityIdParam(courseId);
  const { tenant } = useTenant();

  const setCourseData = useCourseCreateUpdateStore((s) => s.setCourseData);
  const reset = useCourseCreateUpdateStore((s) => s.reset);
  const setIsCourseAlreadyCreated = useCourseCreateUpdateStore(
    (s) => s.setIsCourseAlreadyCreated,
  );
  const setEvents = useCourseCreateUpdateStore((s) => s.setEvents);

  const expandParams = useMemo(
    () => [
      "user_courses.user",
      "user_courses.assigned_as_role",
      "category",
      "subject",
      "created_by",
      "intake",
    ],
    [],
  );

  const { data, isLoading: isCourseLoading } = useQuery({
    queryKey: ["getCourse", courseId, expandParams],
    queryFn: () => fetchEntity("courses", Number(courseId), expandParams),
    enabled: courseIdValid,
  });

  const { data: eventData } = useQuery({
    queryKey: [`getEventsOfCourse${courseId}`],
    queryFn: () =>
      searchEntities(
        "events",
        { size: -1 },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: courseId,
            },
          ],
        },
      ),
    enabled: courseIdValid,
  });

  const course = useMemo(() => {
    const raw = data?.data?.data;
    return (raw && typeof raw === "object" ? raw : {}) as CourseHubContextValue["course"];
  }, [data]);

  useEffect(() => {
    if (data?.data?.data) {
      const c = data.data.data;
      setCourseData({
        ...c,
        start_date: new Date(c.start_date),
        end_date: new Date(c.end_date),
      });
    }
  }, [data, setCourseData]);

  useEffect(() => {
    setIsCourseAlreadyCreated(true);
    setEvents(rawToFormattedEvents(eventData?.data?.data, tenant?.timezone));
  }, [data, eventData, tenant?.timezone, setEvents, setIsCourseAlreadyCreated]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const teacherMemberIds = useMemo(
    () =>
      getTeacherMemberIdsFromCourse(
        course as { user_courses?: Array<{ assigned_as?: string; user?: unknown }> },
      ),
    [course],
  );

  const value = useMemo<CourseHubContextValue>(
    () => ({
      courseId,
      course,
      isCourseLoading,
      eventData,
      teacherMemberIds,
    }),
    [courseId, course, isCourseLoading, eventData, teacherMemberIds],
  );

  return (
    <CourseHubContext.Provider value={value}>{children}</CourseHubContext.Provider>
  );
}
