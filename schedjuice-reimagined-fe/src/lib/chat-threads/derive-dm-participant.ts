import type { ChatThread, DmEligibleUser } from "@/types/chat";

/** Derive the other participant in a 1:1 DM from the unified `participants` array. */
export function deriveOtherParticipant(
  thread: ChatThread,
  currentUserId: number | undefined
): DmEligibleUser | null {
  const participants = thread.participants ?? [];
  if (participants.length === 0) return null;
  if (currentUserId == null) return participants[0] ?? null;
  const other = participants.find((p) => p.id !== currentUserId);
  return other ?? null;
}

export function findDmThreadByParticipant(
  threads: ChatThread[],
  participantUserId: number,
  currentUserId?: number
): ChatThread | undefined {
  return threads.find((thread) => {
    const other = deriveOtherParticipant(thread, currentUserId);
    return other?.id === participantUserId;
  });
}

/** Enrich thread rows with `other_participant` for list UI compatibility. */
export function enrichDmThreadForViewer(
  thread: ChatThread,
  currentUserId: number | undefined
): ChatThread & { other_participant: DmEligibleUser | null } {
  return {
    ...thread,
    other_participant: deriveOtherParticipant(thread, currentUserId),
  };
}
