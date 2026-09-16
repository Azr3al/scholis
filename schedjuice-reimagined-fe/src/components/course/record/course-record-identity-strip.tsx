"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { updateEntity } from "@/app/client-api/utils";
import { CourseIdentityBlock } from "@/components/course-identity/course-identity-block";
import type { CourseIdentityCourse } from "@/components/course-identity/course-identity-types";
import { CourseIntakeDateContext } from "@/components/course/course-intake-date-context";
import { CourseRecordInlineText } from "@/components/course/record/course-record-inline-text";
import { CourseRecordStatusActions } from "@/components/course/record/course-record-status-actions";
import {
  canEditCourse,
  canManuallyChangeCourseStatus,
} from "@/helpers/authorization";
import {
  getCreatedByIdFromCourse,
  getTeacherMemberIdsFromCourse,
} from "@/helpers/course-hub";
import { formatCourseWeeklySchedule } from "@/helpers/course-repeat";
import { formatSessionClock } from "@/helpers/date";
import { convertTimePatternToUserTimezone } from "@/helpers/timeslot";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import type { courseType } from "@/types/course";
import { Calendar as CalendarRange } from "iconoir-react";
import { resolveTimeDisplayFormat, orgTimeDateFnsPattern } from "@/helpers/time-format";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

export function CourseRecordIdentityStrip({ course }: { course: courseType }) {
  const { user } = useUser();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const queryClient = useQueryClient();

  const teacherMemberIds = getTeacherMemberIdsFromCourse(course);
  const createdById = getCreatedByIdFromCourse(course);
  const canEdit = Boolean(user && canEditCourse(user, teacherMemberIds, createdById));
  const canManageStatus = Boolean(
    user && canManuallyChangeCourseStatus(user, teacherMemberIds, createdById),
  );

  const expandParams = useMemo(
    () => ["user_courses.user", "category", "subject", "created_by", "intake"],
    [course.id],
  );

  const queryKey = useMemo(
    () => ["getCourse", String(course.id), expandParams],
    [course.id, expandParams],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: course.title ?? "",
      description: course.description ?? "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    form.reset({
      title: course.title ?? "",
      description: course.description ?? "",
    });
  }, [course.title, course.description, form]);

  const { bindField, commitField, fieldStatus } = useAutosaveForm({
    form,
    save: async (diff) => {
      const result = await updateEntity("courses", String(course.id), diff);
      await queryClient.invalidateQueries({ queryKey });
      return result;
    },
    queryKey,
  });

  const hasScheduleTimes =
    Boolean(course.first_event_time_from) &&
    Boolean(course.first_event_time_to);
  const courseWithSchedule = course as courseType & { time_pattern?: string | null };
  const timePattern =
    typeof courseWithSchedule.time_pattern === "string"
      ? courseWithSchedule.time_pattern.trim()
      : "";
  const repeatSummary = formatCourseWeeklySchedule(course.repeat_every);
  const intake =
    typeof course.intake === "object" && course.intake != null
      ? course.intake
      : null;
  const intakeDates =
    intake?.start_date && intake?.end_date
      ? {
          start_date: intake.start_date,
          end_date: intake.end_date,
        }
      : null;

  return (
    <header className="sj-root flex flex-col gap-3 border-b border-border pb-6">
      <CourseIdentityBlock
        variant="hub"
        course={course as unknown as CourseIdentityCourse}
        showBreadcrumb
        showTitle={false}
      />

      <CourseRecordInlineText
        form={form}
        name="title"
        status={fieldStatus.title}
        bindField={bindField}
        commitField={commitField}
        canEdit={canEdit}
        placeholder="Untitled course"
        displayClassName="font-serif text-2xl text-text-primary"
        inputClassName="font-serif text-2xl"
      />

      <CourseIntakeDateContext
        courseDates={{
          start_date: course.start_date,
          end_date: course.end_date,
        }}
        intakeDates={intakeDates}
        className="text-sm"
      />

      {hasScheduleTimes ? (
        <p className="text-sm tabular-nums text-text-secondary">
          {formatSessionClock(course.first_event_time_from!, timeFormat)} –{" "}
          {formatSessionClock(course.first_event_time_to!, timeFormat)}
        </p>
      ) : timePattern ? (
        <p className="text-sm tabular-nums text-text-secondary">
          {convertTimePatternToUserTimezone(
            timePattern,
            tenant?.timezone,
            orgTimeDateFnsPattern(timeFormat),
          )}
        </p>
      ) : null}

      {repeatSummary ? (
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <CalendarRange className="size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">Weekly </span>
            {repeatSummary}
          </span>
        </p>
      ) : null}

      <CourseRecordInlineText
        form={form}
        name="description"
        status={fieldStatus.description}
        bindField={bindField}
        commitField={commitField}
        canEdit={canEdit}
        multiline
        placeholder="Add a description…"
      />

      <div className="flex flex-wrap items-center gap-2">
        <CourseRecordStatusActions
          course={course}
          canManageStatus={canManageStatus}
        />
      </div>
    </header>
  );
}
