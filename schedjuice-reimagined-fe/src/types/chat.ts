export type ChatMention = {
  user_id: number;
  offset: number;
  length: number;
};

export type ChatMessageContent = {
  text: string;
  mentions?: ChatMention[];
  attachments?: ChatAttachmentRef[];
};

export type ChatAttachmentRef = {
  attachment_id: number;
  name: string;
  mime_type: string;
  size_bytes: number;
  download_url?: string;
};

export type ChatMessageUser = {
  id: number;
  email: string;
  name: string;
};

/** Nested preview for replies (list + WS). */
export type ChatReplyToPreview = {
  id: number;
  user: ChatMessageUser | { id: number; name: string } | number;
  content: ChatMessageContent | null;
  deleted_at?: string | null;
};

/** Aggregated reaction row from chat API / WebSocket. */
export type ChatReactionSummary = {
  emoji: string;
  count: number;
  user_ids: number[];
  reacted_by_me: boolean;
};

export type ChatMessage = {
  id: number;
  user: ChatMessageUser | number;
  content: ChatMessageContent;
  created_at: string;
  reply_to?: ChatReplyToPreview | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  /** Some API envelopes use this flag; prefer `deleted_at` when both exist. */
  is_deleted?: boolean;
  deleted_by_id?: number | null;
  reactions?: ChatReactionSummary[];
  /** Echo from server for optimistic send correlation (WebSocket only). */
  client_message_id?: string;
  thread_id?: number;
};

/** Inbound WebSocket payloads after `JSON.parse` (flat new messages or discriminated side events). */
export type ChatWsInbound =
  | ChatMessage
  | {
      event: "typing";
      user_id: number;
      name: string;
      typing: boolean;
    }
  | {
      event: "message_edited";
      data: Partial<ChatMessage> & { id: number };
    }
  | {
      event: "message_deleted";
      data: {
        id: number;
        deleted_at: string;
        deleted_by_id?: number | null;
      };
    }
  | {
      event: "read_receipt";
      user_id: number;
      last_read_message_id: number;
    }
  | {
      event: "reaction_changed";
      data: {
        message_id: number;
        reactions: ChatReactionSummary[];
      };
    };

export type ChatOutboxStatus = "pending" | "sending" | "failed";

export type ChatOutboxItem = {
  localId: string;
  content: ChatMessageContent;
  createdAt: number;
  status: ChatOutboxStatus;
  error?: string;
  reply_to_id?: number;
};

export type ChatMessageApi = ChatMessage & {
  thread?: { id: number; kind: "course" | "dm" | "group"; course?: number | null };
  user?: number;
  updated_at?: string;
};

/** Row from GET `chat/dm/eligible-users` (serializer-shaped). */
export type DmEligibleUser = {
  id: number;
  name: string;
  email: string;
  profile_image?: string | null;
};

/** Nested last message preview on enriched thread list. */
export type ChatThreadLastMessage = {
  id: number;
  created_at: string;
  user: { id: number; name?: string };
  content: ChatMessageContent;
};

/** Preview shape returned by GET courses/chat/last-messages for one course. */
export type CourseChatLastMessagePreview = {
  last_message: ChatThreadLastMessage | null;
  unread_count: number;
};

/** GET courses/chat/last-messages response: course id (string key) -> preview. */
export type CourseChatLastMessagesResponse = Record<
  string,
  CourseChatLastMessagePreview
>;

export type ChatThread = {
  id: number;
  kind: "course" | "dm" | "group";
  course?: number | { id: number; title: string };
  display_title?: string | null;
  participants?: {
    id: number;
    name: string;
    email: string;
    profile_image: string | null;
  }[];
  /** Populated client-side from `participants` for DM list UI. */
  other_participant?: DmEligibleUser | null;
  /** Student anchor for student–teacher group threads (BE: `anchor_user_id`). */
  anchor_user_id?: number | null;
  last_message?: ChatThreadLastMessage | null;
  unread_count?: number;
  created_at: string;
  updated_at: string;
  /** Only on POST create response payload. */
  thread_type?: string;
  created?: boolean;
};

/** @deprecated Use ChatThread */
export type DmThread = ChatThread;

/** @deprecated Use ChatThreadLastMessage */
export type DmThreadLastMessage = ChatThreadLastMessage;
