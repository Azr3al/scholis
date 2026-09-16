"use client";
import { Button, Dialog, Input, Select, buttonVariants, useToast } from "@/components/primitives";

import { useEffect, useMemo, useState } from "react";
import type { RbacRole } from "@/api/rbac";
import {
  useCreateRole,
  useDeleteRole,
  useUpdateRole,
} from "@/api/rbac";
import { Plus, Trash as Trash2 } from "iconoir-react";

export function roleSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type RoleCreateDialogProps = {
  roles: RbacRole[];
};

export function RoleCreateDialog({ roles }: RoleCreateDialogProps) {
  const toast = useToast();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const customRoles = useMemo(
    () => roles.filter((role) => !role.is_system),
    [roles],
  );

  const existingSlugs = useMemo(
    () => new Set(roles.map((role) => role.slug)),
    [roles],
  );

  useEffect(() => {
    if (!slugTouched) {
      setSlug(roleSlugFromName(displayName));
    }
  }, [displayName, slugTouched]);

  const resetForm = () => {
    setMode("create");
    setSelectedRoleId(null);
    setDisplayName("");
    setSlug("");
    setSlugTouched(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const handleSelectRole = (value: string) => {
    if (value === "create") {
      setMode("create");
      setSelectedRoleId(null);
      setDisplayName("");
      setSlug("");
      setSlugTouched(false);
      return;
    }
    const role = customRoles.find((item) => String(item.id) === value);
    if (!role) return;
    setMode("edit");
    setSelectedRoleId(role.id);
    setDisplayName(role.display_name);
    setSlug(role.slug);
    setSlugTouched(true);
  };

  const slugConflict =
    slug.length > 0 &&
    existingSlugs.has(slug) &&
    !(mode === "edit" && customRoles.find((r) => r.id === selectedRoleId)?.slug === slug);

  const canSubmit =
    displayName.trim().length > 0 &&
    slug.trim().length > 0 &&
    !slugConflict &&
    !(createRole.isLoading || updateRole.isLoading);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      if (mode === "create") {
        await createRole.mutateAsync({
          slug: slug.trim(),
          display_name: displayName.trim(),
        });
        toast.add({ title: "Role created" });
      } else if (selectedRoleId != null) {
        await updateRole.mutateAsync({
          roleId: selectedRoleId,
          body: { display_name: displayName.trim() },
        });
        toast.add({ title: "Role updated" });
      }
      handleOpenChange(false);
    } catch {
      toast.add({
        type: "error",
        title: "Error",
        description: "Could not save role",
      });
    }
  };

  const handleDelete = async () => {
    if (selectedRoleId == null) return;
    try {
      await deleteRole.mutateAsync(selectedRoleId);
      toast.add({ title: "Role deleted" });
      handleOpenChange(false);
    } catch {
      toast.add({
        type: "error",
        title: "Error",
        description: "Could not delete role",
      });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        render={
          <Button variant="secondary" size="sm">
            <Plus className="mr-1.5 size-4" />
            Manage roles
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Custom roles</Dialog.Title>
          <Dialog.Description>
            Create or rename custom roles. System roles cannot be deleted.
          </Dialog.Description>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label>Action</label>
            <Select
              value={mode === "create" ? "create" : String(selectedRoleId ?? "")}
              onValueChange={handleSelectRole}
              placeholder="Create new role"
              items={[
                { value: "create", label: "Create new role" },
                ...customRoles.map((role) => ({
                  value: String(role.id),
                  label: `Edit ${role.display_name}`,
                })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="role-display-name">Display name</label>
            <Input
              id="role-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Course coordinator"
            />
          </div>

          {mode === "create" ? (
            <div className="space-y-2">
              <label htmlFor="role-slug">Slug</label>
              <Input
                id="role-slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="course-coordinator"
              />
              {slugConflict ? (
                <p className="text-sm text-destructive">Slug already in use.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="gap-2 sm:justify-between">
          {mode === "edit" && selectedRoleId != null ? (
            <Button
              type="button"
              variant="danger" onClick={() => void handleDelete()}
              disabled={deleteRole.isLoading}
            >
              <Trash2 className="mr-1.5 size-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
