/**
 * Thin board-detail wrapper over the chat `@mention` helpers so Leads and
 * Issues share one implementation of token building, roster filtering, and
 * mention-offset extraction (see `course-chat-mentions.ts` for the source of
 * truth).
 */
import type { CourseChatMentionRosterMember } from "@/lib/course-chat-mentions";

export type { CourseChatMentionRosterMember as BoardMentionRosterMember } from "@/lib/course-chat-mentions";
export {
  mentionTokenForMember,
  filterMentionRoster,
  buildChatMentionsFromInsertions,
} from "@/lib/course-chat-mentions";

/** Shape returned by `GET leads/mention-candidates` / `GET issues/mention-candidates`. */
export type BoardMentionCandidate = {
  id: number;
  name: string;
  email: string;
};

export function candidatesToMentionRoster(
  candidates: BoardMentionCandidate[]
): CourseChatMentionRosterMember[] {
  return candidates.map((candidate) => ({
    userId: candidate.id,
    name: candidate.name,
    email: candidate.email,
  }));
}
