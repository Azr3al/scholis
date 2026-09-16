import type { ChatMention } from "@/types/chat";

export type CourseChatMentionRosterMember = {
  userId: number;
  name: string;
  email: string;
};

/** Visible token in the composer (no trailing space). Always starts with @. */
export function mentionTokenForMember(
  member: CourseChatMentionRosterMember,
  roster: CourseChatMentionRosterMember[]
): string {
  const display = member.name.trim() || member.email;
  const lower = display.toLowerCase();
  const sameDisplay = roster.filter(
    (r) => (r.name.trim() || r.email).toLowerCase() === lower
  );
  if (sameDisplay.length > 1) {
    return `@${display} (${member.email})`;
  }
  return `@${display}`;
}

export function filterMentionRoster(
  roster: CourseChatMentionRosterMember[],
  query: string,
  limit = 12
): CourseChatMentionRosterMember[] {
  const q = query.trim().toLowerCase();
  const scored = roster.filter((m) => {
    if (!q) return true;
    const name = m.name.toLowerCase();
    const email = m.email.toLowerCase();
    return name.includes(q) || email.includes(q);
  });
  scored.sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    const ae = a.email.toLowerCase();
    const be = b.email.toLowerCase();
    if (!q) return an.localeCompare(bn);
    const aNameStarts = an.startsWith(q) ? 0 : 1;
    const bNameStarts = bn.startsWith(q) ? 0 : 1;
    if (aNameStarts !== bNameStarts) return aNameStarts - bNameStarts;
    const aEmailStarts = ae.startsWith(q) ? 0 : 1;
    const bEmailStarts = be.startsWith(q) ? 0 : 1;
    if (aEmailStarts !== bEmailStarts) return aEmailStarts - bEmailStarts;
    return an.localeCompare(bn);
  });
  return scored.slice(0, limit);
}

export function buildChatMentionsFromInsertions(
  text: string,
  insertionsInOrder: { user_id: number; label: string }[]
): ChatMention[] {
  const mentions: ChatMention[] = [];
  let pos = 0;
  for (const { user_id, label } of insertionsInOrder) {
    const idx = text.indexOf(label, pos);
    if (idx === -1) continue;
    mentions.push({ user_id, offset: idx, length: label.length });
    pos = idx + label.length;
  }
  return mentions;
}
