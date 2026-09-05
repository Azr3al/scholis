import type {
  BlockDocument,
  ColumnChild,
  DocumentBlock,
} from "./types";

export function cloneBlockWithNewIds<T extends DocumentBlock | ColumnChild>(
  block: T,
): T {
  const cloned = structuredClone(block);
  cloned.id = crypto.randomUUID();
  if (cloned.type === "columns") {
    cloned.columns = [
      cloned.columns[0].map((child) => ({ ...child, id: crypto.randomUUID() })),
      cloned.columns[1].map((child) => ({ ...child, id: crypto.randomUUID() })),
    ];
  }
  return cloned;
}

export function findColumnChildLocation(
  document: BlockDocument,
  id: string,
): { columnsId: string; columnIndex: 0 | 1; childIndex: number } | null {
  for (const block of document.blocks) {
    if (block.type !== "columns") continue;
    for (const columnIndex of [0, 1] as const) {
      const childIndex = block.columns[columnIndex].findIndex(
        (child) => child.id === id,
      );
      if (childIndex >= 0) {
        return { columnsId: block.id, columnIndex, childIndex };
      }
    }
  }
  return null;
}

function insertTopLevelAfter(
  document: BlockDocument,
  afterId: string | null,
  block: DocumentBlock,
): BlockDocument {
  if (!afterId) {
    return { ...document, blocks: [...document.blocks, block] };
  }
  const index = document.blocks.findIndex((item) => item.id === afterId);
  if (index < 0) {
    return { ...document, blocks: [...document.blocks, block] };
  }
  const blocks = [...document.blocks];
  blocks.splice(index + 1, 0, block);
  return { ...document, blocks };
}

export function pasteBlock(
  document: BlockDocument,
  selectedId: string | null,
  copied: DocumentBlock | ColumnChild,
): BlockDocument {
  const cloned = cloneBlockWithNewIds(copied);
  const location = selectedId
    ? findColumnChildLocation(document, selectedId)
    : null;
  if (
    location &&
    (cloned.type === "text" || cloned.type === "image")
  ) {
    return {
      ...document,
      blocks: document.blocks.map((block) => {
        if (block.id !== location.columnsId || block.type !== "columns") {
          return block;
        }
        const columns: [ColumnChild[], ColumnChild[]] = [
          [...block.columns[0]],
          [...block.columns[1]],
        ];
        const siblings = columns[location.columnIndex];
        siblings.splice(location.childIndex + 1, 0, cloned);
        return { ...block, columns };
      }),
    };
  }
  const anchorId = selectedId
    ? document.blocks.some((block) => block.id === selectedId)
      ? selectedId
      : (location?.columnsId ?? null)
    : null;
  return insertTopLevelAfter(document, anchorId, cloned as DocumentBlock);
}
