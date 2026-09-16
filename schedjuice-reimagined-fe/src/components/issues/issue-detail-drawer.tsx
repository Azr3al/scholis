"use client";
import { Sheet, Skeleton } from "@/components/primitives";
import { RoughDivider } from "@/components/primitives/decoration/rough-divider";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, MessageText as MessageSquare } from "iconoir-react";
import { motion, useReducedMotion } from "motion/react";
import { DURATION, staggerItem, staggerItemOpacity, staggerList } from "@/lib/sj/motion";
import { fetchIssueMentionCandidates, fetchIssueTimeline } from "@/lib/issues-api";
import { resolveChatAttachmentsByIds } from "@/lib/chat/chat-attachments";
import {
  collectIssueTimelineAttachmentIds,
  hydrateIssueTimelineAttachments,
} from "@/lib/issues/hydrate-issue-timeline-attachments";
import {
  issuesKeys,
  useAddIssueComment,
  useAddIssueObserver,
  useIssueMentionCandidates,
  useIssues,
  useRemoveIssueObserver,
  useUpdateIssue,
} from "@/hooks/issues/use-issues-board";
import { useBoardMentionCandidateSearch } from "@/hooks/use-board-mention-candidate-search";
import { useUser } from "@/hooks/useUser";
import { EntityComboboxList } from "@/components/form/entity-combobox-list";
import { candidatesToMentionRoster } from "@/lib/board-mentions";
import { ChatAttachmentRenderer } from "@/components/course/chat/chat-attachment-renderer";
import { MentionCommentComposer } from "@/components/board-detail/mention-comment-composer";
import { ObserversList } from "@/components/board-detail/observers-list";
import {
  UserSummaryInlineHover,
  type UserSummary,
} from "@/components/users/user-summary-card";
import type { Issue, IssueStatus, IssueTimelineItem, IssueUserMini } from "@/types/issue";

const EVENT_LABEL: Record<string, (payload: Record<string, unknown>) => string> = {
  created: () => "created this issue",
  status_changed: (payload) => `moved ${payload.from ?? "—"} → ${payload.to ?? "—"}`,
  assignee_changed: (payload) =>
    `reassigned ${payload.from ?? "Unassigned"} → ${payload.to ?? "Unassigned"}`,
  observer_added: () => "added an observer",
};

function resolveUserMini(value: number | IssueUserMini | null): IssueUserMini | null {
  return value && typeof value === "object" ? value : null;
}

function resolveCourse(value: Issue["related_course"]): { id: number; title: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = record.id;
  const title = record.title;
  if (typeof id !== "number" || typeof title !== "string") return null;
  return { id, title };
}

function ActorName({ actor }: { actor: IssueUserMini | null }) {
  if (!actor) {
    return <span className="font-medium text-text-secondary">Someone</span>;
  }

  const user: UserSummary = { id: actor.id, name: actor.name, email: actor.email };

  return (
    <UserSummaryInlineHover user={user}>
      <span className="cursor-default rounded-sm font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
        {actor.name}
      </span>
    </UserSummaryInlineHover>
  );
}

function IssueTimelineSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueTimelineList({
  items,
  currentUserId,
}: {
  items: IssueTimelineItem[];
  currentUserId?: number;
}) {
  const reducedMotion = useReducedMotion();
  const itemVariants = reducedMotion ? staggerItemOpacity : staggerItem;

  if (!items.length) {
    return <p className="text-sm text-text-muted">No activity yet.</p>;
  }

  return (
    <motion.ol variants={staggerList} initial="hidden" animate="show">
      {items.map((item, index) => (
        <motion.li
          key={`${item.kind}-${item.id}`}
          variants={itemVariants}
          className="relative flex gap-3 pb-4 text-sm last:pb-0"
        >
          {index < items.length - 1 && (
            <span
              className="absolute left-[7px] top-5 h-[calc(100%-0.5rem)] w-px bg-border"
              aria-hidden
            />
          )}
          <span className="relative z-10 mt-0.5 flex h-4 w-4 items-center justify-center bg-surface-elevated text-text-muted">
            {item.kind === "comment" ? (
              <MessageSquare className="h-4 w-4" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <ActorName actor={item.actor} />{" "}
            {item.kind === "comment" ? (
              <>
                <span className="text-text-primary">{item.body}</span>
                {item.attachments && item.attachments.length > 0 ? (
                  <ChatAttachmentRenderer
                    attachments={item.attachments}
                    isMe={item.actor?.id === currentUserId}
                  />
                ) : null}
              </>
            ) : (
              <span className="text-text-secondary">
                {(EVENT_LABEL[item.event_type] ?? ((type) => type))(item.payload)}
              </span>
            )}
            <div className="font-mono text-xs text-text-muted">
              {new Date(item.created_at).toLocaleString()}
            </div>
          </div>
        </motion.li>
      ))}
    </motion.ol>
  );
}

export function IssueDetailDrawer({
  open,
  issue,
  statuses,
  onClose,
}: {
  open: boolean;
  issue: Issue | null;
  statuses: IssueStatus[];
  onClose: () => void;
}) {
  const [visibleIssue, setVisibleIssue] = useState<Issue | null>(null);

  useEffect(() => {
    if (issue) {
      setVisibleIssue(issue);
      return;
    }
    if (!open) {
      const id = window.setTimeout(
        () => setVisibleIssue(null),
        DURATION.normal * 1000,
      );
      return () => clearTimeout(id);
    }
  }, [issue, open]);

  return (
    <Sheet.Root open={open && !!issue} onOpenChange={(next) => !next && onClose()}>
      {visibleIssue ? (
        <IssueDetailDrawerContent issue={visibleIssue} statuses={statuses} />
      ) : null}
    </Sheet.Root>
  );
}

function IssueDetailDrawerContent({
  issue,
  statuses,
}: {
  issue: Issue;
  statuses: IssueStatus[];
}) {
  const { user } = useUser(false);
  const { data: issues = [] } = useIssues();
  const liveIssue = issues.find((item) => item.id === issue.id) ?? issue;
  const [removingObserverId, setRemovingObserverId] = useState<number | null>(null);

  const status =
    typeof liveIssue.status === "object"
      ? liveIssue.status
      : statuses.find((item) => item.id === liveIssue.status);
  const assignee = resolveUserMini(liveIssue.assignee);
  const student = resolveUserMini(liveIssue.related_student);
  const course = resolveCourse(liveIssue.related_course);

  const subtitle = [status?.name, assignee ? `Assigned to ${assignee.name}` : "Unassigned"]
    .filter(Boolean)
    .join(" · ");

  const { data: timeline = [], isLoading: isTimelineLoading } = useQuery({
    queryKey: issuesKeys.timeline(issue.id),
    queryFn: () => fetchIssueTimeline(issue.id),
  });

  const timelineAttachmentIds = useMemo(
    () => collectIssueTimelineAttachmentIds(timeline),
    [timeline],
  );

  const { data: resolvedTimelineAttachments = [] } = useQuery({
    queryKey: ["issue-timeline-attachments", issue.id, timelineAttachmentIds.join(",")],
    queryFn: () => resolveChatAttachmentsByIds(timelineAttachmentIds),
    enabled: timelineAttachmentIds.length > 0,
    staleTime: 45 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const hydratedTimeline = useMemo(
    () => hydrateIssueTimelineAttachments(timeline, resolvedTimelineAttachments),
    [resolvedTimelineAttachments, timeline],
  );

  const { data: mentionCandidates = [] } = useIssueMentionCandidates("");
  const mentionRoster = useMemo(
    () => candidatesToMentionRoster(mentionCandidates),
    [mentionCandidates],
  );
  const {
    setSearch: setAssigneeSearch,
    debouncedSearch: assigneeDebouncedSearch,
    candidates: assigneeCandidates,
    isFetching: isAssigneeSearchFetching,
  } = useBoardMentionCandidateSearch(
    ["issues", "mention-candidates", "assignee"],
    fetchIssueMentionCandidates,
  );
  const assigneeOptions = useMemo(() => {
    const options = assigneeCandidates.map((candidate) => ({
      value: String(candidate.id),
      label: candidate.name || candidate.email,
    }));
    if (
      !assigneeDebouncedSearch &&
      assignee &&
      !options.some((option) => option.value === String(assignee.id))
    ) {
      options.unshift({
        value: String(assignee.id),
        label: assignee.name || assignee.email,
      });
    }
    return options;
  }, [assigneeCandidates, assignee, assigneeDebouncedSearch]);

  const addComment = useAddIssueComment(issue.id);
  const addObserver = useAddIssueObserver(issue.id);
  const removeObserver = useRemoveIssueObserver(issue.id);
  const updateIssue = useUpdateIssue(issue.id);

  const observers = liveIssue.observers ?? [];

  return (
    <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden border-l-0 p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
        >
          <div className="absolute left-0 top-0 h-full w-px bg-border" aria-hidden />

          <div className="space-y-1 border-b border-border px-6 py-5 pr-12 text-left">
            <Sheet.Title>{issue.title}</Sheet.Title>
            <Sheet.Description className="text-sm text-text-secondary">
              {subtitle}
            </Sheet.Description>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px]">
            <section className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {liveIssue.description && (
                  <p className="mb-5 whitespace-pre-wrap text-sm text-text-primary">
                    {liveIssue.description}
                  </p>
                )}
                <h3 className="mb-4 font-serif text-xl text-text-primary">Activity</h3>
                {isTimelineLoading ? (
                  <IssueTimelineSkeleton />
                ) : (
                  <IssueTimelineList items={hydratedTimeline} currentUserId={user?.id} />
                )}
              </div>

              <footer className="border-t border-border p-4">
                <MentionCommentComposer
                  roster={mentionRoster}
                  isSubmitting={addComment.isPending}
                  onSubmit={({ body, mentions }) => addComment.mutate({ body, mentions })}
                />
              </footer>
            </section>

            <aside className="border-t border-border bg-surface-hover px-5 py-5 md:border-l md:border-t-0">
              <div className="space-y-5 text-sm">
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-text-muted">Status</h3>
                  <div className="flex items-center gap-2 text-text-primary">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: status?.color ?? "#64748b" }}
                      aria-hidden
                    />
                    {status?.name || "—"}
                  </div>
                </section>

                <RoughDivider />

                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-text-muted">Assignee</h3>
                  <EntityComboboxList
                    label="assignee"
                    placeholder="Unassigned"
                    value={assignee ? String(assignee.id) : ""}
                    selectedLabel={
                      assignee ? assignee.name || assignee.email : undefined
                    }
                    onChange={(value) =>
                      updateIssue.mutate({ assignee: value ? Number(value) : null })
                    }
                    options={assigneeOptions}
                    isLoading={isAssigneeSearchFetching}
                    isSaving={updateIssue.isPending}
                    serverSideFilter
                    onFilterChange={setAssigneeSearch}
                    triggerClassName="h-8 text-xs"
                  />
                </section>

                <RoughDivider />

                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-text-muted">Observers</h3>
                  <ObserversList
                    observers={observers}
                    fetchCandidates={fetchIssueMentionCandidates}
                    candidateQueryKeyPrefix={["issues", "mention-candidates", "observer"]}
                    isAdding={addObserver.isPending}
                    removingUserId={removingObserverId}
                    onAdd={(userId) => addObserver.mutate(userId)}
                    onRemove={(userId) => {
                      setRemovingObserverId(userId);
                      removeObserver.mutate(userId, {
                        onSettled: () => setRemovingObserverId(null),
                      });
                    }}
                  />
                </section>

                {(liveIssue.is_anonymous || student || course) && (
                  <>
                    <RoughDivider />
                    <section className="space-y-2">
                      <h3 className="text-xs font-medium text-text-muted">Related</h3>
                      <dl className="space-y-2">
                        {liveIssue.is_anonymous ? (
                          <div>
                            <dt className="text-xs text-text-muted">Student</dt>
                            <dd className="text-text-secondary">Anonymous</dd>
                          </div>
                        ) : null}
                        {student && !liveIssue.is_anonymous ? (
                          <div>
                            <dt className="text-xs text-text-muted">Student</dt>
                            <dd>
                              <Link
                                href={`/users/${student.id}`}
                                className="font-medium text-brand hover:underline"
                              >
                                {student.name}
                              </Link>
                            </dd>
                          </div>
                        ) : null}
                        {course ? (
                          <div>
                            <dt className="text-xs text-text-muted">Course</dt>
                            <dd>
                              <Link
                                href={`/courses/${course.id}`}
                                className="font-medium text-brand hover:underline"
                              >
                                {course.title}
                              </Link>
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                  </>
                )}
              </div>
            </aside>
          </div>
        </Sheet.Popup>
    </Sheet.Portal>
  );
}
