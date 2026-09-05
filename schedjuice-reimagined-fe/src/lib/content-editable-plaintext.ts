/**
 * Plain-text offsets for a contenteditable div (Range#toString, not innerText).
 */

export function getCaretPlainOffset(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

export function getActiveMentionQuery(
  fullText: string,
  caretOffset: number
): { atIndex: number; query: string } | null {
  if (caretOffset < 0 || caretOffset > fullText.length) return null;
  const before = fullText.slice(0, caretOffset);
  const m = before.match(/@([^\s@]*)$/);
  if (!m || m.index === undefined) return null;
  return { atIndex: m.index, query: m[1] ?? "" };
}

function findPlainOffsetsInNode(
  node: Node,
  start: number,
  end: number,
  acc: { count: number; startFound: { node: Text; offset: number } | null; endFound: { node: Text; offset: number } | null }
): boolean {
  if (acc.startFound && acc.endFound) return false;
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node as Text;
    const len = t.length;
    const next = acc.count + len;
    if (!acc.startFound && start < next) {
      acc.startFound = { node: t, offset: start - acc.count };
    }
    if (!acc.endFound && end <= next) {
      acc.endFound = { node: t, offset: end - acc.count };
      return false;
    }
    acc.count = next;
    return true;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    for (let i = 0; i < node.childNodes.length; i++) {
      if (!findPlainOffsetsInNode(node.childNodes[i], start, end, acc)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Select plain-text [start, end) in root, then insert `text` (replaces selection).
 */
export function replacePlainTextRange(
  root: HTMLElement,
  start: number,
  end: number,
  text: string
): boolean {
  const acc = {
    count: 0,
    startFound: null as { node: Text; offset: number } | null,
    endFound: null as { node: Text; offset: number } | null,
  };
  findPlainOffsetsInNode(root, start, end, acc);
  if (!acc.startFound || !acc.endFound) return false;
  const range = document.createRange();
  try {
    range.setStart(acc.startFound.node, acc.startFound.offset);
    range.setEnd(acc.endFound.node, acc.endFound.offset);
  } catch {
    return false;
  }
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return document.execCommand("insertText", false, text);
}
