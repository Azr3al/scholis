"use client";

import { Calendar } from "@/components/date/calendar";
import { Popover, buttonVariants, useToast } from "@/components/primitives";
import { updateEntity } from "@/app/client-api/utils";
import { formatDate } from "@/helpers/date";
import { queryClient } from "@/lib/query";
import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { useMutation } from "@tanstack/react-query";
import { Calendar as CalendarIcon } from "iconoir-react";
import { useState } from "react";

export interface InlineDatePickerProps {
  value?: string | null;
  fieldName?: string;
  entityName?: string;
  entityId?: number | string;
  saveTransform?: (date: Date) => string;
  onChange?: (iso: string) => void;
  onSaved?: () => void;
  refetchQueryKeys?: Array<readonly unknown[]>;
  isDisabled?: boolean;
  className?: string;
}

const InlineDatePicker: React.FC<InlineDatePickerProps> = ({
  value,
  fieldName = "payment_date",
  entityName,
  entityId,
  saveTransform,
  onChange,
  onSaved,
  refetchQueryKeys,
  isDisabled = false,
  className,
}) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(value) : undefined;

  const isSelfContained =
    !!fieldName && !!entityName && entityId !== undefined && entityId !== null;

  const updateMutation = useMutation({
    mutationKey: ["inlineDatePickerUpdate", entityName, entityId, fieldName],
    mutationFn: async (iso: string) => {
      if (!isSelfContained) return;
      return updateEntity(entityName!, entityId!, {
        [fieldName!]: iso,
      });
    },
    onSuccess: () => {
      toast.add({ description: "Date updated successfully" });
      setOpen(false);
      onSaved?.();
      refetchQueryKeys?.forEach((key) => {
        void queryClient.refetchQueries({ queryKey: key });
      });
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to update date",
        type: "error",
      });
    },
  });

  const handleSelect = (date: Date | undefined) => {
    if (!date || isDisabled || updateMutation.isPending) return;
    const iso = saveTransform ? saveTransform(date) : date.toISOString();
    onChange?.(iso);
    if (isSelfContained) {
      updateMutation.mutate(iso);
    }
  };

  const display = value ? formatDate(value) : "—";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={isDisabled || updateMutation.isPending}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-8 w-full justify-start px-2 font-normal",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <CalendarIcon className="mr-2 size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{display}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={dropdownPositionerClassName} align="start">
          <Popover.Popup className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleSelect}
              defaultMonth={selectedDate}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default InlineDatePicker;
