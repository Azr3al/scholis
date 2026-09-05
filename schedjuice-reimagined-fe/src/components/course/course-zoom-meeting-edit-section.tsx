"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { updateEntity } from "@/app/client-api/utils";
import { EntityComboboxList as Combobox } from "@/components/form/entity-combobox-list";
import { Button } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import {
  AlertDialog,
} from "@/components/primitives";
import { tenantIsZoomPlatform } from "@/helpers/meeting-attendance-gate";
import { formatDateTime } from "@/helpers/date";
import {
  accountLabel,
  useDisconnectPersonalZoomOAuth,
  usePersonalZoomStatus,
  useStartPersonalZoomOAuth,
  useZoomAccounts,
} from "@/hooks/useZoomAccounts";
import {
  patchCourseZoomMeeting,
  syncCourseZoomMeetingFromSchedule,
  parseZoomScheduleAxiosError,
  type ZoomScheduleConflictItem,
} from "@/lib/zoom-api";
import { ZoomAccountStatus } from "@/types/zoom-account";
import { ZoomMeetingSource, type courseType } from "@/types/course";
import { VideoConferencingPlatform, type organizationType } from "@/types/organization";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";

type Props = {
  course: courseType;
  tenant: organizationType;
  onUpdated: () => void;
};

export function CourseZoomMeetingEditSection({
  course,
  tenant,
  onUpdated,
}: Props) {
  const toast = useToast();
  const { user } = useUser();
  const currentUserId =
    user?.id != null && `${user.id}` !== "" ? Number(user.id) : undefined;
  const { data: zoomAccounts = [], isLoading: zoomAccountsLoading } =
    useZoomAccounts(true);
  const { data: personalStatus, isFetching: personalStatusLoading } =
    usePersonalZoomStatus(currentUserId != null);
  const startPersonalOAuth = useStartPersonalZoomOAuth();
  const disconnectPersonalZoom = useDisconnectPersonalZoomOAuth();
  const [confirmDisconnectPersonalZoom, setConfirmDisconnectPersonalZoom] =
    useState(false);

  const schedulable = useMemo(
    () =>
      zoomAccounts.filter(
        (a) =>
          a.status === ZoomAccountStatus.active && a.has_default_host,
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

  const [topicDraft, setTopicDraft] = useState(() => course.title);
  const [zoomConflict, setZoomConflict] = useState<{
    message: string;
    conflicts?: ZoomScheduleConflictItem[];
  } | null>(null);

  useEffect(() => {
    setTopicDraft(course.title);
  }, [course.id, course.title]);

  const tenantZoomCapable =
    tenant.has_connected_zoom_account ||
    tenant.video_conferencing_platform === VideoConferencingPlatform.zoom;

  const showSection =
    tenantZoomCapable &&
    (tenantIsZoomPlatform(tenant) ||
      course.zoom_meeting_source === ZoomMeetingSource.personal ||
      Boolean((course.zoom_meeting_id || "").trim()) ||
      Boolean((course.zoom_account_id || "").trim()));

  const orgSettingsHref = "/organizations/profile?section=video";
  const profileHref = "/organizations/profile?section=profile";

  const meetingSource: ZoomMeetingSource =
    course.zoom_meeting_source === ZoomMeetingSource.personal
      ? ZoomMeetingSource.personal
      : ZoomMeetingSource.school;

  const setSourceMutation = useMutation({
    mutationKey: [`courseEditZoomSource${course.id}`],
    mutationFn: (zoom_meeting_source: ZoomMeetingSource) =>
      updateEntity("courses", course.id, { zoom_meeting_source }),
    onSuccess: () => {
      toast.add({ title: "Zoom source updated" });
      onUpdated();
    },
    onError: () => {
      toast.add({
        title: "Could not update Zoom source",
        description: "Try again or check your permissions.",
      });
    },
  });

  const setAccountMutation = useMutation({
    mutationKey: [`courseEditZoomAccount${course.id}`],
    mutationFn: (zoom_account_id: string) =>
      updateEntity("courses", course.id, { zoom_account_id }),
    onSuccess: () => {
      toast.add({ title: "Zoom account saved" });
      onUpdated();
    },
    onError: () => {
      toast.add({
        title: "Could not save Zoom account",
        description: "Try again or check your permissions.",
      });
    },
  });

  const patchTopicMutation = useMutation({
    mutationKey: [`courseZoomTopic${course.id}`],
    mutationFn: () =>
      patchCourseZoomMeeting(course.id, { topic: topicDraft.trim() }),
    onSuccess: () => {
      toast.add({
        title: "Zoom meeting updated",
        description: "The meeting topic in Zoom was updated.",
      });
      onUpdated();
    },
    onError: (e: unknown) => {
      const p = parseZoomScheduleAxiosError(e);
      toast.add({
        title: "Update failed",
        description: p.message,
      });
    },
  });

  const syncMutation = useMutation({
    mutationKey: [`courseZoomSync${course.id}`],
    mutationFn: ({ force }: { force?: boolean } = {}) =>
      syncCourseZoomMeetingFromSchedule(course.id, { force }),
    onSuccess: () => {
      setZoomConflict(null);
      toast.add({
        title: "Zoom meeting aligned",
        description: "Time and topic were set from this class’s first session.",
      });
      onUpdated();
    },
    onError: (e: unknown) => {
      const p = parseZoomScheduleAxiosError(e);
      if (p.kind === "conflict") {
        setZoomConflict({ message: p.message, conflicts: p.conflicts });
        return;
      }
      toast.add({
        title: "Could not align meeting",
        description: p.message,
      });
    },
  });

  if (!showSection) {
    return null;
  }

  const mid = (course.zoom_meeting_id || "").trim();
  const courseZoomId = (course.zoom_account_id || "").trim();
  const personalBoundId =
    course.zoom_personal_user != null ? Number(course.zoom_personal_user) : null;
  const personalMismatch =
    meetingSource === ZoomMeetingSource.personal &&
    personalBoundId != null &&
    currentUserId != null &&
    personalBoundId !== currentUserId;

  const busy =
    setAccountMutation.isPending ||
    patchTopicMutation.isPending ||
    syncMutation.isPending ||
    setSourceMutation.isPending ||
    startPersonalOAuth.isPending ||
    disconnectPersonalZoom.isPending;

  return (
    <>
      <div className="rounded-lg border border-border bg-surface">
        <div className="p-6">
          <h3 className="font-medium">Zoom</h3>
          <p className="text-sm text-text-secondary">
            Choose school Zoom or your personal Zoom. When a meeting exists, you can
            update its title in Zoom or match its date and time to the first session
            on the schedule tab.
          </p>
        </div>
        <div className="flex flex-col gap-6 p-6 pt-0">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={
                meetingSource === ZoomMeetingSource.school
                  ? "primary"
                  : "secondary"
              }
              disabled={busy || meetingSource === ZoomMeetingSource.school}
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
              disabled={busy || meetingSource === ZoomMeetingSource.personal}
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
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium leading-none text-foreground">
                Zoom account
              </span>
              <Combobox
                options={comboboxOptions}
                value={courseZoomId}
                setValue={(v) => setAccountMutation.mutate(v)}
                label="Zoom account"
                isLoading={zoomAccountsLoading}
                disabled={busy}
                isSaving={setAccountMutation.isPending}
                placeholder="Choose a connected account"
                triggerClassName="w-full max-w-md justify-between"
                contentClassName="w-[min(100vw-2rem,24rem)]"
                allowDeselect={false}
              />
              {!zoomAccountsLoading && schedulable.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No account is ready to host. Connect Zoom and set a default host
                  in{" "}
                  <Link
                    href={orgSettingsHref}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    organization settings
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex max-w-md flex-col gap-2 text-sm">
              {personalMismatch ? (
                <p className="text-muted-foreground">
                  This class uses another teacher&apos;s personal Zoom. Only they can
                  change these meeting settings here.
                </p>
              ) : personalStatusLoading ? (
                <p className="text-muted-foreground">Checking your Zoom connection…</p>
              ) : personalStatus?.connected ? (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground">
                    Personal Zoom (
                    {(personalStatus.authorized_email || "").trim() ||
                      "connected"}
                    ).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      isLoading={disconnectPersonalZoom.isPending}
                      onClick={() => setConfirmDisconnectPersonalZoom(true)}
                    >
                      Disconnect My Zoom
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Disconnects Zoom for your user account in this school (same as
                    organization profile). Courses set to My Zoom will need you to
                    connect again before editing meetings with Zoom.
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Connect Zoom on your{" "}
                  <Link
                    href={profileHref}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    profile
                  </Link>{" "}
                  before editing meetings.
                </p>
              )}
              {!personalStatus?.connected && !personalMismatch ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-fit"
                  isLoading={startPersonalOAuth.isPending}
                  disabled={busy}
                  onClick={() => startPersonalOAuth.mutate()}
                >
                  Connect My Zoom
                </Button>
              ) : null}
            </div>
          )}

          {mid ? (
            <div className="flex flex-col gap-3 border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">
                Zoom meeting ID:{" "}
                <span className="font-mono text-foreground">{mid}</span>
              </p>
              <Field.Root className="flex max-w-md flex-col gap-2">
                <Field.Label htmlFor={`zoom-topic-${course.id}`}>
                  Meeting topic in Zoom
                </Field.Label>
                <Input
                  id={`zoom-topic-${course.id}`}
                  value={topicDraft}
                  onChange={(ev) => setTopicDraft(ev.target.value)}
                  disabled={busy || personalMismatch}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  size="sm"
                  className="w-fit"
                  isLoading={patchTopicMutation.isPending}
                  disabled={busy || !topicDraft.trim() || personalMismatch}
                  onClick={() => patchTopicMutation.mutate()}
                >
                  Save topic in Zoom
                </Button>
              </Field.Root>
              <div className="flex flex-col items-start gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-fit"
                  isLoading={syncMutation.isPending}
                  disabled={busy || personalMismatch}
                  onClick={() => syncMutation.mutate({})}
                >
                  Align time with first session
                </Button>
                <p className="max-w-md text-sm text-muted-foreground">
                  Sets the Zoom meeting start time, duration, and topic from the
                  earliest session on the calendar (same logic as scheduling a
                  new meeting).
                </p>
              </div>
            </div>
          ) : null}
        </div>
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
              This removes your Zoom link for this tenant. Courses set to My Zoom
              will not be manageable in Zoom until you connect again from your
              profile or organization settings.
            </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  variant="danger"
                  disabled={disconnectPersonalZoom.isPending}
                  onClick={() => {
                    disconnectPersonalZoom.mutate(undefined, {
                      onSuccess: () => {
                        setConfirmDisconnectPersonalZoom(false);
                        toast.add({ description: "My Zoom disconnected." });
                        onUpdated();
                      },
                      onError: () => {
                        toast.add({
                          title: "Disconnect failed",
                          description:
                            "Try again or disconnect from organization profile.",
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
            <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  disabled={syncMutation.isPending}
                  onClick={() => syncMutation.mutate({ force: true })}
                />
              }
            >
              Align anyway
            </AlertDialog.Close>
          </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
