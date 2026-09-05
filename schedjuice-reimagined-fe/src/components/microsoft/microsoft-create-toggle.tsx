"use client";
import { Switch } from "@/components/primitives";

/**
 * Admin-only "also create the Microsoft object" toggle for create forms.
 * Render only when the tenant has Microsoft on and the viewer is superadmin/admin;
 * defaults on. When off, only the local record is created (recoverable later).
 */
export function MicrosoftCreateToggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
