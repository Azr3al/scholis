import { Home, GraduationCap, Group, AppWindow, Page, Wallet, Wrench, Megaphone, StatsUpSquare, Settings, ShieldCheck, Terminal, Medal, NavArrowRight } from "iconoir-react";
import type { ComponentType, SVGProps } from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Iconoir icon per top-level nav section (keyed by `navLinks[].title`). */
const ICONS: Record<string, Icon> = {
  Home,
  Courses: GraduationCap,
  People: Group,
  CRM: AppWindow,
  "User Logs": Page,
  "Staff Points": Medal,
  Finance: Wallet,
  Operations: Wrench,
  Content: Megaphone,
  Insights: StatsUpSquare,
  Setup: Settings,
  Administration: ShieldCheck,
  Platform: Terminal,
};

export const FallbackIcon = NavArrowRight;

export function navIcon(title: string): Icon {
  return ICONS[title] ?? FallbackIcon;
}
