export type EditorShortcutAction =
  | { type: "copy" }
  | { type: "cut" }
  | { type: "paste" }
  | { type: "delete" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "save" }
  | { type: "toggleBold" }
  | { type: "toggleItalic" };

export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    Boolean(el.isContentEditable)
  );
}

export function resolveEditorShortcut(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    target: unknown;
  },
  ctx: { hasSelection: boolean; hasClipboard: boolean; titleFocused: boolean },
): EditorShortcutAction | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const mod = event.metaKey || event.ctrlKey;
  const typing = isTypingTarget(event.target);

  if (mod && key === "s") return { type: "save" };
  if (mod && key === "z" && event.shiftKey) return { type: "redo" };
  if (mod && key === "z") return { type: "undo" };
  if (mod && (key === "b" || key === "i")) {
    if (ctx.titleFocused) return null;
    return { type: key === "b" ? "toggleBold" : "toggleItalic" };
  }
  if (typing) return null;
  if (mod && key === "c" && ctx.hasSelection) return { type: "copy" };
  if (mod && key === "x" && ctx.hasSelection) return { type: "cut" };
  if (mod && key === "v" && ctx.hasClipboard) return { type: "paste" };
  if ((key === "Delete" || key === "Backspace") && ctx.hasSelection) {
    return { type: "delete" };
  }
  return null;
}
