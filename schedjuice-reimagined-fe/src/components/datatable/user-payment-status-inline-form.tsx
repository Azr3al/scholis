"use client";

import { updateEntity } from "@/app/client-api/utils";
import { CellSaveFeedback, useCellAutosave } from "@/components/edit-kit";
import { useToast } from "@/components/primitives";
import { snakeToTitle } from "@/helpers/formatters";
import {
  patchPaymentRowInQueryCaches,
  restoreQueryCacheSnapshots,
  type QueryCacheSnapshot,
} from "@/lib/finances/patch-payment-row-cache";
import { softRefetchStudentPaymentsReport } from "@/lib/finances/soft-refetch-student-payments-report";
import { PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS } from "@/lib/ui/select-layout";
import { cn } from "@/lib/utils";
import {
  isSystemOnlyUserPaymentStatus,
  isUserPaymentStatusManuallyEditable,
  MANUAL_USER_PAYMENT_STATUSES,
  UserPaymentStatus,
} from "@/types/finance";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import Selector from "../form/selectors/selector";

interface StatusInlineFormProps {
  status: UserPaymentStatus;
  userPaymentId: number | string;
  isDisabled?: boolean;
  userId: string;
  /** When set, soft-refetch scopes to this admin-report / search uid. */
  tableUid?: string;
}

const UserPaymentStatusInlineForm: React.FC<StatusInlineFormProps> = ({
  status,
  userPaymentId,
  isDisabled = false,
  tableUid,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cacheSnapRef = useRef<QueryCacheSnapshot[]>([]);

  const statusOptions = useMemo(() => {
    const manual = MANUAL_USER_PAYMENT_STATUSES.map((value) => ({
      label: snakeToTitle(value),
      value,
    }));
    if (isSystemOnlyUserPaymentStatus(status)) {
      return [
        { label: snakeToTitle(status), value: status },
        ...manual,
      ];
    }
    return manual;
  }, [status]);

  const {
    displayValue,
    setLocalValue,
    commit,
    status: saveStatus,
    showSavedTick,
  } = useCellAutosave({
    value: status,
    onOptimisticUpdate: (next) => {
      cacheSnapRef.current = patchPaymentRowInQueryCaches(
        queryClient,
        userPaymentId,
        { status: next },
      );
    },
    onRollback: () => {
      restoreQueryCacheSnapshots(queryClient, cacheSnapRef.current);
      cacheSnapRef.current = [];
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not update status.",
      });
    },
    onSave: async (next) => {
      await updateEntity("user-payments", userPaymentId, { status: next });
      await softRefetchStudentPaymentsReport(queryClient, { tableUid });
    },
  });

  return (
    <div
      className={cn(
        PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS,
        "flex w-full max-w-full items-center gap-2",
      )}
    >
      <div className="min-w-0 flex-1">
        <Selector
          fullWidth
          containerClassName="min-w-0"
          className={cn({
            "border-success":
              displayValue === UserPaymentStatus.verified,
            "border-warning":
              displayValue === UserPaymentStatus.pending_verification,
          })}
          isDisabled={
            isDisabled || !isUserPaymentStatusManuallyEditable(status)
          }
          options={statusOptions}
          value={displayValue}
          onChange={(v) => {
            setLocalValue(v as UserPaymentStatus);
            void commit();
          }}
        />
      </div>
      <CellSaveFeedback status={saveStatus} showSavedTick={showSavedTick} />
    </div>
  );
};

export default UserPaymentStatusInlineForm;
