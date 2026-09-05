import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AcademicListSurfaceProps {
  children: ReactNode;
  className?: string;
}

export function AcademicListSurface({
  children,
  className,
}: AcademicListSurfaceProps) {
  return (
    <div
      className={cn("space-y-4", className)}
    >
      {children}
    </div>
  );
}
