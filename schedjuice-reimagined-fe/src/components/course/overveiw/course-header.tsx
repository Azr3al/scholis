"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { courseType, ZoomMeetingSource } from "@/types/course";

import MeetingLink from "../meeting-link";
import {
  formatCourseMonthTypeLabel,
  formatDate,
  formatDateTime,
  formatExamIntakeMonth,
} from "@/helpers/date";
import {
  formatRepeatEverySummary,
  getCourseListWeekCount,
} from "@/helpers/course-repeat";
import Link from "next/link";
import { Separator } from "@/components/primitives";
import { CourseDataCard } from "../course-data-card";
import { CourseIntakeDateContext } from "../course-intake-date-context";
import { Button } from "@/components/primitives";
import {
  PrimaryTeacherLine,
  type PrimaryTeacherDisplay,
} from "../primary-teacher-line";
import { useToast } from "@/components/primitives";
import { Calendar as CalendarRange, Clock } from "iconoir-react";
import { useMutation } from "@tanstack/react-query";
import { updateEntity } from "@/app/client-api/utils";
import { queryClient } from "@/lib/query";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { useUserCheckin } from "@/hooks/useUserCheckin";
import { canShowSessionCheckin } from "@/hooks/useSessionCheckinEnabled";
import { isStudentOnlyUser } from "@/helpers/authorization";
import { resolveCourseScheduleClockDisplay } from "@/helpers/course/resolve-course-schedule-clock";
import {
  canEditCourse,
} from "@/helpers/authorization";
import { shouldShowCourseProgramField } from "@/helpers/course-program-validation";
import { programType } from "@/types/program";
import {
  getCreatedByIdFromCourse,
  getTeacherMemberIdsFromCourse,
} from "@/helpers/course-hub";
import { tenantIsZoomPlatform } from "@/helpers/meeting-attendance-gate";
import { axiosClient } from "@/lib/api";
import axios from "axios";
import { EntityComboboxList as Combobox } from "@/components/form/entity-combobox-list";
import {
  AlertDialog,
} from "@/components/primitives";
import { useZoomAccounts, accountLabel, usePersonalZoomStatus, useStartPersonalZoomOAuth, useDisconnectPersonalZoomOAuth, ZOOM_PERSONAL_STATUS_QUERY_KEY } from "@/hooks/useZoomAccounts";
import {
  scheduleCourseZoomMeeting,
  refreshCourseZoomMeeting,
  parseZoomScheduleAxiosError,
  type ZoomScheduleConflictItem,
} from "@/lib/zoom-api";
import { ZoomAccountStatus } from "@/types/zoom-account";
import { VideoConferencingPlatform, type organizationType } from "@/types/organization";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";

export interface CourseHeaderProps {
  course: courseType;
}

const CourseZoomMeetingRefreshButton = ({ courseId }: { courseId: number }) => {
  const toast = useToast();
  const mutation = useMutation({
    mutationKey: ["refreshCourseZoomMeeting", courseId],
    mutationFn: () => refreshCourseZoomMeeting(courseId),
    onSuccess: () => {
      toast.add({
        title: "Zoom meeting updated",
        description: "The join link and details match Zoom.",
      });
      queryClient.invalidateQueries({
        queryKey: ["getCourse", String(courseId)],
      });
    },
    onError: (e: unknown) => {
      const d = axios.isAxiosError(e)
        ? (e.response?.data as { details?: unknown; message?: unknown } | undefined)
        : undefined;
      const msg =
        typeof d?.details === "string"
          ? d.details
          : typeof d?.message === "string"
            ? d.message
            : "Could not refresh from Zoom.";
      toast.add({
        title: "Refresh failed",
        description: msg,
      });
    },
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 w-fit"
        isLoading={mutation.isPending}
        disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Refresh from Zoom
      </Button>
      <p className="max-w-md text-left text-xs text-muted-foreground">
        Pulls the latest join link and meeting details from Zoom.
      </p>
    </div>
  );
};

const CourseZoomScheduleControls = ({
  course,
  tenant,
  hasScheduleTimes,
  currentUserId,
}: {
  course: courseType;
  tenant: organizationType;
  hasScheduleTimes: boolean;
  currentUserId?: number;
}) => {
  const toast = useToast();
  const { data: zoomAccounts = [], isLoading: zoomAccountsLoading } = useZoomAccounts(true);
  const { data: personalStatus, isFetching: personalStatusLoading } =
    usePersonalZoomStatus(Boolean(currentUserId));
  const startPersonalOAuth = useStartPersonalZoomOAuth();
  const disconnectPersonalZoom = useDisconnectPersonalZoomOAuth();
  const [confirmDisconnectPersonalZoom, setConfirmDisconnectPersonalZoom] =
    useState(false);

  const schedulable = useMemo(
    () =>
      zoomAccounts.filter(
        (a) => a.status === ZoomAccountStatus.active && a.has_default_host,
      ),
    [zoomAccounts],
  );

  const comboboxOptions = useMemo(
    () =>
      schedulable.map((a) => ({
        value: a.account_id,
        label: accountLabel(a),
      })),
    [schedulable],
  );

  const [zoomConflict, setZoomConflict] = useState<{
    message: string;
    conflicts?: ZoomScheduleConflictItem[];
  } | null>(null);

  const meetingSource: ZoomMeetingSource =
    course.zoom_meeting_source === ZoomMeetingSource.personal
      ? ZoomMeetingSource.personal
      : ZoomMeetingSource.school;

  const setSourceMutation = useMutation({
    mutationKey: [`courseZoomSource${course.id}`],
    mutationFn: (zoom_meeting_source: ZoomMeetingSource) =>
      updateEntity("courses", course.id, { zoom_meeting_source }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["getCourse", String(course.id)],
      });
      void queryClient.invalidateQueries({
        queryKey: ZOOM_PERSONAL_STATUS_QUERY_KEY,
      });
    },
    onError: () => {
      toast.add({
        title: "Could not update Zoom source",
        description: "Try again or check your permissions.",
      });
    },
  });

  const setAccountMutation = useMutation({
    mutationKey: [`courseZoomAccount${course.id}`],
    mutationFn: (zoom_account_id: string) =>
      updateEntity("courses", course.id, { zoom_account_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["getCourse", String(course.id)],
      });
    },
    onError: () => {
      toast.add({
        title: "Could not save Zoom account",
        description: "Try again or check your permissions.",
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationKey: [`scheduleZoomMeeting${course.id}`],
    mutationFn: ({ force }: { force?: boolean } = {}) =>
      scheduleCourseZoomMeeting(course.id, { force }),
    onSuccess: () => {
      setZoomConflict(null);
      toast.add({
        title: "Zoom meeting scheduled",
        description: "The join link was added to this class.",
      });
      queryClient.invalidateQueries({
        queryKey: ["getCourse", String(course.id)],
      });
    },
    onError: (e) => {
      const p = parseZoomScheduleAxiosError(e);
      if (p.kind === "conflict") {
        setZoomConflict({ message: p.message, conflicts: p.conflicts });
        return;
      }
      toast.add({
        title: "Scheduling failed",
        description: p.message,
      });
    },
  });

  const orgSettingsHref = "/organizations/profile?section=video";
  const profileHref = "/organizations/profile?section=profile";

  const courseZoomId = (course.zoom_account_id || "").trim();
  const personalBoundId =
    course.zoom_personal_user != null ? Number(course.zoom_personal_user) : null;
  const personalMismatch =
    meetingSource === ZoomMeetingSource.personal &&
    personalBoundId != null &&
    currentUserId != null &&
    personalBoundId !== currentUserId;

  const schoolCanSchedule =
    meetingSource === ZoomMeetingSource.school &&
    Boolean(courseZoomId) &&
    schedulable.length > 0;
  const personalCanSchedule =
    meetingSource === ZoomMeetingSource.personal &&
    Boolean(personalStatus?.connected) &&
    !personalMismatch;

  const canPressSchedule =
    hasScheduleTimes &&
    (schoolCanSchedule || personalCanSchedule) &&
    !setSourceMutation.isPending;

  const schedBusy =
    setAccountMutation.isPending ||
    scheduleMutation.isPending ||
    setSourceMutation.isPending ||
    startPersonalOAuth.isPending ||
    disconnectPersonalZoom.isPending;

  return (
    <>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <p className="text-left text-sm font-medium text-foreground">
          Zoom meeting
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={
              meetingSource === ZoomMeetingSource.school ? "primary" : "secondary"
            }
            className="active:scale-[0.98]"
            disabled={
              schedBusy || meetingSource === ZoomMeetingSource.school
            }
            onClick={() =>
              setSourceMutation.mutate(ZoomMeetingSource.school)
            }
            isLoading={
              setSourceMutation.isPending &&
              setSourceMutation.variables === ZoomMeetingSource.school
            }
          >
            School Zoom
          </Button>
          <Button
            type="button"
            size="sm"
            variant={
              meetingSource === ZoomMeetingSource.personal
                ? "primary"
                : "secondary"
            }
            className="active:scale-[0.98]"
            disabled={
              schedBusy || meetingSource === ZoomMeetingSource.personal
            }
            onClick={() =>
              setSourceMutation.mutate(ZoomMeetingSource.personal)
            }
            isLoading={
              setSourceMutation.isPending &&
              setSourceMutation.variables === ZoomMeetingSource.personal
            }
          >
            My Zoom
          </Button>
        </div>

        {meetingSource === ZoomMeetingSource.school ? (
          <>
            <Combobox
              options={comboboxOptions}
              value={courseZoomId}
              setValue={(v) => setAccountMutation.mutate(v)}
              label="Zoom account"
              isLoading={zoomAccountsLoading}
              disabled={schedBusy}
              isSaving={setAccountMutation.isPending}
              placeholder="Choose a connected account"
              triggerClassName="w-full max-w-md min-w-[min(100%,20rem)] justify-between"
              contentClassName="w-[min(100vw-2rem,24rem)]"
              allowDeselect={false}
            />
            {!zoomAccountsLoading && schedulable.length === 0 ? (
              <p className="max-w-md text-pretty text-left text-xs text-muted-foreground">
                No Zoom account is ready to host yet. Connect an account and choose
                a default host in{" "}
                <Link
                  href={orgSettingsHref}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  organization settings
                </Link>
                .
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex max-w-md flex-col gap-2 text-left text-sm">
            {personalMismatch ? (
              <p className="text-muted-foreground">
                This class is set to another teacher&apos;s personal Zoom. Only
                they can schedule meetings here.
              </p>
            ) : personalStatusLoading ? (
              <p className="text-muted-foreground">Checking your Zoom connection…</p>
            ) : personalStatus?.connected ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground">
                  Using your Zoom (
                  {(personalStatus.authorized_email || "").trim() || "connected"}).
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-fit"
                  disabled={schedBusy}
                  isLoading={disconnectPersonalZoom.isPending}
                  onClick={() => setConfirmDisconnectPersonalZoom(true)}
                >
                  Disconnect My Zoom
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Connect your Zoom on your{" "}
                <Link
                  href={profileHref}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  profile
                </Link>{" "}
                before scheduling.
              </p>
            )}
            {!personalStatus?.connected && !personalMismatch ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-fit"
                isLoading={startPersonalOAuth.isPending}
                disabled={schedBusy}
                onClick={() => startPersonalOAuth.mutate()}
              >
                Connect My Zoom
              </Button>
            ) : null}
          </div>
        )}

        <div className="flex w-full max-w-md flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="active:scale-[0.98]"
            disabled={!canPressSchedule || scheduleMutation.isPending || schedBusy}
            isLoading={scheduleMutation.isPending}
            onClick={() => scheduleMutation.mutate({})}
          >
            Schedule Zoom meeting
          </Button>
        </div>
        {!hasScheduleTimes ? (
          <p className="max-w-md text-pretty text-left text-xs text-muted-foreground">
            Add at least one recurring session with start and end times before
            scheduling a Zoom meeting.
          </p>
        ) : null}
        <p className="max-w-md text-pretty text-left text-xs text-muted-foreground">
          The meeting time is taken from this class&apos;s first scheduled
          session.
        </p>
      </div>

      <AlertDialog.Root
        open={confirmDisconnectPersonalZoom}
        onOpenChange={setConfirmDisconnectPersonalZoom}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Disconnect My Zoom?</AlertDialog.Title>
            <AlertDialog.Description>
              This removes your Zoom link for this tenant. Connect again from your
              profile before scheduling meetings with My Zoom.
            </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close render={<Button type="button" variant="ghost" disabled={disconnectPersonalZoom.isPending} />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  variant="danger"
                  isLoading={disconnectPersonalZoom.isPending}
                  disabled={disconnectPersonalZoom.isPending}
                  onClick={() => {
                    disconnectPersonalZoom.mutate(undefined, {
                      onSuccess: () => {
                        setConfirmDisconnectPersonalZoom(false);
                        toast.add({ description: "My Zoom disconnected." });
                        queryClient.invalidateQueries({
                          queryKey: ["getCourse", String(course.id)],
                        });
                      },
                      onError: () => {
                        toast.add({
                          title: "Disconnect failed",
                          description: "Try again or use organization profile.",
                        });
                      },
                    });
                  }}
                />
              }
            >
              Disconnect
            </AlertDialog.Close>
          </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root
        open={zoomConflict != null}
        onOpenChange={(open) => {
          if (!open) setZoomConflict(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Scheduling conflict</AlertDialog.Title>
            <AlertDialog.Description
              render={<div className="flex flex-col gap-3 text-left" />}
            >
                <span>{zoomConflict?.message}</span>
                {zoomConflict?.conflicts && zoomConflict.conflicts.length > 0 ? (
                  <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-sm">
                    {zoomConflict.conflicts.map((c, i) => (
                      <li key={c.id ?? i}>
                        <span className="font-medium">
                          {(c.topic || "").trim() || "Meeting"}
                        </span>
                        {c.start_time ? (
                          <span className="text-muted-foreground">
                            {" "}
                            — {formatDateTime(c.start_time)}
                            {typeof c.duration === "number"
                              ? ` (${c.duration} min)`
                              : ""}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
            </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close render={<Button type="button" variant="ghost" disabled={scheduleMutation.isPending} />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  isLoading={scheduleMutation.isPending}
                  disabled={scheduleMutation.isPending}
                  onClick={() => scheduleMutation.mutate({ force: true })}
                />
              }
            >
              Schedule anyway
            </AlertDialog.Close>
          </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
};

const CourseHeader: React.FC<CourseHeaderProps> = ({ course }) => {
  const { user, isTeacher } = useUser();
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const toast = useToast();
  const program = useMemo((): programType | undefined => {
    const p = course.program;
    if (p && typeof p === "object" && "id" in p) {
      return p as programType;
    }
    if (typeof p === "number" && Number.isFinite(p)) {
      return { id: p } as programType;
    }
    return undefined;
  }, [course.program]);
  const showSubject = shouldShowCourseProgramField("subject", program);

  const isStudent = user ? isStudentOnlyUser(user) : false;
  const showCheckin = canShowSessionCheckin({
    isTeacher,
    isStudent,
    useTeacherSessionCheckin: tenant?.use_teacher_session_checkin !== false,
    useStudentCheckin: tenant?.use_student_checkin === true,
  });
  const courseId = course.id.toString();
  const { currentEvent } = useUserCheckin(courseId, showCheckin);
  const scheduleClock = resolveCourseScheduleClockDisplay(
    course,
    currentEvent,
    showCheckin,
    tenant?.timezone,
    timeFormat,
  );

  const teacherMemberIds = getTeacherMemberIdsFromCourse(course);
  const createdById = getCreatedByIdFromCourse(course);

  const canEditCourseDetails = Boolean(
    user && course && canEditCourse(user, teacherMemberIds, createdById),
  );

  const teamsOrganizerUnresolved = Boolean(
    course.teams_meeting_organizer_unresolved,
  );
  const zoomIdTrimmed = (course.zoom_meeting_id || "").trim();
  const mlTrimmed = (course.meeting_link || "").trim();
  const vcp = tenant?.video_conferencing_platform;
  const noVideoPlatform =
    vcp === null || vcp === undefined;

  const showScheduleZoomMeeting =
    !mlTrimmed &&
    !zoomIdTrimmed &&
    canEditCourseDetails &&
    (tenant?.has_connected_zoom_account === true ||
      tenant?.video_conferencing_platform === VideoConferencingPlatform.zoom) &&
    (vcp === VideoConferencingPlatform.zoom ||
      (noVideoPlatform && !tenant?.is_microsoft_on));

  const hasScheduleTimes = scheduleClock !== null;

  const metaItems: { key: string; node: ReactNode }[] = [];
  if (course.batch_number) {
    metaItems.push({
      key: "batch",
      node: (
        <span className="text-muted-foreground">
          Batch:{" "}
          <span className="tabular-nums">{course.batch_number}</span>
        </span>
      ),
    });
  }
  if (showSubject) {
    metaItems.push({
      key: "subject",
      node: (
        <span className="text-muted-foreground">
          Subject:{" "}
          {typeof course.subject === "object"
            ? course.subject?.name
            : "—"}
        </span>
      ),
    });
  }
  if (course.exam_session_date) {
    metaItems.push({
      key: "exam_session_date",
      node: (
        <span className="text-muted-foreground">
          Exam intake:{" "}
          {formatExamIntakeMonth(course.exam_session_date, tenant?.timezone)}
        </span>
      ),
    });
  }
  if (course.exam_board) {
    metaItems.push({
      key: "exam_board",
      node: (
        <span className="text-muted-foreground">
          Exam board: {course.exam_board}
        </span>
      ),
    });
  }

  const numericZoomJoin =
    zoomIdTrimmed && /^\d+$/.test(zoomIdTrimmed)
      ? `https://zoom.us/j/${zoomIdTrimmed}`
      : null;
  const joinTargetUrl = mlTrimmed || numericZoomJoin || null;
  const lineForCopy = mlTrimmed || numericZoomJoin || zoomIdTrimmed;
  const hasMeetingBlock = Boolean(mlTrimmed || zoomIdTrimmed);
  const zoomMeetingLinkReadOnly = !mlTrimmed && Boolean(zoomIdTrimmed);

  const showZoomRefreshFromZoom =
    canEditCourseDetails &&
    Boolean(zoomIdTrimmed) &&
    (tenantIsZoomPlatform(tenant) ||
      Boolean((course.zoom_account_id || "").trim()));

  const courseMeetingSection = hasMeetingBlock ? (
    <div className="flex min-w-0 w-full max-w-full flex-col items-start gap-3">
      <MeetingLink
        variant="compact"
        toRedirectMeetingLink={lineForCopy}
        courseId={course.id.toString()}
        meetingJoinId={course.meeting_join_id}
        meetingPasscode={course.meeting_passcode}
        meetingScheduledAt={course.meeting_scheduled_at}
        zoomMeetingId={zoomIdTrimmed || null}
        meetingLinkReadOnly={zoomMeetingLinkReadOnly}
        joinTargetUrl={joinTargetUrl}
      />
      {showZoomRefreshFromZoom ? (
        <CourseZoomMeetingRefreshButton courseId={course.id} />
      ) : null}
    </div>
  ) : showScheduleZoomMeeting && tenant ? (
      <CourseZoomScheduleControls
        course={course}
        tenant={tenant}
        hasScheduleTimes={hasScheduleTimes}
        currentUserId={typeof user?.id === "number" ? user.id : undefined}
      />
    ) : null;

  const startD = new Date(course.start_date as string | Date);
  const endD = new Date(course.end_date as string | Date);
  const totalWeeks = getCourseListWeekCount(startD, endD);
  const repeatSummary = formatRepeatEverySummary(course.repeat_every);
  const primaryTeacher =
    course.primary_teacher as PrimaryTeacherDisplay | null | undefined;
  const createdBy =
    course.created_by &&
    typeof course.created_by === "object" &&
    "name" in course.created_by
      ? (course.created_by as { name: string })
      : null;

  const hasPeopleScheduleColumn = Boolean(
    primaryTeacher?.name ||
      hasScheduleTimes ||
      repeatSummary ||
      createdBy?.name,
  );

  const overviewDatesColumn = (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CourseIntakeDateContext
          courseDates={{
            start_date: course.start_date,
            end_date: course.end_date,
          }}
          intakeDates={
            typeof course.intake === "object" &&
            course.intake != null &&
            "start_date" in course.intake &&
            course.intake.start_date &&
            course.intake.end_date
              ? {
                  start_date: course.intake.start_date,
                  end_date: course.intake.end_date,
                }
              : null
          }
        />
        {tenant?.is_fm_hm_course_display_enabled &&
          course.start_date != null && (
            <span className="text-sm font-medium text-foreground">
              {formatCourseMonthTypeLabel(course.start_date)}
            </span>
          )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
        <span>{totalWeeks} weeks</span>
      </div>
      {metaItems.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {metaItems.map((item) => (
            <span key={item.key}>{item.node}</span>
          ))}
        </div>
      )}
    </div>
  );

  const overviewPeopleScheduleColumn = (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <PrimaryTeacherLine
        teacher={primaryTeacher}
        className="text-sm text-muted-foreground"
      />
      {hasScheduleTimes ? (
        <div className="flex items-start gap-2">
          <Clock
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div>
            <div className="text-muted-foreground text-xs font-medium">
              Schedule
            </div>
            <p className="tabular-nums leading-snug text-foreground">
              {scheduleClock!.label}
            </p>
          </div>
        </div>
      ) : null}
      {repeatSummary ? (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <CalendarRange className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground/80">Weekly </span>
            {repeatSummary}
          </span>
        </div>
      ) : null}
      {createdBy?.name ? (
        <p className="text-xs text-muted-foreground">
          Created by: {createdBy.name}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-6 p-6 pb-4">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {course.code ? (
              <span className="rounded-lg bg-muted/70 px-2.5 py-1 text-xs font-medium text-foreground">
                CS-{course.code}
              </span>
            ) : null}
            {typeof course.category === "object" &&
              course.category &&
              "id" in course.category &&
              typeof (course.category as { id: unknown }).id === "number" && (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Category</span>
                  <Link
                    href={`/categories/${(course.category as { id: number }).id}`}
                    className="rounded-lg bg-muted/70 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {(course.category as { name: string }).name}
                  </Link>
                </span>
              )}
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-6 p-6 pt-6">
        {tenant?.is_microsoft_on && teamsOrganizerUnresolved && canEditCourseDetails ? (
          <p
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            This class has a Teams meeting, but the host teacher could not be determined.
            Assign a primary teacher with Microsoft sign-in linked so the link and recordings
            stay in sync.
          </p>
        ) : null}
        {courseMeetingSection ? (
          <div className="flex w-full min-w-0 justify-start">
            {courseMeetingSection}
          </div>
        ) : null}
        {hasPeopleScheduleColumn ? (
          <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
            <div className="min-w-0 flex-1">{overviewDatesColumn}</div>
            <div className="min-w-0 lg:w-[min(100%,22rem)] lg:shrink-0 lg:border-l lg:border-border lg:pl-8">
              {overviewPeopleScheduleColumn}
            </div>
          </div>
        ) : (
          overviewDatesColumn
        )}
        <CourseDataCard course={course} />
      </div>
    </div>
  );
};

export default CourseHeader;
