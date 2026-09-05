"use client";

import React, { Dispatch, SetStateAction, useMemo, useState } from "react";
import Link from "next/link";
import { Maximize as Maximize2, ChatPlusIn as MessageSquarePlus, Xmark as X } from "iconoir-react";
import ChatSearch from "./chat-search";
import ChatListItem from "./chat-list-item";
import { chatSectionStateType } from "./chat-panel-state";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import type { courseType } from "@/types/course";
import type { DmEligibleUser } from "@/types/chat";
import {
  buildCourseIdsKey,
  chatCourseLastMessagesQueryKey,
  fetchCourseChatLastMessages,
  getCoursePreviewFromBatch,
} from "@/lib/chat-threads/course-last-messages-query";
import {
  fetchDmThreads,
  fetchGroupThreads,
  dmThreadsQueryKey,
  groupThreadsQueryKey,
} from "@/lib/chat-threads/chat-threads-api";
import { findDmThreadByParticipant, enrichDmThreadForViewer } from "@/lib/chat-threads/derive-dm-participant";
import { Button } from "@/components/primitives";
import { ListRowsSkeleton } from "@/components/loading/structured-skeletons";
import DmListItem from "@/components/chat/dm/dm-list-item";
import GroupListItem from "@/components/chat/group/group-list-item";
import { DmUserPicker } from "@/components/chat/dm/dm-user-picker";
import { dmChatCopy } from "@/messages/dm-chat";
import { useTenant } from "@/hooks/useTenant";
import { isCourseWideChatEnabled } from "@/lib/chat/course-wide-chat-access";
import type { ChatThreadNavTarget } from "@/lib/chat/chat-routes";
import { applyChatThreadSelection } from "@/lib/chat/chat-thread-selection";
import { CHAT_INBOX_PATH } from "@/lib/chat/chat-routes";

type PanelProps = {
  variant?: "panel";
  setChatSection: Dispatch<SetStateAction<chatSectionStateType>>;
  handleChatListsClose: () => void;
  onExpand?: () => void;
};

type PageProps = {
  variant: "page";
  onSelectThread: (target: ChatThreadNavTarget) => void;
  activeThreadId?: number | null;
  onExpand?: () => void;
};

type ChatListsProps = PanelProps | PageProps;

const ChatLists = (props: ChatListsProps) => {
  const isPage = props.variant === "page";
  const { user } = useUser();
  const { tenant } = useTenant();
  const groupChatEnabled = Boolean(tenant?.is_student_teacher_group_chat_enabled);
  const courseWideChatEnabled = isCourseWideChatEnabled(tenant);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectionHandlers = isPage
    ? { onSelectThread: props.onSelectThread }
    : {
        setChatSection: props.setChatSection,
      };

  const handleChatListsClose = isPage ? undefined : props.handleChatListsClose;
  const onExpand = props.onExpand;
  const activeThreadId = isPage ? props.activeThreadId : null;

  const { data, isLoading } = useQuery({
    queryKey: ["chatCourses", user?.id, search],
    queryFn: () =>
      searchEntities(
        "courses",
        {
          size: 50,
          fields: ["id", "title", "student_count", "main_teacher_count"],
          sorts: ["title"],
        },
        {
          filter_params: [
            {
              field_name: "user_courses__user_id|created_by",
              operator: operatorEnum.exact,
              value: String(user?.id ?? 0),
            },
            {
              field_name: "status",
              operator: operatorEnum.in,
              value: ["planned", "active"].join(","),
            },
            ...(search
              ? [
                  {
                    field_name: "title",
                    operator: operatorEnum.icontains as const,
                    value: search,
                  },
                ]
              : []),
          ],
        }
      ),
    enabled: Boolean(user?.id) && courseWideChatEnabled,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const courses = useMemo(
    () =>
      (data?.data?.data ?? []) as (courseType & {
        student_count?: number;
        main_teacher_count?: number;
      })[],
    [data]
  );

  const courseIdsKey = useMemo(
    () => buildCourseIdsKey(courses.map((c) => c.id)),
    [courses]
  );

  const { data: coursePreviewsData } = useQuery({
    queryKey: chatCourseLastMessagesQueryKey(courseIdsKey),
    queryFn: () =>
      fetchCourseChatLastMessages(courses.map((course) => course.id)),
    enabled: courseWideChatEnabled && courses.length > 0,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const threadsQueryKey = dmThreadsQueryKey(user?.id);

  const { data: dmThreadData } = useQuery({
    queryKey: threadsQueryKey,
    queryFn: fetchDmThreads,
    enabled: Boolean(user?.id),
    refetchOnWindowFocus: false,
  });

  const dmThreads = useMemo(
    () =>
      (dmThreadData ?? []).map((thread) =>
        enrichDmThreadForViewer(thread, user?.id)
      ),
    [dmThreadData, user?.id]
  );

  const groupThreadsQueryKeyValue = groupThreadsQueryKey(user?.id);

  const { data: groupThreadData } = useQuery({
    queryKey: groupThreadsQueryKeyValue,
    queryFn: fetchGroupThreads,
    enabled: Boolean(user?.id) && groupChatEnabled,
    refetchOnWindowFocus: false,
  });

  const groupThreads = groupThreadData ?? [];

  const handlePickEligibleUser = (person: DmEligibleUser) => {
    const existing = findDmThreadByParticipant(dmThreads, person.id, user?.id);
    setPickerOpen(false);
    if (existing) {
      applyChatThreadSelection(
        {
          kind: "dm",
          threadId: existing.id,
          otherParticipant: existing.other_participant ?? person,
        },
        selectionHandlers,
      );
      return;
    }
    applyChatThreadSelection(
      {
        kind: "dm",
        participantUserId: person.id,
        title: person.name,
        otherParticipant: person,
      },
      selectionHandlers,
    );
  };

  return (
    <>
      <div className="shrink-0 border-b border-[var(--border-chrome)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-text-primary">
            {dmChatCopy.messagesTitle}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => setPickerOpen(true)}
              aria-label={dmChatCopy.newMessageAria}
              title={dmChatCopy.newMessageAria}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            </Button>
            {onExpand ? (
              isPage ? (
                <Link
                  href={CHAT_INBOX_PATH}
                  className="rounded-full p-2 text-text-secondary transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={dmChatCopy.expandChatAria}
                >
                  <Maximize2 className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <button
                  type="button"
                  className="rounded-full p-2 text-text-secondary transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onExpand}
                  aria-label={dmChatCopy.expandChatAria}
                >
                  <Maximize2 className="h-4 w-4" aria-hidden />
                </button>
              )
            ) : null}
            {handleChatListsClose ? (
              <button
                type="button"
                className="rounded-full p-2 text-text-secondary transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)] hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={handleChatListsClose}
                aria-label={dmChatCopy.closeChatAria}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <DmUserPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePickEligibleUser}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 px-4 py-2">
          <ChatSearch value={search} onChange={setSearch} />
        </div>

        <div className="min-h-[min(24rem,50vh)] flex-1 overflow-y-auto overscroll-contain">
          <div className="px-2 py-1">
            {groupChatEnabled && groupThreads.length > 0 ? (
              <div className="mb-2">
                <p className="px-2 py-1 text-xs font-semibold text-text-muted">
                  {dmChatCopy.classChatsHeading}
                </p>
                {groupThreads.map((thread) => (
                  <GroupListItem
                    key={`group-${thread.id}`}
                    thread={thread}
                    isActive={activeThreadId === thread.id}
                    selectionHandlers={selectionHandlers}
                  />
                ))}
              </div>
            ) : null}
            {dmThreads.length > 0 ? (
              <div className="mb-2">
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <p className="text-xs font-semibold text-text-muted">
                    {dmChatCopy.directMessagesHeading}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto shrink-0 p-0 text-xs"
                    onClick={() => setPickerOpen(true)}
                  >
                    {dmChatCopy.newMessageShort}
                  </Button>
                </div>
                {dmThreads.map((thread) => (
                  <DmListItem
                    key={`dm-${thread.id}`}
                    thread={thread}
                    isActive={activeThreadId === thread.id}
                    selectionHandlers={selectionHandlers}
                  />
                ))}
              </div>
            ) : null}
            {courseWideChatEnabled && isLoading ? (
              <ListRowsSkeleton rows={6} className="px-3 py-3" />
            ) : courses.length === 0 &&
              dmThreads.length === 0 &&
              groupThreads.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                {dmChatCopy.inboxEmpty}
              </div>
            ) : courseWideChatEnabled && courses.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-muted">
                No courses with chat
              </div>
            ) : courseWideChatEnabled ? (
              courses.map((course) => {
                const preview = getCoursePreviewFromBatch(
                  coursePreviewsData ?? {},
                  course.id
                );
                return (
                  <ChatListItem
                    key={course.id}
                    course={course}
                    lastMessage={preview.last_message}
                    unreadCount={preview.unread_count}
                    selectionHandlers={selectionHandlers}
                  />
                );
              })
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatLists;
