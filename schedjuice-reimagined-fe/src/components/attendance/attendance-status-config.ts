import { attendanceStatus } from "@/types/attendance";
import { CalendarCheck, Check, Clock, Minus, Xmark } from "iconoir-react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { width?: number; height?: number }>;

export type AttendanceStatusOption = {
  value: attendanceStatus;
  label: string;
  shortLabel: string;
  Icon: IconComponent;
  selectedClass: string;
  idleClass: string;
};

export const ATTENDANCE_STATUS_OPTIONS: AttendanceStatusOption[] = [
  {
    value: attendanceStatus.present,
    label: "Present",
    shortLabel: "P",
    Icon: Check,
    selectedClass:
      "border-success bg-success/20 text-success ring-1 ring-success/40",
    idleClass: "border-border-subtle hover:border-success/50 hover:bg-success/5",
  },
  {
    value: attendanceStatus.late,
    label: "Late",
    shortLabel: "L",
    Icon: Clock,
    selectedClass:
      "border-warning bg-warning/20 text-warning-foreground ring-1 ring-warning/40",
    idleClass: "border-border-subtle hover:border-warning/50 hover:bg-warning/5",
  },
  {
    value: attendanceStatus.absent,
    label: "Absent",
    shortLabel: "A",
    Icon: Xmark,
    selectedClass: "border-danger bg-danger/20 text-danger ring-1 ring-danger/40",
    idleClass: "border-border-subtle hover:border-danger/50 hover:bg-danger/5",
  },
  {
    value: attendanceStatus.absentWithLeave,
    label: "Absent with leave",
    shortLabel: "AWL",
    Icon: CalendarCheck,
    selectedClass:
      "border-status-blue bg-status-blue/20 text-status-blue ring-1 ring-status-blue/40",
    idleClass:
      "border-border-subtle hover:border-status-blue/50 hover:bg-status-blue/5",
  },
  {
    value: attendanceStatus.unregistered,
    label: "Unregistered",
    shortLabel: "N/A",
    Icon: Minus,
    selectedClass:
      "border-border-strong bg-surface-active text-text-secondary ring-1 ring-border-strong/50",
    idleClass:
      "border-border-subtle hover:border-border-strong hover:bg-surface-active/60",
  },
];
