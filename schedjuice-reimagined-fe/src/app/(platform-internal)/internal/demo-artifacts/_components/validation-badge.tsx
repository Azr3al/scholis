import { Badge } from "@/app/_chrome/badge";
import { cn } from "@/lib/utils";

export function ValidationBadge({
  valid,
  className,
}: {
  valid: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant={valid ? "secondary" : "destructive"}
      className={cn("font-normal text-[10px]", className)}
    >
      {valid ? "Valid" : "Invalid"}
    </Badge>
  );
}
