"use client";
import { Button, Checkbox, Skeleton, useToast } from "@/components/primitives";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { RbacCatalogEntry, RbacRole } from "@/api/rbac";
import { useSaveRolePermissions } from "@/api/rbac";
import { Can } from "@/components/auth/can";
import { RoleCreateDialog } from "@/components/rbac/role-create-dialog";
import { isSuperAdmin } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { usePermissions } from "@/hooks/usePermissions";
import { encodeRoleString } from "@/lib/rbac/role-string";
import { cn } from "@/lib/utils";
import {
  buildDraftMatrix,
  formatDomainLabel,
  getChangedRoles,
  groupCatalogByDomain,
  toggleRoleCode,
} from "./matrix-grid-utils";

/** Sticky within the matrix scroll container (not page scroll). */
const MATRIX_SCROLL_CLASS =
  "relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-md border border-border-subtle bg-surface sj-scroll";

const STICKY_HEAD_CLASS =
  "sticky top-0 z-20 min-h-14 bg-surface-elevated py-3 align-bottom";

const PERMISSION_HEAD_CLASS =
  "text-left text-xs font-semibold tracking-wider text-text-muted uppercase";

const PERMISSION_CELL_CLASS = "min-w-[220px] px-3 py-3";

const ROLE_HEAD_CLASS = "min-w-[120px] px-2 text-center";

const STICKY_PERMISSION_CELL =
  "sticky left-0 z-10 bg-surface border-r border-border-subtle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] group-hover:bg-surface-hover";

const DATA_ROW_CLASS =
  "group border-b border-border-subtle/60 hover:bg-surface-hover/60";

const CHECKBOX_CELL_CLASS =
  "h-[52px] p-2 align-middle [&_[role=checkbox]]:translate-y-[2px]";

type MatrixGridProps = {
  catalog: RbacCatalogEntry[];
  roles: RbacRole[];
  isLoading?: boolean;
};

export function MatrixGrid({ catalog, roles, isLoading }: MatrixGridProps) {
  const { realUser } = useUser(false);
  const { can } = usePermissions();
  const canManage = can("rbac.manage");
  const canCopyRoleString = Boolean(realUser && isSuperAdmin(realUser));
  const toast = useToast();
  const savePermissions = useSaveRolePermissions();
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(buildDraftMatrix(roles));
  }, [roles]);

  const grouped = useMemo(() => groupCatalogByDomain(catalog), [catalog]);
  const changed = useMemo(
    () => getChangedRoles(roles, drafts),
    [roles, drafts],
  );

  const handleToggle = (roleId: number, code: string, checked: boolean) => {
    if (!canManage) return;
    setDrafts((prev) => ({
      ...prev,
      [roleId]: toggleRoleCode(prev[roleId] ?? [], code, checked),
    }));
  };

  const handleSave = async () => {
    if (!canManage || changed.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        changed.map(({ roleId, codes }) =>
          savePermissions.mutateAsync({ roleId, codes }),
        ),
      );
      toast.add({ title: "Permissions saved" });
    } catch {
      toast.add({
        title: "Could not save permissions",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyRoleString = async (role: RbacRole) => {
    try {
      const codes = drafts[role.id] ?? role.codes;
      const encoded = encodeRoleString({
        label: role.display_name,
        slug: role.slug,
        codes,
      });
      await navigator.clipboard.writeText(encoded);
      toast.add({
        title: "Role string copied",
        description: `${role.display_name} copied to clipboard.`,
      });
    } catch {
      toast.add({
        title: "Could not copy role string",
        type: "error",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-72 max-w-full" />
        <Skeleton className="h-[min(24rem,calc(100dvh-14rem))] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {canManage
            ? "Toggle permissions per role, then save changes."
            : "Read-only view of role permissions."}
        </p>
        <Can permission="rbac.manage">
          <div className="flex flex-wrap items-center gap-2">
            <RoleCreateDialog roles={roles} />
            <Button
              onClick={() => void handleSave()}
              disabled={changed.length === 0 || saving}
            >
              {saving ? "Saving…" : `Save${changed.length ? ` (${changed.length})` : ""}`}
            </Button>
          </div>
        </Can>
      </div>

      <div className={MATRIX_SCROLL_CLASS}>
        <table className="w-full table-fixed border-collapse caption-bottom text-sm">
          <colgroup>
            <col className="w-55" />
            {roles.map((role) => (
              <col key={role.id} className="w-30" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border-subtle">
              <th
                scope="col"
                className={cn(
                  STICKY_HEAD_CLASS,
                  PERMISSION_CELL_CLASS,
                  PERMISSION_HEAD_CLASS,
                  "sticky left-0 z-30 border-r border-border-subtle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
                )}
              >
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  scope="col"
                  className={cn(STICKY_HEAD_CLASS, ROLE_HEAD_CLASS)}
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium leading-snug text-text-primary normal-case tracking-normal">
                      {role.display_name}
                    </div>
                    <div className="text-xs font-normal normal-case tracking-normal text-text-muted">
                      {role.is_system ? "System" : "Custom"}
                    </div>
                    {canCopyRoleString ? (
                      <button
                        type="button"
                        className="text-xs font-normal normal-case tracking-normal text-action hover:underline"
                        aria-label={`Copy role string for ${role.display_name}`}
                        onClick={() => void handleCopyRoleString(role)}
                      >
                        Copy string
                      </button>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ domain, entries }, domainIndex) => (
              <Fragment key={domain}>
                <tr
                  className={cn(
                    "border-b border-border-subtle bg-surface-elevated/80",
                    domainIndex === 0 && "border-t-0",
                  )}
                >
                  <td colSpan={roles.length + 1} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs font-semibold tracking-wider text-text-secondary uppercase">
                        {formatDomainLabel(domain)}
                      </span>
                      <span className="font-mono text-[11px] text-text-muted">
                        {domain}.*
                      </span>
                      <span className="text-xs tabular-nums text-text-muted">
                        {entries.length} permissions
                      </span>
                    </div>
                  </td>
                </tr>
                {entries.map((entry) => (
                  <tr key={entry.code} className={DATA_ROW_CLASS}>
                    <td
                      className={cn(
                        PERMISSION_CELL_CLASS,
                        STICKY_PERMISSION_CELL,
                      )}
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium text-text-primary">
                          {entry.label}
                        </div>
                        <div className="font-mono text-xs text-text-muted">
                          {entry.code}
                        </div>
                      </div>
                    </td>
                    {roles.map((role) => {
                      const checked = (drafts[role.id] ?? []).includes(
                        entry.code,
                      );
                      return (
                        <td
                          key={`${role.id}-${entry.code}`}
                          className={CHECKBOX_CELL_CLASS}
                        >
                          <div className="flex justify-center">
                            <Checkbox
                              checked={checked}
                              disabled={!canManage}
                              aria-label={`${entry.label} for ${role.display_name}`}
                              onCheckedChange={(value) =>
                                handleToggle(
                                  role.id,
                                  entry.code,
                                  value === true,
                                )
                              }
                              className={cn(!canManage && "opacity-70")}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
