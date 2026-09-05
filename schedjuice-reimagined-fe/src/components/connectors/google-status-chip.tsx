import { cn } from "@/lib/utils";

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
  not_linked: { label: "Not linked", variant: "secondary" },
  google_off: { label: "Google off", variant: "secondary" },
};

export function getGoogleStatusConfig(status: string): ChipConfig {
  return (
    STATUS_CONFIG[status] ?? {
      label: status,
      variant: "secondary",
    }
  );
}

export function GoogleStatusChip({
  status,
  className,
}: {
  status: string | undefined | null;
  className?: string;
}) {
  if (!status) return null;
  const config = getGoogleStatusConfig(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

export function resolveGoogleStatus(
  user: { google_id?: string | null; google_status?: string | null },
  isGoogleOn: boolean,
): string {
  if (user.google_status) return user.google_status;
  if (!isGoogleOn) return "google_off";
  return user.google_id ? "linked" : "not_linked";
}
