import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("py-10 text-center space-y-3", className)}>
      {children}
      {action}
    </div>
  );
}
