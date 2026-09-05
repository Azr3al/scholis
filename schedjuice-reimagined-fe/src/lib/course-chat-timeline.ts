export type TimelineMsg = { id: number; userId: number; createdAt: string };

type TimelineItem =
  | { kind: "date"; label: string; key: string }
  | { kind: "time"; label: string; key: string }
  | {
      kind: "message";
      messageIndex: number;
      runPosition: "single" | "first" | "middle" | "last";
    };

const TWENTY_MIN = 20 * 60 * 1000;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** True when a date or 20+ minute time divider sits between messages[i-1] and messages[i]. */
function dividerBeforeIndex(messages: TimelineMsg[], i: number): boolean {
  if (i <= 0) return false;
  const cur = new Date(messages[i].createdAt);
  const prev = new Date(messages[i - 1].createdAt);
  if (dayKey(cur) !== dayKey(prev)) return true;
  return cur.getTime() - prev.getTime() >= TWENTY_MIN;
}

function messageRunPositions(
  messages: TimelineMsg[]
): Array<"single" | "first" | "middle" | "last"> {
  const pos: Array<"single" | "first" | "middle" | "last"> = [];
  for (let i = 0; i < messages.length; i++) {
    const sameSenderAsPrev =
      i > 0 &&
      messages[i].userId === messages[i - 1].userId &&
      !dividerBeforeIndex(messages, i);
    const sameSenderAsNext =
      i < messages.length - 1 &&
      messages[i].userId === messages[i + 1].userId &&
      !dividerBeforeIndex(messages, i + 1);

    if (!sameSenderAsPrev && !sameSenderAsNext) pos.push("single");
    else if (!sameSenderAsPrev && sameSenderAsNext) pos.push("first");
    else if (sameSenderAsPrev && sameSenderAsNext) pos.push("middle");
    else pos.push("last");
  }
  return pos;
}

/** Flatten for render: interleave dividers with messages (walk indices in lockstep). */
export function buildChatTimeline(
  messages: TimelineMsg[],
  formatDate: (d: Date) => string,
  formatTime: (d: Date) => string
): TimelineItem[] {
  const runs = messageRunPositions(messages);
  const out: TimelineItem[] = [];
  let lastDay: string | null = null;
  for (let i = 0; i < messages.length; i++) {
    const cur = new Date(messages[i].createdAt);
    const dk = dayKey(cur);
    if (lastDay !== dk) {
      out.push({ kind: "date", label: formatDate(cur), key: `d-${dk}` });
      lastDay = dk;
    } else if (dividerBeforeIndex(messages, i)) {
      out.push({ kind: "time", label: formatTime(cur), key: `t-${messages[i].id}` });
    }
    out.push({ kind: "message", messageIndex: i, runPosition: runs[i] });
  }
  return out;
}
