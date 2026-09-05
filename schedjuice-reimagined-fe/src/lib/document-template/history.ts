import type { BlockDocument } from "./types";

export const HISTORY_CAP = 50;

export type DocumentHistory = {
  past: BlockDocument[];
  future: BlockDocument[];
};

export function emptyHistory(): DocumentHistory {
  return { past: [], future: [] };
}

function snapshot(doc: BlockDocument): BlockDocument {
  return structuredClone(doc);
}

export function commitChange(
  history: DocumentHistory,
  current: BlockDocument,
): DocumentHistory {
  return {
    past: [...history.past, snapshot(current)].slice(-HISTORY_CAP),
    future: [],
  };
}

export function undo(
  history: DocumentHistory,
  current: BlockDocument,
): { history: DocumentHistory; document: BlockDocument } | null {
  const prev = history.past.at(-1);
  if (!prev) return null;
  return {
    document: snapshot(prev),
    history: {
      past: history.past.slice(0, -1),
      future: [snapshot(current), ...history.future],
    },
  };
}

export function redo(
  history: DocumentHistory,
  current: BlockDocument,
): { history: DocumentHistory; document: BlockDocument } | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    document: snapshot(next),
    history: {
      past: [...history.past, snapshot(current)].slice(-HISTORY_CAP),
      future: history.future.slice(1),
    },
  };
}
