import React from "react";
import { cn } from "@/lib/utils";

interface AboutItemProps {
  label: string;
  value?: string | number | boolean | null;
  isRedacted: boolean;
  renderFn?: (
    value: string | number | boolean | null
  ) => string | React.ReactNode;
  className?: string;
}

const AboutItem: React.FC<AboutItemProps> = ({
  label,
  value = "N/A",
  isRedacted,
  renderFn,
  className,
}) => {
  const formatValue = (
    value: string | number | boolean | null | undefined
  ) => {
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (value === null || value === undefined) {
      return "N/A";
    }
    if (renderFn) {
      return renderFn(value);
    }
    return value;
  };

  return (
    <div className={cn("group relative flex flex-col gap-0.5", className)}>
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="text-sm break-words text-text-primary">
        {isRedacted ? "N/A" : formatValue(value)}
      </span>
    </div>
  );
};

export default AboutItem;
