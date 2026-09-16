"use client";

import { useEffect, type ReactNode } from "react";
import { useEditor } from "@tiptap/react";
import { Pin } from "iconoir-react";

import TextEditor from "@/components/editor/editor";
import { getAnnouncementViewEditorOptions } from "@/components/editor/config";
import { FeedPostTimestamp } from "@/components/course/feed/course-feed-timestamp";
import { Avatar } from "@/components/primitives/avatar";
import { Skeleton } from "@/components/primitives";
import { convertToEditorDoc } from "@/helpers/convertToEditorDoc";
import { cn } from "@/lib/utils";

import { FeedPostAttachmentGallery } from "./feed-post-attachment-gallery";
import type { FeedPostViewModel } from "./feed-post-view-model";

export type FeedPostViewProps = {
  post: FeedPostViewModel;
  timezone?: string;
  metaSlot?: ReactNode;
  actionsSlot?: ReactNode;
  attachments?: FeedPostViewModel["attachments"];
  isAttachmentsLoading?: boolean;
  className?: string;
};

export function FeedPostView({
  post,
  timezone,
  metaSlot,
  actionsSlot,
  attachments: attachmentsOverride,
  isAttachmentsLoading = false,
  className,
}: FeedPostViewProps) {
  const editor = useEditor(getAnnouncementViewEditorOptions());
  const attachments = attachmentsOverride ?? post.attachments;

  useEffect(() => {
    if (!editor) return;
    const content = post.bodyJson
      ? convertToEditorDoc(post.bodyJson)
      : post.bodyHtml ?? "";
    if (content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, post.bodyHtml, post.bodyJson]);

  const timestampNode = timezone ? (
    <FeedPostTimestamp
      iso={post.createdAt}
      timezone={timezone}
      className="text-muted-foreground"
    />
  ) : (
    <time
      dateTime={post.createdAt}
      className="text-muted-foreground"
      title={new Date(post.createdAt).toLocaleString()}
    >
      {new Date(post.createdAt).toLocaleDateString()}
    </time>
  );

  return (
    <article className={cn("min-w-0 space-y-2", className)}>
      <div className="flex gap-3">
        <Avatar
          src={post.author.avatarUrl}
          name={post.author.name}
          className="h-9 w-9 shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className="font-medium text-foreground">
                {post.author.name}
              </span>
              {timestampNode}
              {post.postType === "daily_lesson" ? (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                  Daily lesson
                </span>
              ) : null}
              {post.isPinned ? (
                <Pin
                  className="h-4 w-4 text-accent"
                  aria-label="Pinned"
                />
              ) : null}
              {metaSlot}
            </div>
            {actionsSlot}
          </div>

          <h3 className="text-base font-semibold leading-snug text-foreground">
            {post.title}
          </h3>

          {(post.bodyHtml || post.bodyJson) && editor ? (
            <div className="text-sm text-foreground">
              <TextEditor
                editor={editor}
                editable={false}
                hideMenu
                isViewOnly
              />
            </div>
          ) : null}

          {isAttachmentsLoading ? (
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-[160px] w-[120px] rounded-lg"
                />
              ))}
            </div>
          ) : attachments.length > 0 ? (
            <FeedPostAttachmentGallery attachments={attachments} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
