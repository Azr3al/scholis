import type { ChatAttachmentRef, ChatMessage } from "@/types/chat";
import { mapJuiceBoxResponseToChatAttachmentRefs } from "@/lib/juicebox/map-rows";
import { fetchJuiceBoxAttachmentsByIds } from "@/lib/juicebox/resolve-by-ids";
import { uploadToJuiceBoxMultipart } from "@/lib/juicebox/upload";

export const JUICEBOX_ATTACHMENT_TABLE = {
  CHAT: "chat",
  COMPLAINT: "complaint",
  LEAVE_REQUEST: "leave_request",
} as const;

type UploadJuiceBoxAttachmentsOptions = {
  tableName?: string;
};

export async function uploadJuiceBoxAttachments(
  files: File[],
  foreignKey: string,
  options: UploadJuiceBoxAttachmentsOptions = {},
): Promise<ChatAttachmentRef[]> {
  if (files.length === 0) return [];
  if (!foreignKey) {
    throw new Error("foreignKey is required for attachment upload.");
  }
  if (!/^\d+$/.test(foreignKey)) {
    throw new Error("foreignKey must be a numeric id for JuiceBox upload.");
  }

  const response = await uploadToJuiceBoxMultipart({
    files,
    tableName: options.tableName ?? JUICEBOX_ATTACHMENT_TABLE.CHAT,
    foreignKey,
    isPublic: false,
    purge: false,
  });

  const refs = mapJuiceBoxResponseToChatAttachmentRefs(response);
  if (refs.length === 0) {
    throw new Error("Upload returned no attachment refs");
  }

  return refs;
}

export async function uploadChatAttachments(
  files: File[],
  foreignKey: string
): Promise<ChatAttachmentRef[]> {
  return uploadJuiceBoxAttachments(files, foreignKey, {
    tableName: JUICEBOX_ATTACHMENT_TABLE.CHAT,
  });
}

export async function uploadComplaintAttachments(
  files: File[],
  foreignKey: string
): Promise<ChatAttachmentRef[]> {
  return uploadJuiceBoxAttachments(files, foreignKey, {
    tableName: JUICEBOX_ATTACHMENT_TABLE.COMPLAINT,
  });
}

export async function uploadLeaveRequestAttachments(
  files: File[],
  foreignKey: string
): Promise<ChatAttachmentRef[]> {
  return uploadJuiceBoxAttachments(files, foreignKey, {
    tableName: JUICEBOX_ATTACHMENT_TABLE.LEAVE_REQUEST,
  });
}

export async function resolveChatAttachmentsByIds(
  ids: number[]
): Promise<ChatAttachmentRef[]> {
  const response = await fetchJuiceBoxAttachmentsByIds(ids);
  return mapJuiceBoxResponseToChatAttachmentRefs(response);
}

export function messagesForHydration(
  messages: ChatMessage[],
  outbox: Array<{ localId: string; createdAt: number; content: ChatMessage["content"] }>,
  viewerUserId: number,
  outboxTimelineId: (localId: string) => number
): ChatMessage[] {
  const outboxAsMessages: ChatMessage[] = outbox.map((item) => ({
    id: outboxTimelineId(item.localId),
    user: viewerUserId,
    created_at: new Date(item.createdAt).toISOString(),
    content: item.content,
  }));
  return [...messages, ...outboxAsMessages];
}
