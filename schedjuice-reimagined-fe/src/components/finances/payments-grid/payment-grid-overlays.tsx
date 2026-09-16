"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, Menu, Popover, buttonVariants, useToast } from "@/components/primitives";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/misc/command";

import { useMutation } from "@tanstack/react-query";
import { Check as CheckIcon } from "iconoir-react";

import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import {
  MANUAL_USER_PAYMENT_STATUSES,
  UserPaymentStatus,
} from "@/types/finance";
import { invalidateUserPaymentsCaches } from "@/lib/finances/invalidate-user-payments-caches";
import { softRefetchStudentPaymentsReport } from "@/lib/finances/soft-refetch-student-payments-report";
import { queryClient } from "@/lib/query";
import { useUser } from "@/hooks/useUser";
import { canVerifyPayments } from "@/helpers/authorization";
import { usePermissions } from "@/hooks/usePermissions";
import { deleteEntity, updateEntity } from "@/app/client-api/utils";
import { Calendar } from "@/components/date/calendar";
import { getTenantDayBoundariesIso } from "@/helpers/shortcuts-time";
import { formatInTimeZone } from "date-fns-tz";
import { snakeToTitle } from "@/helpers/formatters";
import { cn } from "@/lib/utils";
import {
  syntheticAllowsInlineCreate,
  isDroppedEnrollmentRow,
  isExemptPaymentExpectationRow,
  isGroupPaymentRow,
  isSyntheticPaymentRow,
} from "@/lib/data-sheets/payment-row-utils";
import { resolveGroupId } from "@/lib/finances/flatten-payment-report-rows";

export type CellAnchorTarget = {
  rowIndex: number;
  rect: { x: number; y: number; width: number; height: number };
};

const statusOptions = MANUAL_USER_PAYMENT_STATUSES.map((value) => ({
  value,
  label: snakeToTitle(value),
}));

function cellAnchorStyle(target: CellAnchorTarget) {
  return {
    position: "fixed" as const,
    left: target.rect.x,
    top: target.rect.y + target.rect.height,
    width: Math.max(target.rect.width, 1),
    height: 0,
  };
}

export function PaymentStatusPopover({
  target,
  row,
  tableUid,
  onClose,
  onRetryExtraction,
}: {
  target: CellAnchorTarget | null;
  row: StudentPaymentAdminReportRow | null;
  tableUid: string;
  onClose: () => void;
  onRetryExtraction?: () => void;
}) {
  const { user } = useUser();
  const toast = useToast();

  const updateMutation = useMutation({
    mutationFn: (updatedStatus: UserPaymentStatus) => {
      if (!row) {
        return Promise.reject(new Error("No payment row"));
      }
      return updateEntity("user-payments", row.id, {
        status: updatedStatus,
      });
    },
    onSuccess: () => {
      void invalidateUserPaymentsCaches(queryClient, { tableUid });
      toast.add({ description: "Status updated successfully" });
      onClose();
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not update status.",
      });
    },
  });

  if (!target || !row) return null;

  if (isDroppedEnrollmentRow(row)) {
    return null;
  }

  if (syntheticAllowsInlineCreate(row)) {
    return null;
  }

  const isDisabled = Boolean(user && !canVerifyPayments(user));

  return (
    <Popover.Root open onOpenChange={(open) => !open && onClose()}>
      <Popover.Trigger render={<div style={cellAnchorStyle(target)} />} />
      <Popover.Portal>
        <Popover.Positioner align="start">
        <Popover.Popup className="w-64 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
        </div>
        <Command>
          <CommandList className="max-h-64">
            <CommandGroup>
              {statusOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  disabled={isDisabled || updateMutation.isPending}
                  onSelect={() => {
                    if (isDisabled || updateMutation.isPending) return;
                    if (option.value === row.status) {
                      onClose();
                      return;
                    }
                    updateMutation.mutate(option.value);
                  }}
                  className="cursor-pointer"
                >
                  {updateMutation.isPending ? (
                    <Spinner
 className="mr-2 size-4 shrink-0 opacity-70"
 aria-hidden
 />
                  ) : (
                    <CheckIcon
                      className={cn(
                        "mr-2 size-4 shrink-0",
                        row.status === option.value
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                      aria-hidden
                    />
                  )}
                  <span>{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {row.status === UserPaymentStatus.cannot_extract &&
        user &&
        canVerifyPayments(user) &&
        !isExemptPaymentExpectationRow(row) &&
        onRetryExtraction ? (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="secondary" size="sm"
              className="w-full"
              onClick={() => {
                onRetryExtraction();
                onClose();
              }}
            >
              Retry extraction
            </Button>
          </div>
        ) : null}
      </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function PaymentMethodPopover({
  target,
  row,
  options,
  isOptionsLoading,
  tableUid,
  onClose,
  onSave,
}: {
  target: CellAnchorTarget | null;
  row: StudentPaymentAdminReportRow | null;
  options: { value: string; label: string }[];
  isOptionsLoading: boolean;
  tableUid: string;
  onClose: () => void;
  onSave: (row: StudentPaymentAdminReportRow, value: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const value =
    row?.payment_method?.id != null ? String(row.payment_method.id) : "";

  const saveMutation = useMutation({
    mutationFn: (nextId: string) => {
      if (!row) {
        return Promise.reject(new Error("No payment row"));
      }
      return onSave(row, nextId);
    },
    onSuccess: () => {
      void softRefetchStudentPaymentsReport(queryClient, { tableUid });
      onClose();
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not update payment account.",
      });
    },
  });

  if (!target || !row) return null;

  const isDisabled =
    row.status === UserPaymentStatus.verified ||
    isExemptPaymentExpectationRow(row);

  const handleSelect = (nextId: string) => {
    if (saveMutation.isPending || isDisabled) return;
    if (nextId === value) {
      onClose();
      return;
    }
    saveMutation.mutate(nextId);
  };

  return (
    <Popover.Root open onOpenChange={(open) => !open && onClose()}>
      <Popover.Trigger render={<div style={cellAnchorStyle(target)} />} />
      <Popover.Portal>
        <Popover.Positioner align="start">
        <Popover.Popup className="w-72 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Payment account
          </p>
        </div>
        <Command>
          <CommandInput placeholder="Search accounts…" disabled={isDisabled} />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {isOptionsLoading ? (
                <span className="flex items-center justify-center gap-2 py-2">
                  <Spinner className="size-4 shrink-0 " aria-hidden />
                  <span>Loading…</span>
                </span>
              ) : (
                "No account found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {value ? (
                <CommandItem
                  value="__clear__"
                  disabled={isDisabled || saveMutation.isPending}
                  onSelect={() => handleSelect("")}
                  className="cursor-pointer text-muted-foreground"
                >
                  <CheckIcon className="mr-2 size-4 shrink-0 opacity-0" aria-hidden />
                  <span>Clear selection</span>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={String(option.value)}
                  keywords={[option.label, option.value]}
                  disabled={isDisabled || saveMutation.isPending}
                  onSelect={() => handleSelect(String(option.value))}
                  className="cursor-pointer"
                >
                  {saveMutation.isPending ? (
                    <Spinner
 className="mr-2 size-4 shrink-0 opacity-70"
 aria-hidden
 />
                  ) : (
                    <CheckIcon
                      className={cn(
                        "mr-2 size-4 shrink-0",
                        value === String(option.value)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function PaymentDatePopover({
  target,
  row,
  tableUid,
  tenantTimezone,
  onClose,
  onSave,
}: {
  target: CellAnchorTarget | null;
  row: StudentPaymentAdminReportRow | null;
  tableUid: string;
  tenantTimezone: string;
  onClose: () => void;
  onSave: (row: StudentPaymentAdminReportRow, iso: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const selected = row?.payment_date ? new Date(row.payment_date) : undefined;

  const saveMutation = useMutation({
    mutationFn: (iso: string) => {
      if (!row) {
        return Promise.reject(new Error("No payment row"));
      }
      return onSave(row, iso);
    },
    onSuccess: () => {
      void softRefetchStudentPaymentsReport(queryClient, { tableUid });
      onClose();
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not update payment date.",
      });
    },
  });

  if (!target || !row) return null;

  const handleSelect = (date: Date | undefined) => {
    if (!date || saveMutation.isPending) return;
    const ymd = formatInTimeZone(date, tenantTimezone, "yyyy-MM-dd");
    const iso = getTenantDayBoundariesIso(tenantTimezone, ymd).startIso;
    if (iso === row.payment_date) {
      onClose();
      return;
    }
    saveMutation.mutate(iso);
  };

  return (
    <Popover.Root open onOpenChange={(open) => !open && onClose()}>
      <Popover.Trigger render={<div style={cellAnchorStyle(target)} />} />
      <Popover.Portal>
        <Popover.Positioner align="start">
          <Popover.Popup className="w-auto p-0">
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                Payment date
              </p>
            </div>
            <Calendar
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              defaultMonth={selected}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export type PaymentActionId =
  | "view"
  | "download_receipt"
  | "duplicate_search"
  | "edit_coverage"
  | "upload_screenshot"
  | "refunds"
  | "delete";

export function PaymentActionsMenu({
  target,
  row,
  actions,
  onAction,
  onClose,
}: {
  target: CellAnchorTarget | null;
  row: StudentPaymentAdminReportRow | null;
  actions: { id: PaymentActionId; label: string; destructive?: boolean }[];
  onAction: (id: PaymentActionId) => void;
  onClose: () => void;
}) {
  const { user } = useUser();
  const { can } = usePermissions();
  const toast = useToast();

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!row || isSyntheticPaymentRow(row)) {
        return Promise.reject(new Error("Cannot delete"));
      }
      if (isGroupPaymentRow(row)) {
        const groupId = resolveGroupId(row);
        if (groupId == null) {
          return Promise.reject(new Error("Cannot delete"));
        }
        return deleteEntity("user-payment-groups", groupId);
      }
      return deleteEntity("user-payments", String(row.id));
    },
    onSuccess: () => {
      toast.add({ description: "Payment deleted." });
      void softRefetchStudentPaymentsReport(queryClient);
      onClose();
    },
  });

  if (!target || !row || actions.length === 0) return null;

  return (
    <Menu.Root open onOpenChange={(open) => !open && onClose()}>
      <Menu.Trigger render={<div
          style={{
            position: "fixed",
            left: target.rect.x,
            top: target.rect.y,
            width: Math.max(target.rect.width, 1),
            height: target.rect.height,
            opacity: 0,
            pointerEvents: "none",
          }}
        />} />
      <Menu.Portal>
        <Menu.Positioner align="start">
        <Menu.Popup
        style={{
          position: "fixed",
          left: target.rect.x,
          top: target.rect.y + target.rect.height + 4,
        }}
      >
        {actions.map((action) =>
          action.id === "delete" ? (
            <ConfirmationDialog
              key={action.id}
              content={
                row && isGroupPaymentRow(row)
                  ? "This will delete all transactions in this payment group. This action cannot be undone."
                  : "This action cannot be undone"
              }
              onConfirm={() => deleteMutation.mutate()}
            >
              <Menu.Item
                className="text-destructive focus:text-destructive"
                disabled={Boolean(user && !can("payment.verify"))}
                onSelect={(e) => e.preventDefault()}
              >
                {action.label}
              </Menu.Item>
            </ConfirmationDialog>
          ) : (
            <Menu.Item
              key={action.id}
              onClick={() => {
                onAction(action.id);
                onClose();
              }}
            >
              {action.label}
            </Menu.Item>
          ),
        )}
      </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function PaymentStudentLinkPopover({
  target,
  studentName,
  onOpenStudent,
  onClose,
}: {
  target: CellAnchorTarget | null;
  studentName: string;
  onOpenStudent: () => void;
  onClose: () => void;
}) {
  if (!target) return null;

  return (
    <Popover.Root open onOpenChange={(open) => !open && onClose()}>
      <Popover.Trigger render={<div style={cellAnchorStyle(target)} />} />
      <Popover.Portal>
        <Popover.Positioner align="start">
        <Popover.Popup className="w-56 space-y-2 p-3">
        <p className="truncate text-sm font-medium">{studentName}</p>
        <Button type="button" size="sm" className="w-full" onClick={onOpenStudent}>
          View all payments
        </Button>
      </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
