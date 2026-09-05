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
  tg_off: { label: "Telegram off", variant: "secondary" },
};

export function getTelegramStatusConfig(status: string): ChipConfig {
  return (
    STATUS_CONFIG[status] ?? {
      label: status,
      variant: "secondary",
    }
  );
}

export function TelegramStatusChip({
  status,
  className,
}: {
  status: string | undefined | null;
  className?: string;
}) {
  if (!status) return null;
  const config = getTelegramStatusConfig(status);
  return (
    <span className={cn("inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary", config.className, className)}>
      {config.label}
    </span>
  );
}

export function resolveTelegramStatus(
  user: { telegram_user_id?: number | null; telegram_status?: string | null },
  tenantTelegramOn: boolean,
): string {
  if (user.telegram_status) return user.telegram_status;
  if (!tenantTelegramOn) return "tg_off";
  if (user.telegram_user_id) return "linked";
  return "not_linked";
}
