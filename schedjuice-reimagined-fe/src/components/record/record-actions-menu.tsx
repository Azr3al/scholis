"use client";
import { Button, useToast } from "@/components/primitives";
import { useState } from "react";
import { MoreHoriz } from "iconoir-react";
import { useRouter } from "next/navigation";
import { Menu } from "@/components/primitives/menu";
import { AlertDialog } from "@/components/primitives/alert-dialog";
import { ResignDialog } from "@/components/record/resign-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteEntity, updateEntity } from "@/app/client-api/utils";
import { resendUserWelcomeEmail } from "@/app/client-api/auth";
import {
  canDeleteUser,
  hasAdminCredentials,
  isStudentOnlyUser,
  isSuperAdmin,
} from "@/helpers/authorization";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useTenant } from "@/hooks/useTenant";
import type { accountType } from "@/types/user";

type Confirm = "disable" | "welcome" | "delete" | null;

export type RecordAdminActionsState = ReturnType<typeof useRecordAdminActions>;

export function useRecordAdminActions({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [resignOpen, setResignOpen] = useState(false);

  const isAdmin = hasAdminCredentials(viewer);
  const canWelcome =
    isSuperAdmin(viewer) &&
    Boolean(subject.communication_email) &&
    !(
      tenant?.is_student_login_disabled && isStudentOnlyUser(subject)
    );
  const canResign =
    isAdmin &&
    !isStudentOnlyUser(subject) &&
    subject.is_active &&
    !subject.resigned_at;
  const canDelete = canDeleteUser(viewer);

  const setActive = useMutation({
    mutationFn: (active: boolean) =>
      updateEntity("users", String(subject.id), { is_active: active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordQueryKey });
      toast.add({ title: "User updated" });
      setConfirm(null);
    },
    onError: () => {
      toast.add({ title: "Could not update user" });
      setConfirm(null);
    },
  });

  const welcome = useMutation({
    mutationFn: () => resendUserWelcomeEmail(String(subject.id)),
    onSuccess: () => {
      toast.add({ title: "Welcome email sent" });
      setConfirm(null);
    },
    onError: () => {
      toast.add({ title: "Could not send email" });
      setConfirm(null);
    },
  });

  const deleteUser = useMutation({
    mutationFn: () => deleteEntity("users", subject.id),
    onSuccess: () => {
      toast.add({ title: "User deleted" });
      setConfirm(null);
      router.push("/users");
    },
    onError: (err) => {
      toast.add({
        title: "Could not delete user",
        description: parseSchedjuiceApiError(err, "Could not delete user")});
      setConfirm(null);
    },
  });

  const actionPending = setActive.isPending || welcome.isPending || deleteUser.isPending;

  return {
    isAdmin,
    canWelcome,
    canResign,
    canDelete,
    confirm,
    setConfirm,
    resignOpen,
    setResignOpen,
    setActive,
    welcome,
    deleteUser,
    actionPending,
    toast,
    qc,
  };
}

export function RecordAdminMenuItems({
  admin,
  subject,
}: {
  admin: RecordAdminActionsState;
  subject: accountType;
}) {
  const {
    canWelcome,
    canResign,
    canDelete,
    setConfirm,
    setResignOpen,
    setActive,
  } = admin;

  return (
    <>
      {canWelcome ? (
        <Menu.Item onClick={() => setConfirm("welcome")}>Re-send welcome email</Menu.Item>
      ) : null}
      {canResign ? (
        <Menu.Item onClick={() => setResignOpen(true)}>Mark as resigned</Menu.Item>
      ) : null}
      {subject.is_active === false ? (
        <Menu.Item onClick={() => setActive.mutate(true)}>Re-enable user</Menu.Item>
      ) : (
        <Menu.Item
          onClick={() => setConfirm("disable")}
          className="text-danger data-[highlighted]:bg-danger data-[highlighted]:text-white"
        >
          Disable user
        </Menu.Item>
      )}
      {canDelete ? (
        <Menu.Item
          onClick={() => setConfirm("delete")}
          className="text-danger data-[highlighted]:bg-danger data-[highlighted]:text-white"
        >
          Delete user
        </Menu.Item>
      ) : null}
    </>
  );
}

export function RecordAdminDialogs({
  admin,
  subject,
  recordQueryKey,
}: {
  admin: RecordAdminActionsState;
  subject: accountType;
  recordQueryKey: unknown[];
}) {
  const {
    confirm,
    setConfirm,
    resignOpen,
    setResignOpen,
    setActive,
    welcome,
    deleteUser,
    actionPending,
    toast,
    qc,
  } = admin;

  return (
    <>
      <ResignDialog
        user={subject}
        userId={subject.id}
        open={resignOpen}
        onOpenChange={setResignOpen}
        onSuccess={() => {
          toast.add({ title: "User marked as resigned" });
          qc.invalidateQueries({ queryKey: recordQueryKey });
        }}
        onError={() =>
          toast.add({ title: "Could not mark user as resigned" })
        }
      />

      <AlertDialog.Root
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o && !actionPending) setConfirm(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>
              {confirm === "disable"
                ? "Disable this user?"
                : confirm === "delete"
                  ? "Delete this user?"
                  : "Re-send welcome email?"}
            </AlertDialog.Title>
            <AlertDialog.Description>
              {confirm === "disable"
                ? "They will lose access until re-enabled."
                : confirm === "delete"
                  ? "This permanently removes the user and cannot be undone."
                  : "A new welcome email will be sent to their communication email."}
            </AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button
                variant={confirm === "welcome" ? "primary" : "danger"}
                isLoading={actionPending}
                onClick={() => {
                  if (confirm === "disable") setActive.mutate(false);
                  else if (confirm === "delete") deleteUser.mutate();
                  else welcome.mutate();
                }}
              >
                Confirm
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

/** Standalone admin menu (legacy / identity strip). Prefer RecordProfileHeaderActions on user record. */
export function RecordActionsMenu({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  const admin = useRecordAdminActions({ subject, viewer, recordQueryKey });

  if (!admin.isAdmin) return null;

  return (
    <>
      <RecordAdminDialogs admin={admin} subject={subject} recordQueryKey={recordQueryKey} />
      <Menu.Root>
        <Menu.Trigger
          className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          aria-label="More actions"
        >
          <MoreHoriz width={18} height={18} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end">
            <Menu.Popup>
              <RecordAdminMenuItems admin={admin} subject={subject} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
