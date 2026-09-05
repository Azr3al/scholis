export type ControlSize = "compact" | "default" | "full";

export function controlSizeClassName(size: ControlSize): string {
  if (size === "compact") {
    return "h-8 min-w-0 w-auto text-sm";
  }
  if (size === "full") {
    return "h-10 min-w-0 w-full max-w-full text-base";
  }
  return "h-10 min-w-44 w-auto text-base";
}

export function selectTriggerSizeClassName(size: ControlSize): string {
  const shared =
    "flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-text-primary select-none hover:bg-surface-hover data-[popup-open]:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-surface";
  if (size === "compact") {
    return `${shared} h-8 min-w-0 w-full max-w-full text-sm`;
  }
  if (size === "full") {
    return `${shared} h-10 min-w-0 w-full max-w-full text-base`;
  }
  return `${shared} h-10 min-w-44 text-base`;
}

export function comboboxInputGroupClassName(size: ControlSize): string {
  const shared =
    "relative flex items-center rounded-md border border-border bg-surface focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-[var(--ring)]";
  if (size === "compact") {
    return `${shared} h-8 w-full min-w-0`;
  }
  if (size === "full") {
    return `${shared} h-10 w-full min-w-0`;
  }
  return `${shared} h-10 w-64`;
}
