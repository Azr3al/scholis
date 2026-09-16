"use client";
import { Button, Dialog, Select, Textarea, buttonVariants, useToast } from "@/components/primitives";

import { useMemo, useState } from "react";
import { Eye } from "iconoir-react";

import { useRoles } from "@/api/rbac";
import { decodeRoleString } from "@/lib/rbac/role-string";
import { useViewAsStore } from "@/store/view-as-store";

type ViewMode = "role" | "string";

export function ViewAsDialog() {
  const toast = useToast();
  const enter = useViewAsStore((state) => state.enter);
  const { data: roles = [], isLoading } = useRoles();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ViewMode>("role");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [roleString, setRoleString] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === selectedRoleId) ?? roles[0],
    [roles, selectedRoleId],
  );

  const resetForm = () => {
    setMode("role");
    setSelectedRoleId("");
    setRoleString("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      resetForm();
    }
  };

  const handleConfirm = () => {
    setError(null);

    try {
      if (mode === "role") {
        if (!selectedRole) {
          setError("Select a role to preview.");
          return;
        }

        enter({
          label: selectedRole.display_name,
          roles: [selectedRole.slug],
          permissions: selectedRole.codes,
        });
      } else {
        const decoded = decodeRoleString(roleString);
        enter({
          label: decoded.label,
          roles: [decoded.slug],
          permissions: decoded.codes,
        });
      }

      toast.add({
        title: "View-as enabled",
        description: "The app now reflects the selected role permissions.",
      });
      handleOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start view-as mode.",
      );
    }
  };

  const activeRoleId = String(selectedRole?.id ?? roles[0]?.id ?? "");

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger render={<Button type="button" variant="secondary" size="sm">
          <Eye className="mr-2 h-4 w-4" />
          View as role
        </Button>} />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-lg">
        <div>
          <Dialog.Title>View as role</Dialog.Title>
          <Dialog.Description>
            Preview the app as another role. This only changes what you see in
            the UI and does not affect your account or saved permissions.
          </Dialog.Description>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="view-as-mode">Source</label>
            <Select value={mode} onValueChange={(value) => {
                setMode(value as ViewMode);
                setError(null);
              }} items={[{ value: 'role', label: 'Choose a role' }, { value: 'string', label: 'Paste role string' }]} placeholder='Choose source' />
          </div>

          {mode === "role" ? (
            <div className="space-y-2">
              <label htmlFor="view-as-role">Role</label>
              <Select
                value={activeRoleId}
                onValueChange={setSelectedRoleId}
                disabled={isLoading || roles.length === 0}
                placeholder="Select a role"
                items={roles.map((role) => ({
                  value: String(role.id),
                  label: `${role.display_name}${role.is_system ? " (System)" : " (Custom)"}`,
                }))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="view-as-string">Role string</label>
              <Textarea
                id="view-as-string"
                value={roleString}
                onChange={(event) => {
                  setRoleString(event.target.value);
                  setError(null);
                }}
                placeholder="Paste a role string copied from the matrix editor"
                rows={4}
              />
            </div>
          )}

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div>
          <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={mode === "role" ? roles.length === 0 : !roleString.trim()}
          >
            Start view-as
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
