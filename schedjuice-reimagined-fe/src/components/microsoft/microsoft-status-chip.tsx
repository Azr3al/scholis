import { cn } from "@/lib/utils";

/**
 * Microsoft provisioning status chip shared by user and course surfaces.
 * Status strings come from the backend serializers (`microsoft_status`) and
 * the bulk-repair candidate scan.
 */
type ChipConfig = {
  label: string;
  variant: "primary" | "secondary" | "danger" | "destructive" | "outline";
  className?: string;
};

const STATUS_CONFIG: Record<string, ChipConfig> = {
  linked: {
    label: "Linked",
    variant: "primary",
    className: "bg-emerald-600 text-white",
  },
  not_created: { label: "Not created", variant: "secondary" },
  domain_blocked: { label: "Domain blocked", variant: "danger" },
  teams_disabled: { label: "Teams disabled", variant: "secondary" },
  ms_off: { label: "Microsoft off", variant: "secondary" },
  invalid_domain: { label: "Domain blocked", variant: "danger" },
  missing_license: { label: "Missing license", variant: "danger" },
  missing_owner: { label: "Missing team owner", variant: "danger" },
  missing_config: { label: "Missing config", variant: "danger" },
  microsoft_off: { label: "Microsoft off", variant: "secondary" },
  already_linked: {
    label: "Linked",
    variant: "primary",
    className: "bg-emerald-600 text-white",
  },
  ready: {
    label: "Ready",
    variant: "primary",
    className: "bg-blue-600 text-white",
  },
  unlicensed: { label: "Unlicensed", variant: "danger" },
  ready_license: {
    label: "Ready for license",
    variant: "primary",
    className: "bg-blue-600 text-white",
  },
  licensed: {
    label: "Licensed",
    variant: "primary",
    className: "bg-emerald-600 text-white",
  },
  conflict: { label: "Possible duplicate", variant: "danger" },
  failed: { label: "Repair failed", variant: "danger" },
  skipped: { label: "Skipped", variant: "secondary" },
  created: {
    label: "Created",
    variant: "primary",
    className: "bg-emerald-600 text-white",
  },
};

/** Pure resolver for a backend status string -> chip config (testable). */
export function getMicrosoftStatusConfig(status: string): ChipConfig {
  return (
    STATUS_CONFIG[status] ?? {
      label: status,
      variant: "secondary",
    }
  );
}

export function MicrosoftStatusChip({
  status,
  className,
}: {
  status: string | undefined | null;
  className?: string;
}) {
  if (!status) return null;
  const config = getMicrosoftStatusConfig(status);
  return (
    <span className={cn("inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary", config.className, className)}>
      {config.label}
    </span>
  );
}
