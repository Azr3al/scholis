"use client";
import {
  Button,
  Popover,
  Select,
  buttonVariants,
  useToast,
} from "@/components/primitives";

import { updateEntity } from "@/app/client-api/utils";
import {
  hhmmTo12HourSegments,
  segmentsToHhmm,
  type Time12Period,
} from "@/helpers/time-12h";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { queryClient } from "@/lib/query";
import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { useMutation } from "@tanstack/react-query";
import { Clock } from "iconoir-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface InlineTimeSelectProps {
  value?: string | null;
  fieldName?: string;
  entityName?: string;
  entityId?: number | string;
  saveTransform?: (value: string) => any;
  onChange?: (value: string) => void;
  onOpenChange?: (open: boolean, currentValue: string) => void;
  uid?: string;
  refetchQueryKeys?: Array<readonly unknown[]>;
  isDisabled?: boolean;
  /**
   * Draft picks in the popover; commit on Confirm and close only then.
   * Used on finance check-in histories inline edit.
   */
  confirmToClose?: boolean;
  /** @deprecated Prefer org `time_display_format` / `timeDisplayFormat`. */
  use12Hour?: boolean;
  timeDisplayFormat?: TimeDisplayFormatValue;
  "aria-label"?: string;
}

function draftFromValue(value: string) {
  const segments = hhmmTo12HourSegments(value || null);
  return {
    hh: value.split(":")[0] || "00",
    mm: value.split(":")[1] || "00",
    hour12: segments.hour ?? "12",
    period: (segments.period ?? "AM") as Time12Period,
    hasValue: !!value,
  };
}

const InlineTimeSelect: React.FC<InlineTimeSelectProps> = ({
  value,
  fieldName,
  entityName,
  entityId,
  saveTransform,
  onChange,
  onOpenChange,
  uid,
  refetchQueryKeys,
  isDisabled = false,
  confirmToClose = false,
  use12Hour: _use12Hour,
  timeDisplayFormat,
  "aria-label": ariaLabel,
}) => {
  const toast = useToast();
  const { tenant } = useTenant();
  const format = resolveTimeDisplayFormat(
    timeDisplayFormat ?? tenant?.time_display_format,
  );
  const is12h = format === "12h";
  const allowCloseRef = useRef(false);

  const hourOptions24 = useMemo(
    () => Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0")),
    [],
  );
  const hourOptions12 = useMemo(
    () => Array.from({ length: 12 }, (_, i) => String(i + 1)),
    [],
  );
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")),
    [],
  );
  const periodOptions = useMemo(() => ["AM", "PM"] as const, []);

  const normalizedValue = value ?? "";
  const initialDraft = draftFromValue(normalizedValue);

  const [open, setOpen] = useState(false);
  const [hh, setHh] = useState(initialDraft.hh);
  const [mm, setMm] = useState(initialDraft.mm);
  const [hour12, setHour12] = useState(initialDraft.hour12);
  const [period, setPeriod] = useState<Time12Period>(initialDraft.period);
  const [hasValue, setHasValue] = useState(initialDraft.hasValue);

  const currentHhmm = is12h
    ? segmentsToHhmm(hour12, mm, period)
    : `${hh}:${mm}`;

  const committedDisplay = normalizedValue
    ? formatOrgTime(normalizedValue, format)
    : "";

  const displayValue = confirmToClose
    ? committedDisplay
    : hasValue
      ? formatOrgTime(currentHhmm, format)
      : "";

  useEffect(() => {
    const draft = draftFromValue(value ?? "");
    if (confirmToClose && open) return;
    setHasValue(draft.hasValue);
    setHh(draft.hh);
    setMm(draft.mm);
    setHour12(draft.hour12);
    setPeriod(draft.period);
  }, [value, confirmToClose, open]);

  const isSelfContained =
    !!fieldName && !!entityName && entityId !== undefined && entityId !== null;

  const closePopover = (nextDisplay: string) => {
    allowCloseRef.current = true;
    setOpen(false);
    onOpenChange?.(false, nextDisplay);
  };

  const updateMutation = useMutation({
    mutationKey: ["inlineTimeSelectUpdate", entityName, entityId, fieldName],
    mutationFn: async (v: string) => {
      if (!isSelfContained) return;
      return updateEntity(entityName!, entityId!, {
        [fieldName!]: saveTransform ? saveTransform(v) : v,
      });
    },
    onSuccess: () => {
      toast.add({ description: "Time updated successfully" });
      closePopover(formatOrgTime(currentHhmm, format));
      if (uid && entityName) {
        queryClient.refetchQueries({ queryKey: [`search${entityName}`, uid] });
      } else if (refetchQueryKeys && refetchQueryKeys.length > 0) {
        refetchQueryKeys.forEach((key) =>
          queryClient.refetchQueries({ queryKey: key }),
        );
      } else if (entityName) {
        queryClient.refetchQueries({ queryKey: [`search${entityName}`] });
      }
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to update time",
        type: "error",
      });
      const draft = draftFromValue(value ?? "");
      setHasValue(draft.hasValue);
      setHh(draft.hh);
      setMm(draft.mm);
      setHour12(draft.hour12);
      setPeriod(draft.period);
    },
  });

  const commitValue = (v: string) => {
    onChange?.(v);
    if (isSelfContained) {
      updateMutation.mutate(v);
    }
  };

  const applyHhmm = (nextHhmm: string) => {
    setHasValue(true);
    commitValue(nextHhmm);
  };

  const setH = (newH: string) => {
    setHh(newH);
    if (confirmToClose) return;
    applyHhmm(`${newH}:${mm}`);
  };

  const setM = (newM: string) => {
    setMm(newM);
    if (confirmToClose) return;
    applyHhmm(is12h ? segmentsToHhmm(hour12, newM, period) : `${hh}:${newM}`);
  };

  const setHour12Value = (newHour: string) => {
    setHour12(newHour);
    if (confirmToClose) return;
    applyHhmm(segmentsToHhmm(newHour, mm, period));
  };

  const setPeriodValue = (newPeriod: Time12Period) => {
    setPeriod(newPeriod);
    if (confirmToClose) return;
    applyHhmm(segmentsToHhmm(hour12, mm, newPeriod));
  };

  const handleConfirm = () => {
    commitValue(currentHhmm);
    if (!isSelfContained) {
      closePopover(formatOrgTime(currentHhmm, format));
    }
  };

  const handlePopoverOpenChange = (next: boolean) => {
    if (confirmToClose) {
      if (!next && !allowCloseRef.current) {
        return;
      }
      allowCloseRef.current = false;

      if (next) {
        const draft = draftFromValue(value ?? "");
        setHasValue(draft.hasValue);
        setHh(draft.hh);
        setMm(draft.mm);
        setHour12(draft.hour12);
        setPeriod(draft.period);
        setOpen(true);
        onOpenChange?.(true, committedDisplay);
        return;
      }

      setOpen(false);
      onOpenChange?.(false, committedDisplay);
      return;
    }

    setOpen(next);
    onOpenChange?.(next, displayValue);
  };

  const selectPortalProps = confirmToClose ? { disablePortal: true } : {};

  const pickerRow = is12h ? (
    <>
      <Select
        {...selectPortalProps}
        value={hourOptions12.includes(hour12) ? hour12 : "12"}
        onValueChange={setHour12Value}
        items={hourOptions12.map((h) => ({ value: h, label: h }))}
        className="w-[90px]"
      />
      <span className="text-muted-foreground">:</span>
      <Select
        {...selectPortalProps}
        value={minuteOptions.includes(mm) ? mm : "00"}
        onValueChange={setM}
        items={minuteOptions.map((m) => ({ value: m, label: m }))}
        className="w-[90px]"
      />
      <Select
        {...selectPortalProps}
        value={period}
        onValueChange={(next) =>
          setPeriodValue(String(next ?? "AM") as Time12Period)
        }
        items={periodOptions.map((p) => ({ value: p, label: p }))}
        className="w-[90px]"
      />
    </>
  ) : (
    <>
      <Select
        {...selectPortalProps}
        value={hourOptions24.includes(hh) ? hh : "00"}
        onValueChange={setH}
        items={hourOptions24.map((h) => ({ value: h, label: h }))}
        className="w-[90px]"
      />
      <span className="text-muted-foreground">:</span>
      <Select
        {...selectPortalProps}
        value={minuteOptions.includes(mm) ? mm : "00"}
        onValueChange={setM}
        items={minuteOptions.map((m) => ({ value: m, label: m }))}
        className="w-[90px]"
      />
    </>
  );

  return (
    <div
      className={cn("group flex items-center justify-between", {
        "pointer-events-none opacity-60": isDisabled,
      })}
    >
      <Popover.Root open={open} onOpenChange={handlePopoverOpenChange}>
        <Popover.Trigger
          type="button"
          disabled={isDisabled}
          aria-label={ariaLabel}
          className={cn(
            buttonVariants({ variant: "secondary", size: "md" }),
            "h-10 gap-2 font-normal",
          )}
        >
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className={displayValue ? "" : "text-muted-foreground"}>
            {displayValue || (is12h ? "--:-- --" : "--:--")}
          </span>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner
            align="start"
            className={dropdownPositionerClassName}
          >
            <Popover.Popup className="w-auto p-3">
              {confirmToClose ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">{pickerRow}</div>
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto w-1/4"
                    isLoading={updateMutation.isPending}
                    onClick={handleConfirm}
                  >
                    Confirm
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">{pickerRow}</div>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
};

export default InlineTimeSelect;
