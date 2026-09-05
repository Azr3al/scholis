import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function RecordSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-text-primary">{title}</h2>
          {description ? (
            <p className="text-sm text-text-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function RecordFieldStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}
