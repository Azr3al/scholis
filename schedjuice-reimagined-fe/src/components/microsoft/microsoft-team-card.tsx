"use client";
import { Button, Input, Select, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import {
  createCourseMicrosoftTeam,
  getCourseMicrosoftChannels,
  linkCourseMicrosoftTeam,
} from "@/app/client-api/microsoft";
import { updateEntity } from "@/app/client-api/utils";
import { CellSaveFeedback, useCellAutosave } from "@/components/edit-kit";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { isAdmin, isSuperAdmin } from "@/helpers/authorization";
import { courseType } from "@/types/course";
import { organizationType } from "@/types/organization";
import { accountType, role } from "@/types/user";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MicrosoftStatusChip } from "./microsoft-status-chip";

/**
 * Edit-page Microsoft Team card.
 * Admins/superadmins can create, link, and set the announcement channel.
 * Course teachers can edit the announcement channel when a Team is already linked.
 */
export function MicrosoftTeamCard({
  course,
  viewerAccount,
  tenant,
  teacherMemberIds = [],
  createdById = null,
  onUpdated,
}: {
  course: courseType;
  viewerAccount: accountType;
  tenant: organizationType | null;
  teacherMemberIds?: number[];
  createdById?: number | null;
  onUpdated?: () => void;
}) {
  const toast = useToast();
  const [showLink, setShowLink] = useState(false);
  const [groupId, setGroupId] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createCourseMicrosoftTeam(course.id),
    onSuccess: () => {
      toast.add({ title: "Microsoft Team created" });
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not create Microsoft Team",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const linkMutation = useMutation({
    mutationFn: () => linkCourseMicrosoftTeam(course.id, groupId.trim()),
    onSuccess: () => {
      toast.add({ title: "Microsoft Team linked" });
      setShowLink(false);
      setGroupId("");
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not link Microsoft Team",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const canManageTeam = isSuperAdmin(viewerAccount) || isAdmin(viewerAccount);
  const status =
    (course as { microsoft_status?: string }).microsoft_status ??
    (course.microsoft_group_id ? "linked" : "not_created");
  const isLinked = Boolean(course.microsoft_group_id) || status === "linked";
  const isCourseTeacherEditor =
    Boolean(viewerAccount.roles?.includes(role.teacher)) &&
    (teacherMemberIds.includes(viewerAccount.id) ||
      (createdById != null && viewerAccount.id === createdById));
  const msEnabled = Boolean(
    tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled,
  );
  const canEditChannel =
    canManageTeam || (isCourseTeacherEditor && isLinked);
  const showCard =
    msEnabled && (canManageTeam || (isCourseTeacherEditor && isLinked));

  const { data: channelsResponse, isLoading: channelsLoading } = useQuery({
    queryKey: ["courseMicrosoftChannels", course.id],
    queryFn: () => getCourseMicrosoftChannels(course.id),
    enabled: showCard && isLinked,
  });

  const channels = channelsResponse?.data?.data ?? [];

  const generalChannelId = useMemo(
    () => channels.find((ch) => ch.displayName === "General")?.id ?? "",
    [channels],
  );

  const selectedChannelId = course.microsoft_channel_id || generalChannelId || "";

  const channelAutosave = useCellAutosave<string>({
    value: selectedChannelId,
    onSave: async (channelId) => {
      await updateEntity("courses", String(course.id), {
        microsoft_channel_id: channelId,
      });
      onUpdated?.();
    },
    onError: (error) =>
      toast.add({
        type: "error",
        title: "Could not update Teams channel",
        description: parseSchedjuiceApiError(error),
      }),
  });

  if (!showCard) {
    return null;
  }

  return (
    <div className="border-border/70 shadow-none">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3>Microsoft Team</h3>
          <MicrosoftStatusChip status={status} />
        </div>
        <p>
          {isLinked
            ? "This course is linked to a Microsoft Team."
            : "This course has no Microsoft Team yet. Meeting actions need a Team."}
        </p>
      </div>
      <div className="space-y-4">
        {isLinked && canManageTeam && course.microsoft_group_id ? (
          <p className="text-sm text-muted-foreground break-all">
            Microsoft group ID:{" "}
            <span className="font-mono">{course.microsoft_group_id}</span>
          </p>
        ) : null}

        {isLinked && canEditChannel ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="teams-announcement-channel">
                Announcement channel
              </label>
              <CellSaveFeedback
                status={channelAutosave.status}
                showSavedTick={channelAutosave.showSavedTick}
              />
            </div>
            <Select
              value={channelAutosave.displayValue || undefined}
              onValueChange={(channelId) => {
                if (!channelId) return;
                channelAutosave.setLocalValue(String(channelId));
                void channelAutosave.commit();
              }}
              disabled={channelsLoading || channelAutosave.status === "saving"}
              className="max-w-md"
              placeholder={
                channelsLoading ? "Loading channels…" : "Select a channel"
              }
              items={channels.map((channel) => ({
                value: String(channel.id),
                label:
                  channel.displayName === "General"
                    ? `${channel.displayName} (default)`
                    : channel.displayName,
              }))}
            />
            <p className="text-xs text-muted-foreground">
              Course feed posts marked &quot;Post to Teams&quot; are sent to this
              channel.
            </p>
          </div>
        ) : null}

        {!isLinked && canManageTeam ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              isLoading={createMutation.isLoading}
            >
              Create Microsoft Team
            </Button>
            <Button
              type="button"
              variant="secondary" onClick={() => setShowLink((v) => !v)}
            >
              Link existing Team
            </Button>
          </div>
        ) : null}

        {!isLinked && canManageTeam && showLink ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm text-muted-foreground">
              Enter the existing Microsoft group/team ID to link it to this course.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                placeholder="group/team id"
                className="max-w-md"
              />
              <Button
                type="button"
                onClick={() => linkMutation.mutate()}
                isLoading={linkMutation.isLoading}
                disabled={!groupId.trim()}
              >
                Link
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
