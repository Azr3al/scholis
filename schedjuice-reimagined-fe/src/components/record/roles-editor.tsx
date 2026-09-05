"use client";
import { Button, Checkbox, useToast } from "@/components/primitives";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WarningTriangle as AlertTriangle } from "iconoir-react";
import { useRoles } from "@/api/rbac";
import { revealBar } from "@/lib/sj/motion";
import { RecordSection } from "@/components/record/record-section";
import EntityChooserCheckbox from "@/components/auth/entity-chooser-checkbox";
import { assignmentLacksLegacyRole } from "@/components/rbac/role-assigner-utils";
import { AlertDialog } from "@/components/primitives/alert-dialog";
import { updateEntity } from "@/app/client-api/utils";
import { hasStudentRole } from "@/helpers/role";
import { usePermissions } from "@/hooks/usePermissions";
import type { accountType, role } from "@/types/user";
import {
  displayNameForSlug,
  filterAssignableCustomRoles,
  mergeProfileRoles,
  partitionRoles,
  resolveCustomRolesForSave,
  systemSlugsFromRoles,
} from "./profile-role-utils";

export function RolesEditor({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  const { can } = usePermissions();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: rbacRoles = [] } = useRoles();

  const canEdit = can("user.assign_roles");
  const canManageRbac = can("rbac.manage");

  const subjectPartition = useMemo(
    () => partitionRoles(subject.roles ?? [], rbacRoles),
    [subject.roles, rbacRoles],
  );

  const [customRoles, setCustomRoles] = useState<string[]>([]);

  const form = useForm<{ roles: role[] }>({
    defaultValues: { roles: subjectPartition.system as role[] },
  });

  useEffect(() => {
    const { system, custom } = partitionRoles(subject.roles ?? [], rbacRoles);
    form.reset({ roles: system as role[] });
    setCustomRoles(custom);
  }, [subject.roles, rbacRoles, form]);

  const systemDraft = form.watch("roles") ?? [];
  const subjectCustomRoles = subjectPartition.custom;
  const customForSave = resolveCustomRolesForSave({
    canManageRbac,
    selectedCustom: customRoles,
    subjectCustom: subjectCustomRoles,
  });
  const mergedDraft = mergeProfileRoles(systemDraft, customForSave);
  const mergedSubject = subject.roles ?? [];

  const dirty =
    JSON.stringify([...mergedDraft].sort()) !==
    JSON.stringify([...mergedSubject].sort());

  const assignableCustom = filterAssignableCustomRoles(rbacRoles, canManageRbac);
  const systemSlugs = useMemo(
    () => Array.from(systemSlugsFromRoles(rbacRoles)),
    [rbacRoles],
  );
  const studentSelected = hasStudentRole(systemDraft);
  const showMobileWarning = assignmentLacksLegacyRole(mergedDraft, systemSlugs);

  const save = useMutation({
    mutationFn: () => {
      const customPayload = resolveCustomRolesForSave({
        canManageRbac,
        selectedCustom: customRoles,
        subjectCustom: subjectCustomRoles,
      });
      const payload = mergeProfileRoles(form.getValues("roles"), customPayload);
      return updateEntity("users", String(subject.id), { roles: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordQueryKey });
      toast.add({ title: "Roles updated" });
      setConfirmOpen(false);
    },
    onError: () => {
      toast.add({ title: "Could not update roles" });
      setConfirmOpen(false);
    },
  });

  const handleCancel = () => {
    form.reset({ roles: subjectPartition.system as role[] });
    setCustomRoles(subjectPartition.custom);
  };

  const handleCustomToggle = (slug: string, checked: boolean) => {
    setCustomRoles((current) =>
      checked ? [...current, slug] : current.filter((item) => item !== slug),
    );
  };

  return (
    <RecordSection title="Roles & team">
      <FormProvider {...form}>
        <Controller
          control={form.control}
          name="roles"
          render={({ field }) => (
            <EntityChooserCheckbox
              fieldName="roles"
              roles={field.value ?? []}
              onRolesChange={(next) => {
                field.onChange(next);
                if (hasStudentRole(next)) {
                  setCustomRoles([]);
                }
              }}
              userRoles={viewer.roles ?? []}
              disabled={!canEdit}
              label=""
            />
          )}
        />
      </FormProvider>

      {!canManageRbac && subjectCustomRoles.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border/70 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Custom roles
          </p>
          <div className="flex flex-wrap gap-2">
            {subjectCustomRoles.map((slug) => (
              <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary" key={slug}>
                {displayNameForSlug(slug, rbacRoles)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Only administrators with role-management access can change custom
            roles.
          </p>
        </div>
      ) : null}

      {canManageRbac ? (
        <div className="mt-3 space-y-3 rounded-xl border border-border/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Custom roles
            </p>
            <Link
              href="/administration/roles"
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Manage custom roles →
            </Link>
          </div>
          {assignableCustom.length > 0 ? (
            <div className="space-y-3">
              {assignableCustom.map((item) => {
                const checked = customRoles.includes(item.slug);
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`custom-role-${item.slug}`}
                      checked={checked}
                      disabled={!canEdit || studentSelected}
                      onCheckedChange={(value) =>
                        handleCustomToggle(item.slug, value === true)
                      }
                    />
                    <label
                      htmlFor={`custom-role-${item.slug}`}
                      className="cursor-pointer"
                    >
                      {item.display_name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        Custom
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No custom roles yet. Create one from the roles admin page.
            </p>
          )}
          {studentSelected ? (
            <p className="text-xs text-muted-foreground">
              Custom roles cannot be combined with Student.
            </p>
          ) : null}
        </div>
      ) : null}

      {showMobileWarning ? (
        <div
          className="mt-3 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
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

      <AnimatePresence initial={false}>
        {canEdit && dirty ? (
          <motion.div
            key="roles-save-bar"
            variants={revealBar}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden motion-reduce:transition-none"
          >
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => setConfirmOpen(true)}>
                Save roles
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Update roles &amp; team?</AlertDialog.Title>
            <AlertDialog.Description>
              This changes what this person can access and may trigger account provisioning.
            </AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button onClick={() => save.mutate()} isLoading={save.isPending}>
                Confirm
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </RecordSection>
  );
}
