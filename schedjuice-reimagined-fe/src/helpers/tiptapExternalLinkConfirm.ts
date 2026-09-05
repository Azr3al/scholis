/**
 * Read-only rich text: confirm before following links (TipTap view mode and static HTML).
 */

import type { EditorView } from "@tiptap/pm/view";
import type { MouseEvent as ReactMouseEvent } from "react";

export function confirmThenOpenExternalLink(href: string): void {
  const raw = href.trim();
  if (!raw) return;
  const lower = raw.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) return;

  let message: string;
  if (lower.startsWith("mailto:")) {
    message = `Open your email app to compose a message?\n\n${raw}`;
  } else if (lower.startsWith("tel:")) {
    message = `Open this phone link?\n\n${raw}`;
  } else {
    message = `Open this link in a new tab?\n\n${raw}`;
  }

  if (!window.confirm(message)) return;

  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    window.location.href = raw;
  } else {
    window.open(raw, "_blank", "noopener,noreferrer");
  }
}

/** React delegated click on a read-only rich HTML root (e.g. quiz `dangerouslySetInnerHTML`). */
export function onReadOnlyRichHtmlLinkClick(
  event: ReactMouseEvent<HTMLElement>,
): void {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (event.button !== 0) return;
  const root = event.currentTarget;
  const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
    "a[href]",
  );
  if (!anchor || !root.contains(anchor)) return;
  const href = anchor.getAttribute("href");
  if (!href) return;
  event.preventDefault();
  event.stopPropagation();
  confirmThenOpenExternalLink(href);
}

/** TipTap `editorProps.handleDOMEvents.click` when `view.editable` is false. */
export function handleReadOnlyTiptapLinkClick(
  view: EditorView,
  event: Event,
): boolean {
  if (view.editable) return false;
  if (!(event instanceof MouseEvent)) return false;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  if (event.button !== 0) return false;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor || !view.dom.contains(anchor)) return false;
  const href = anchor.getAttribute("href");
  if (!href) return false;
  event.preventDefault();
  event.stopPropagation();
  confirmThenOpenExternalLink(href);
  return true;
}
