export type FileDragAndDropDensity = "default" | "compact";

const ROOT_BASE =
  "group relative flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 hover:bg-muted/40 transition-colors text-center outline-none";

export function fileDropzoneRootClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact"
    ? `${ROOT_BASE} p-3 sm:p-4`
    : `${ROOT_BASE} p-6 sm:p-8`;
}

export function fileDropzoneInnerClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact"
    ? "pointer-events-none flex flex-col items-center gap-2"
    : "pointer-events-none flex flex-col items-center gap-3";
}

export function fileDropzoneButtonWrapClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact" ? "mt-2" : "mt-4";
}

export function fileDropzoneIconWrapClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact" ? "rounded-full p-1.5" : "rounded-full p-2";
}

export function fileDropzoneIconClassName(
  density: FileDragAndDropDensity = "default",
): string {
  return density === "compact" ? "h-5 w-5" : "h-6 w-6";
}
