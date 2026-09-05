import type { JSONContent } from "@tiptap/core";
import { convertToEditorDoc } from "@/helpers/convertToEditorDoc";

type StreamItem =
  | { kind: "word"; word: string }
  | { kind: "blank"; id: string };

const DEFAULT_GAP_LABEL = "—";

export type FillBlankPromptExcerptOk = {
  kind: "ok";
  ellipsisBefore: boolean;
  beforeWords: string[];
  gapLabel: string;
  afterWords: string[];
  ellipsisAfter: boolean;
};

export type FillBlankPromptExcerptResult =
  | FillBlankPromptExcerptOk
  | { kind: "missing" };

function appendWordsFromText(stream: StreamItem[], text: string): void {
  const parts = text.split(/\s+/).filter(Boolean);
  for (const w of parts) {
    stream.push({ kind: "word", word: w });
  }
}

function walk(node: JSONContent | undefined, stream: StreamItem[]): void {
  if (!node) return;
  if (node.type === "text" && typeof node.text === "string" && node.text) {
    appendWordsFromText(stream, node.text);
    return;
  }
  if (node.type === "quizFillBlank") {
    const id = (node.attrs as { blankId?: string } | undefined)?.blankId;
    if (id) stream.push({ kind: "blank", id: String(id) });
    return;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      walk(child, stream);
    }
  }
}

/** Plain-word excerpt around a fill-blank in document order (see quiz fill-blank excerpt design spec). */
export function getFillBlankPromptExcerpt(
  body: unknown,
  blankUuid: string,
  opts?: { wordsEachSide?: number; gapLabel?: string },
): FillBlankPromptExcerptResult {
  const n = opts?.wordsEachSide ?? 5;
  const gapLabel = opts?.gapLabel ?? DEFAULT_GAP_LABEL;
  const doc = convertToEditorDoc(body);
  const stream: StreamItem[] = [];
  walk(doc, stream);

  const idx = stream.findIndex(
    (item) => item.kind === "blank" && item.id === blankUuid,
  );
  if (idx === -1) return { kind: "missing" };

  const beforeRev: string[] = [];
  for (let j = idx - 1; j >= 0; j--) {
    const item = stream[j];
    if (item.kind === "word") beforeRev.push(item.word);
  }

  const after: string[] = [];
  for (let j = idx + 1; j < stream.length; j++) {
    const item = stream[j];
    if (item.kind === "word") after.push(item.word);
  }

  const ellipsisBefore = beforeRev.length > n;
  const beforeWords = beforeRev.slice(0, n).reverse();

  const ellipsisAfter = after.length > n;
  const afterWords = after.slice(0, n);

  return {
    kind: "ok",
    ellipsisBefore,
    beforeWords,
    gapLabel,
    afterWords,
    ellipsisAfter,
  };
}
