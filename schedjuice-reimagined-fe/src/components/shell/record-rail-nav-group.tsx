import { cn } from "@/lib/utils";

/** Muted label above a nested group of record-rail nav items. */
export function RecordRailGroupHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mb-1 select-none px-2.5 text-[11px] font-normal uppercase tracking-[0.08em] text-text-muted/65",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Indented nav items nested under a group header. */
export function RecordRailGroupItems({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ml-2.5 flex flex-col gap-0.5 border-l border-border/50 pl-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
