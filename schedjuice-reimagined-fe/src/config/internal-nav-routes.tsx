import {
  Activity,
  Building as Building2,
  Clock,
  Page as FileSpreadsheet,
  MultiplePages as FileStack,
  Key as KeyRound,
  Page as Receipt,
  Terminal,
  Wrench,
  StatsUpSquare as BarChart3,
  StatsReport as FileSearch,
} from "iconoir-react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type InternalNavItem = {
  title: string;
  href: string;
  icon: IconComponent;
};

export const internalNavLinks: InternalNavItem[] = [
  { title: "Organizations", href: "/internal/organizations", icon: Building2 },
  { title: "Billing", href: "/internal/billing", icon: Receipt },
  { title: "AI Usage", href: "/internal/ai-usage", icon: BarChart3 },
  { title: "OCR Analytics", href: "/internal/ocr-analytics", icon: FileSearch },
  { title: "Management Commands", href: "/internal/management-commands", icon: Terminal },
  { title: "Demo Artifacts", href: "/internal/demo-artifacts", icon: FileStack },
  { title: "Microsoft Bulk Repair", href: "/internal/microsoft-bulk-repair", icon: Wrench },
  { title: "Microsoft Password Reset", href: "/internal/microsoft-password-reset", icon: KeyRound },
  { title: "Microsoft Provisioning Health", href: "/internal/microsoft-health", icon: Activity },
  { title: "ACCA Spreadsheet Import", href: "/internal/acca-spreadsheet-import", icon: FileSpreadsheet },
  { title: "Cron Jobs", href: "/internal/cron-jobs", icon: Clock },
  { title: "Cron Logs", href: "/internal/cron-logs", icon: Clock },
];

export function isInternalNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
