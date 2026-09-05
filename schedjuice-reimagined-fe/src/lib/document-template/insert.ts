import { INLINE_VARIABLE_KEYS } from "./tokens";
import type {
  BlockDocument,
  ColumnChild,
  DocumentBlock,
  GradesTableBlock,
  ImageBlock,
  InsertableBlockType,
  TextBlock,
} from "./types";

function newId(): string {
  return crypto.randomUUID();
}

export function defaultTextBlock(): TextBlock {
  return {
    id: newId(),
    type: "text",
    text: "",
    align: "left",
    fontFamily: "Noto Sans",
    fontSize: 12,
    color: "#111111",
    bold: false,
    italic: false,
  };
}

export function defaultImageBlock(): ImageBlock {
  return {
    id: newId(),
    type: "image",
    url: null,
    width: 40,
    align: "left",
  };
}

export function defaultBlock(type: InsertableBlockType): DocumentBlock {
  if (type === "text") return defaultTextBlock();
  if (type === "image") return defaultImageBlock();
  if (type === "columns") {
    return { id: newId(), type: "columns", columns: [[], []] };
  }
  const table: GradesTableBlock = {
    id: newId(),
    type: "grades_table",
    columns: [
      { key: "subject_name", label: "Subject" },
      { key: "mark", label: "Mark" },
    ],
  };
  return table;
}

export function insertBlock(
  document: BlockDocument,
  type: InsertableBlockType,
): BlockDocument {
  return { ...document, blocks: [...document.blocks, defaultBlock(type)] };
}

export function insertVariable(
  text: string,
  caret: number,
  key: string,
): { text: string; caret: number } {
  if (!INLINE_VARIABLE_KEYS.has(key)) return { text, caret };
  const token = `{{${key}}}`;
  const at = Math.max(0, Math.min(caret, text.length));
  const next = text.slice(0, at) + token + text.slice(at);
  return { text: next, caret: at + token.length };
}

export function insertColumnChild(
  document: BlockDocument,
  columnsId: string,
  columnIndex: 0 | 1,
  child: ColumnChild,
): BlockDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.id !== columnsId || block.type !== "columns") return block;
      const columns: [ColumnChild[], ColumnChild[]] = [
        [...block.columns[0]],
        [...block.columns[1]],
      ];
      columns[columnIndex] = [...columns[columnIndex], child];
      return { ...block, columns };
    }),
  };
}

export function moveBlock(
  document: BlockDocument,
  id: string,
  direction: -1 | 1,
): BlockDocument {
  const index = document.blocks.findIndex((block) => block.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= document.blocks.length) {
    return document;
  }
  const blocks = [...document.blocks];
  const [item] = blocks.splice(index, 1);
  blocks.splice(nextIndex, 0, item);
  return { ...document, blocks };
}

export function removeBlock(document: BlockDocument, id: string): BlockDocument {
  const top = document.blocks.filter((block) => block.id !== id);
  if (top.length !== document.blocks.length) {
    return { ...document, blocks: top };
  }
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.type !== "columns") return block;
      return {
        ...block,
        columns: [
          block.columns[0].filter((child) => child.id !== id),
          block.columns[1].filter((child) => child.id !== id),
        ],
      };
    }),
  };
}

export function replaceBlock(
  document: BlockDocument,
  next: DocumentBlock | ColumnChild,
): BlockDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.id === next.id) return next as DocumentBlock;
      if (block.type !== "columns") return block;
      return {
        ...block,
        columns: [
          block.columns[0].map((child) => (child.id === next.id ? (next as ColumnChild) : child)),
          block.columns[1].map((child) => (child.id === next.id ? (next as ColumnChild) : child)),
        ],
      };
    }),
  };
}

export function findBlock(
  document: BlockDocument,
  id: string | null,
): DocumentBlock | ColumnChild | null {
  if (!id) return null;
  for (const block of document.blocks) {
    if (block.id === id) return block;
    if (block.type === "columns") {
      for (const child of [...block.columns[0], ...block.columns[1]]) {
        if (child.id === id) return child;
      }
    }
  }
  return null;
}

export function findFirstTextBlockId(document: BlockDocument): string | null {
  for (const block of document.blocks) {
    if (block.type === "text") return block.id;
    if (block.type === "columns") {
      for (const child of [...block.columns[0], ...block.columns[1]]) {
        if (child.type === "text") return child.id;
      }
    }
  }
  return null;
}
