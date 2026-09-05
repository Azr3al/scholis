import type { ControlSize } from "@/lib/ui/control-sizing";
import { selectTriggerSizeClassName } from "@/lib/ui/control-sizing";

/** Floor for payment Status select cells so common labels fit on one line. */
export const PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS = "min-w-[13.5rem]";

export function selectValueClassName(): string {
  return "min-w-0 flex-1 truncate whitespace-nowrap text-left data-[placeholder]:text-text-muted";
}

export function selectTriggerClassName(opts: {
  size?: ControlSize;
  /** @deprecated Use size="full" instead. */
  fullWidth?: boolean;
}): string {
  const size: ControlSize =
    opts.size ?? (opts.fullWidth ? "full" : "default");
  return selectTriggerSizeClassName(size);
}

/** Shared open-list height: scroll after ~24rem or sooner if viewport is smaller. */
export function selectPopupMaxHeightClassName(): string {
  return "max-h-[min(24rem,var(--available-height))] overflow-y-auto";
}

/**
 * Select popup shell: ≥ trigger, ≤ available width.
 * Height scroll lives on the list so ScrollUp/Down arrows can pin over the edges.
 */
export function selectPopupClassName(): string {
  return [
    "relative w-max min-w-[var(--anchor-width)] max-w-[var(--available-width)]",
    "overflow-x-hidden rounded-md border border-border bg-surface-elevated text-text-primary shadow-md",
    "opacity-100 outline-none",
    "focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
  ].join(" ");
}

/** Select option list: shared height cap + vertical scroll. */
export function selectPopupListClassName(): string {
  return `${selectPopupMaxHeightClassName()} py-1 outline-none`;
}

/** Auto-scroll chevrons (Base UI ScrollUp/DownArrow), shadcn-style. */
export function selectPopupScrollArrowClassName(side: "up" | "down"): string {
  return [
    side === "up" ? "top-0" : "bottom-0",
    "z-[1] flex h-4 w-full cursor-default items-center justify-center",
    "bg-surface-elevated text-text-muted",
    "before:absolute before:left-0 before:h-full before:w-full before:content-['']",
    side === "up"
      ? "data-[side=none]:before:top-[-100%]"
      : "data-[side=none]:before:bottom-[-100%]",
  ].join(" ");
}

/** Option label inside Select: truncate only once the popup hits max width. */
export function selectPopupItemTextClassName(): string {
  return "col-start-2 min-w-0 truncate";
}

/** Combobox popup width (height lives on the list via selectPopupMaxHeightClassName). */
export function comboboxPopupWidthClassName(): string {
  return "w-[var(--anchor-width)] max-w-[var(--available-width)]";
}
