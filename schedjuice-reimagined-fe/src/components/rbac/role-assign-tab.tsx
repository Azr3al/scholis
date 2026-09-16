"use client";
import { Button, Select, useToast } from "@/components/primitives";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WarningTriangle as AlertTriangle, Xmark as X } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RbacRole } from "@/api/rbac";
import { assignRoleBulk } from "@/app/client-api/user-roles";
import { AlertDialog } from "@/components/primitives/alert-dialog";
import { StaffUserSearchCombobox } from "@/components/form/staff-user-search-combobox";
import { assignmentLacksLegacyRole } from "@/components/rbac/role-assigner-utils";
import { displayNameForSlug, systemSlugsFromRoles } from "@/components/record/profile-role-utils";
import {
  buildBulkRoleAssignStaffFilter,
  grantableRolesForActor,
} from "@/lib/rbac/bulk-role-assign-search";
import { popIn, crossfadeInstant } from "@/lib/sj/motion";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import type { accountType, role } from "@/types/user";

function userHasRoleSlug(roles: role[] | undefined, slug: string) {
  return (roles ?? []).some((item) => item === slug);
}

type RoleAssignTabProps = {
  roles: RbacRole[];
  isLoading?: boolean;
};

export function RoleAssignTab({ roles, isLoading }: RoleAssignTabProps) {
  const { user: actor } = useUser(false);
  const { tenant } = useTenant();
  const { can } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const chipVariants = reducedMotion ? crossfadeInstant : popIn;

  const canManageRbac = can("rbac.manage");
  const [selectedRoleSlug, setSelectedRoleSlug] = useState<string>("");
  const [selected, setSelected] = useState<Record<number, accountType>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const grantableRoles = useMemo(
    () =>
      grantableRolesForActor({
        roles,
        actorRoles: actor?.roles ?? [],
        tenant,
        canManageRbac,
      }),
    [roles, actor?.roles, tenant, canManageRbac],
  );

  const systemGrantable = useMemo(
    () => grantableRoles.filter((item) => item.is_system),
    [grantableRoles],
  );
  const customGrantable = useMemo(
    () => grantableRoles.filter((item) => !item.is_system),
    [grantableRoles],
  );

  const systemSlugs = useMemo(
    () => Array.from(systemSlugsFromRoles(roles)),
    [roles],
  );

  const staffFilterParams = useMemo(
    () => [buildBulkRoleAssignStaffFilter(grantableRoles)],
    [grantableRoles],
  );

  const searchScopeKey = useMemo(
    () => `${selectedRoleSlug}:${grantableRoles.map((item) => item.slug).join(",")}`,
    [grantableRoles, selectedRoleSlug],
  );

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedRole = grantableRoles.find((item) => item.slug === selectedRoleSlug);

  const showMobileWarning = useMemo(() => {
    if (!selectedRoleSlug) return false;
    return selectedList.some((user) =>
      assignmentLacksLegacyRole(
        Array.from(new Set([...(user.roles ?? []), selectedRoleSlug])),
        systemSlugs,
      ),
    );
  }, [selectedList, selectedRoleSlug, systemSlugs]);

  const assignMutation = useMutation({
    mutationFn: () =>
      assignRoleBulk({
        roleSlug: selectedRoleSlug,
        userIds: selectedList.map((user) => user.id),
      }),
    onSuccess: (result) => {
      const roleName =
        selectedRole?.display_name ??
        displayNameForSlug(selectedRoleSlug, roles);
      const updatedCount = result.updated.length;
      const failedCount = result.failed.length;
      let description = `Added ${roleName} to ${updatedCount} user${updatedCount === 1 ? "" : "s"}.`;
      if (failedCount > 0) {
        description += ` ${failedCount} could not be updated.`;
      }
      toast.add({ title: "Roles updated", description });
      setSelected({});
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["role-assign-staff-search"] });
    },
    onError: () => {
      toast.add({
        title: "Could not assign roles",
        type: "error",
      });
      setConfirmOpen(false);
    },
  });

  function handleRoleChange(value: string) {
    setSelectedRoleSlug(value);
    setSelected({});
  }

  function toggleUser(user: accountType) {
    if (!selectedRoleSlug || userHasRoleSlug(user.roles, selectedRoleSlug)) return;
    setSelected((current) => {
      const next = { ...current };
      if (next[user.id]) delete next[user.id];
      else next[user.id] = user;
      return next;
    });
  }

  function removeSelected(userId: number) {
    setSelected((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  function renderUserMeta(user: accountType) {
    const alreadyAssigned = userHasRoleSlug(user.roles, selectedRoleSlug);

    return (
      <span className="flex flex-col gap-1">
        {alreadyAssigned ? (
          <span>
            <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary" >Already assigned</span>
          </span>
        ) : null}
        {(user.roles ?? []).length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {(user.roles ?? []).slice(0, 4).map((slug) => (
              <span key={slug} className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("text-[10px]")}>
                {displayNameForSlug(slug, roles)}
              </span>
            ))}
            {(user.roles ?? []).length > 4 ? (
              <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("text-[10px]")}>
                +{(user.roles ?? []).length - 4}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Role to assign</p>
        <Select value={selectedRoleSlug || undefined} onValueChange={handleRoleChange} disabled={isLoading || grantableRoles.length === 0} items={systemGrantable.map((item) => ({ value: String(item.slug), label: item.display_name }))} placeholder='Select a role' className='w-full max-w-md' />
      </div>

      {selectedList.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {selectedList.map((user) => (
              <motion.div
                key={user.id}
                variants={chipVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                layout={false}
              >
                <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("gap-1 pr-1")}>
                  <span title={user.email}>{user.name}</span>
                  <button
                    type="button"
                    className="rounded-sm p-0.5 hover:bg-muted"
                    aria-label={`Remove ${user.name}`}
                    onClick={() => removeSelected(user.id)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}

      <StaffUserSearchCombobox
        enabled={Boolean(selectedRoleSlug)}
        filterParams={staffFilterParams}
        selected={selected}
        onToggleUser={toggleUser}
        isUserDisabled={(user) => userHasRoleSlug(user.roles, selectedRoleSlug)}
        renderUserMeta={renderUserMeta}
        queryKeyPrefix="role-assign-staff-search"
        queryScopeKey={searchScopeKey}
      />

      {showMobileWarning ? (
        <div
          className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Some selected users will have only custom roles. The mobile app won&apos;t
            recognize them until it migrates — consider adding a base role too.
          </span>
        </div>
      ) : null}

      <div className="sticky bottom-0 flex justify-end border-t border-border/60 bg-background/95 py-3 backdrop-blur">
        <Button
          disabled={!selectedRoleSlug || selectedList.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          Assign to {selectedList.length} user{selectedList.length === 1 ? "" : "s"}
        </Button>
      </div>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Assign role?</AlertDialog.Title>
            <AlertDialog.Description>
              Add{" "}
              <strong>
                {selectedRole?.display_name ??
                  displayNameForSlug(selectedRoleSlug, roles)}
              </strong>{" "}
              to {selectedList.length} user{selectedList.length === 1 ? "" : "s"}?
              Existing roles will be kept.
            </AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button
                onClick={() => assignMutation.mutate()}
                isLoading={assignMutation.isPending}
              >
                Confirm
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
