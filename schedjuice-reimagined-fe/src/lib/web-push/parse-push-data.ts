import { resolveUtilityNotificationHref } from "@/lib/resolve-utility-notification-href";
import { buildChatThreadHref } from "@/lib/chat/chat-routes";
import type { UtilityNotificationParams } from "@/types/utility-notification";

export type UtilityPushData = {
  type: 'utility';
  kind: string;
  route: string;
  params: UtilityNotificationParams;
  notificationId: string;
};

export type ChatPushData = {
  type: 'course_chat' | 'dm';
  courseId?: string;
  threadId?: string;
  notificationId: string;
};

export type AnnouncementPushData = {
  type: 'announcement';
  announcementId: string;
  courseId?: string;
  notificationId: string;
};

export type PushData = UtilityPushData | ChatPushData | AnnouncementPushData;

/**
 * Parse utility notification parameters from various formats
 */
function parseUtilityNotificationParams(value: unknown): UtilityNotificationParams {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as UtilityNotificationParams;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as UtilityNotificationParams;
  }
  return {};
}

/**
 * Parse utility notification data from push payload
 */
function parseUtilityNotificationData(raw: unknown): UtilityPushData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== 'utility') return null;

  const kind = typeof data.kind === 'string' ? data.kind.trim() : '';
  const route = typeof data.route === 'string' ? data.route.trim() : '';
  const notificationIdRaw = data.notification_id ?? data.notificationId;
  const notificationId =
    notificationIdRaw == null || notificationIdRaw === ''
      ? ''
      : String(notificationIdRaw).trim();

  if (!kind || !route || !notificationId) return null;

  return {
    type: 'utility',
    kind,
    route,
    params: parseUtilityNotificationParams(data.params),
    notificationId,
  };
}

function readNotificationId(data: Record<string, unknown>): string {
  const notificationIdRaw = data.notification_id ?? data.notificationId;
  return notificationIdRaw == null || notificationIdRaw === ''
    ? ''
    : String(notificationIdRaw).trim();
}

/**
 * Parse chat notification data from push payload.
 * Accepts backend shapes: `{ type: "course_chat", course_id, thread_id }` and
 * `{ type: "dm", thread_id }`, plus legacy `{ type: "chat", subtype }`.
 */
export function parseChatNotificationData(raw: unknown): ChatPushData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const type = typeof data.type === 'string' ? data.type : '';

  if (type === 'course_chat' || type === 'dm') {
    const notificationId = readNotificationId(data);
    const threadIdRaw = data.thread_id ?? data.threadId;
    const courseIdRaw = data.course_id ?? data.courseId;
    const result: ChatPushData = {
      type,
      notificationId: notificationId || 'chat',
    };
    if (threadIdRaw != null && threadIdRaw !== '') {
      result.threadId = String(threadIdRaw);
    }
    if (courseIdRaw != null && courseIdRaw !== '') {
      result.courseId = String(courseIdRaw);
    }
    if (type === 'dm' && !result.threadId) return null;
    if (type === 'course_chat' && !result.courseId && !result.threadId) {
      return null;
    }
    return result;
  }

  // Legacy envelope (pre-migration clients / tests)
  if (type !== 'chat') return null;
  const subtype = data.subtype as string;
  const notificationId = readNotificationId(data);
  if (!subtype || !notificationId) return null;
  if (subtype !== 'course_chat' && subtype !== 'dm') return null;

  const result: ChatPushData = {
    type: subtype,
    notificationId,
  };
  if (data.courseId || data.course_id) {
    result.courseId = String(data.courseId || data.course_id);
  }
  if (data.conversationId || data.conversation_id || data.thread_id || data.threadId) {
    result.threadId = String(
      data.conversationId ||
        data.conversation_id ||
        data.thread_id ||
        data.threadId
    );
  }
  return result;
}

/**
 * Parse announcement notification data from push payload
 */
function parseAnnouncementNotificationData(raw: unknown): AnnouncementPushData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== 'announcement') return null;

  const announcementIdRaw = data.announcementId || data.announcement_id;
  const notificationIdRaw = data.notification_id ?? data.notificationId;
  
  const announcementId = announcementIdRaw ? String(announcementIdRaw).trim() : '';
  const notificationId =
    notificationIdRaw == null || notificationIdRaw === ''
      ? ''
      : String(notificationIdRaw).trim();

  if (!announcementId || !notificationId) return null;

  const result: AnnouncementPushData = {
    type: 'announcement',
    announcementId,
    notificationId,
  };

  if (data.courseId || data.course_id) {
    result.courseId = String(data.courseId || data.course_id);
  }

  return result;
}

/**
 * Parse any push notification data
 */
export function parsePushNotificationData(raw: unknown): PushData | null {
  // Try utility first (most common)
  const utility = parseUtilityNotificationData(raw);
  if (utility) return utility;

  // Try chat
  const chat = parseChatNotificationData(raw);
  if (chat) return chat;

  // Try announcement
  const announcement = parseAnnouncementNotificationData(raw);
  if (announcement) return announcement;

  return null;
}

/**
 * Convert push data to a navigation href
 */
export function pushDataToHref(pushData: PushData): string | null {
  switch (pushData.type) {
    case 'utility':
      return resolveUtilityNotificationHref(pushData.route, pushData.params);

    case 'course_chat':
      if (pushData.courseId) {
        return buildChatThreadHref({
          kind: "course",
          courseId: Number(pushData.courseId),
          ...(pushData.threadId
            ? { threadId: Number(pushData.threadId) }
            : {}),
        });
      }
      return '/chat';

    case 'dm':
      if (pushData.threadId) {
        return buildChatThreadHref({
          kind: "dm",
          threadId: Number(pushData.threadId),
        });
      }
      return '/chat';

    case 'announcement':
      return `/announcements/${pushData.announcementId}`;

    default:
      return null;
  }
}

/**
 * Check if push data should trigger utility notifications query invalidation
 */
export function shouldInvalidateUtilityNotifications(pushData: PushData): boolean {
  return pushData.type === 'utility';
}
