"use client";
import { Button, Dialog, Select, Textarea } from "@/components/primitives";

import { resignUser, type UserResignPayload } from "@/app/client-api/auth";
import { DatePicker } from "@/components/users/date-picker";
import type { accountType } from "@/types/user";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState, type ReactElement, type ReactNode } from "react";

const TYPE_OF_PAY_OPTIONS = [
  { value: "per_month", label: "Per Month" },
  { value: "per_session", label: "Per Session" },
  { value: "collaboration", label: "Collaboration Half/Half" },
] as const;

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time (FTE)" },
  { value: "part_time", label: "Part-time" },
] as const;

type UserResignDialogProps = {
  user: accountType;
  userId: string | number;
  onSuccess: () => void;
  onError: () => void;
  children: ReactNode;
};

export function UserResignDialog({
  user,
  userId,
  onSuccess,
  onError,
  children,
}: UserResignDialogProps) {
  const [open, setOpen] = useState(false);
  const [informDate, setInformDate] = useState<Date | undefined>();
  const [lastWorkingDate, setLastWorkingDate] = useState<Date | undefined>();
  const [typeOfPay, setTypeOfPay] = useState<string | undefined>();
  const [employmentType, setEmploymentType] = useState<string | undefined>(
    user.employment_type ?? undefined
  );
  const [remark, setRemark] = useState("");

  const resignMutation = useMutation({
    mutationKey: [`resignUser${userId}`],
    mutationFn: (payload: UserResignPayload) => resignUser(userId, payload),
    onSuccess: () => {
      setOpen(false);
      onSuccess();
    },
    onError: () => {
      onError();
    },
  });

  const handleSubmit = () => {
    if (!lastWorkingDate) return;

    const payload: UserResignPayload = {
      last_working_date: format(lastWorkingDate, "yyyy-MM-dd"),
    };
    if (informDate) {
      payload.inform_date = format(informDate, "yyyy-MM-dd");
    }
    if (typeOfPay) {
      payload.type_of_pay = typeOfPay;
    }
    if (employmentType) {
      payload.employment_type = employmentType;
    }
    if (remark.trim()) {
      payload.remark = remark.trim();
    }
    resignMutation.mutate(payload);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={children as ReactElement} />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-lg">
        <Dialog.Title>Mark {user.name} as resigned</Dialog.Title>
        <Dialog.Description className="text-sm text-text-muted">
          This disables their account and records resignation details. You can
          re-enable them later from this page if needed.
        </Dialog.Description>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <label htmlFor="resign-inform-date">Inform date</label>
            <DatePicker date={informDate} setDate={setInformDate} />
          </div>
          <div className="grid gap-2">
            <label htmlFor="resign-last-working-date">
              Last working date <span className="text-destructive">*</span>
            </label>
            <DatePicker date={lastWorkingDate} setDate={setLastWorkingDate} />
          </div>
          <div className="grid gap-2">
            <label htmlFor="resign-type-of-pay">Type of pay</label>
            <Select
              value={typeOfPay}
              onValueChange={(value) => setTypeOfPay(value as string | undefined)}
              items={TYPE_OF_PAY_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
              placeholder="Select type of pay"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="resign-employment-type">Employment type</label>
            <Select
              value={employmentType}
              onValueChange={(value) =>
                setEmploymentType(value as string | undefined)
              }
              items={EMPLOYMENT_TYPE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
              placeholder="Select employment type"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="resign-remark">Remark / reason</label>
            <Textarea
              id="resign-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Reason for resignation or additional notes"
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Dialog.Close
            render={
              <Button type="button" variant="secondary" disabled={resignMutation.isPending}>
                Cancel
              </Button>
            }
          />
          <Button
            type="button"
            variant="danger"
            isLoading={resignMutation.isPending}
            disabled={!lastWorkingDate}
            onClick={handleSubmit}
          >
            Confirm resignation
          </Button>
        </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
