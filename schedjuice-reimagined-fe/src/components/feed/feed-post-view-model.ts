import type { JSONContent } from "@tiptap/core";

import type { PostType } from "@/types/course-feed";
import type { attachmentType } from "@/types/attachment";

export type FeedPostAuthor = {
  id: number | null;
  name: string;
  avatarUrl: string | null;
};

export type FeedPostViewModel = {
  id: number;
  postType: PostType;
  title: string;
  bodyHtml: string | null;
  bodyJson: JSONContent | Record<string, unknown> | null;
  createdAt: string;
  author: FeedPostAuthor;
  attachments: attachmentType[];
  isPinned: boolean;
  finishedUnit: number | null;
};
