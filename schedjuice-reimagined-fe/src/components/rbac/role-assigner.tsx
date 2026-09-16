"use client";
import { Button, Checkbox, buttonVariants, useToast } from "@/components/primitives";

import { useMemo, useState } from "react";
import type { RbacRole } from "@/api/rbac";
import { updateEntity } from "@/app/client-api/utils";
import { applyRoleToggle } from "@/helpers/role";
import { useTenant } from "@/hooks/useTenant";
import type { accountType, role } from "@/types/user";
import { WarningTriangle as AlertTriangle } from "iconoir-react";
import { cn } from "@/lib/utils";
import {
  assignmentLacksLegacyRole,
  filterGrantableRoles,
} from "./role-assigner-utils";

type RoleAssignerProps = {
  user: Pick<accountType, "id" | "roles">;
  actor: Pick<accountType, "roles">;
  roles: RbacRole[];
  onSaved?: (nextRoles: string[], hasLegacyRole: boolean) => void;
  className?: string;
};

export function RoleAssigner({
  user,
  actor,
  roles,
  onSaved,
  className,
}: RoleAssignerProps) {
  const { tenant } = useTenant();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>(user.roles ?? []);
  const [saving, setSaving] = useState(false);

  const grantableRoles = useMemo(
    () => filterGrantableRoles(roles, actor.roles ?? [], tenant),
    [roles, actor.roles, tenant],
  );

  const systemSlugs = useMemo(
    () => roles.filter((item) => item.is_system).map((item) => item.slug),
    [roles],
  );

  const showMobileWarning = assignmentLacksLegacyRole(selected, systemSlugs);

  const handleToggle = (slug: string, checked: boolean) => {
    setSelected((current) => applyRoleToggle(current, slug as role, checked));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await updateEntity("users", user.id, { roles: selected });
      const hasLegacyRole = Boolean(response.data?.data?.has_legacy_role);
      toast.add({ title: "Roles updated" });
      onSaved?.(selected, hasLegacyRole);
    } catch {
      toast.add({ title: "Could not update roles", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    selected.length !== (user.roles?.length ?? 0) ||
    !(user.roles ?? []).every((slug) => selected.includes(slug));

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-3">
        {grantableRoles.map((item) => {
          const checked = selected.includes(item.slug);
          return (
            <div key={item.id} className="flex items-center gap-3">
              <Checkbox
                id={`role-${item.slug}`}
                checked={checked}
                onCheckedChange={(value) =>
                  handleToggle(item.slug, value === true)
                }
              />
              <label htmlFor={`role-${item.slug}`} className="cursor-pointer">
                {item.display_name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {item.is_system ? "System" : "Custom"}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {showMobileWarning ? (
        <div
          className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            This user will have only custom roles. The mobile app won&apos;t
            recognize them until it migrates — add a base role (e.g. Teacher or
            Student) too.
          </span>
        </div>
      ) : null}

      <Button onClick={() => void handleSave()} disabled={!dirty || saving}>
        {saving ? "Saving…" : "Save roles"}
      </Button>
    </div>
  );
}
