import { cn } from "@/lib/utils";

interface GradingStatusBadgeProps {
  status: boolean;
}

const GradingStatusBadge: React.FC<GradingStatusBadgeProps> = ({ status }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        status
          ? "border-success/30 bg-success text-success-foreground"
          : "border-warning/35 bg-warning/10 text-warning-foreground",
      )}
    >
      {status ? "Graded" : "Not graded"}
    </span>
  );
};

export { GradingStatusBadge };