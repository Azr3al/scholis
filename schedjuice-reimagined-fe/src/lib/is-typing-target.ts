export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null | undefined;
  if (!el) return false;
  const tag = el.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const ce = el.getAttribute?.("contenteditable");
  return ce === "true" || el.isContentEditable;
}
