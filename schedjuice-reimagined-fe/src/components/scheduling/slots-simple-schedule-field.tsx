"use client";

import { RecurringSlotsEditor } from "@/components/scheduling/intake/recurring-slots-editor";
import { SimpleSchedulePicker } from "@/components/scheduling/simple-schedule-picker";
import { getTimezoneOffset } from "@/helpers/timeslot";
import {
  canCollapseSlotsToSimple,
  createDefaultSimpleValue,
  orgUsesWdWeNomenclature,
  simpleValueToSlots,
  slotsToSimpleValue,
  type SimpleScheduleValue,
} from "@/helpers/simple-schedule";
import { useTenant } from "@/hooks/useTenant";
import type { RecurringSlot } from "@/types/intake";
import { useEffect, useMemo, useState } from "react";

export function SlotsSimpleScheduleField({
  slots,
  onChange,
  idPrefix = "slot",
  fieldMarks = "optional",
  showTimeFields = true,
  mode: controlledMode,
  onModeChange,
  sessionsLabel: sessionsLabelProp,
  overnightConfirmedByIndex,
  onOvernightConfirmedByIndexChange,
}: {
  slots: RecurringSlot[];
  onChange: (slots: RecurringSlot[]) => void;
  idPrefix?: string;
  fieldMarks?: "optional" | "required";
  /** When false, parent owns shared time fields (e.g. schedule edit composer). */
  showTimeFields?: boolean;
  mode?: "simple" | "custom";
  onModeChange?: (mode: "simple" | "custom") => void;
  sessionsLabel?: string;
  overnightConfirmedByIndex?: Record<number, boolean>;
  onOvernightConfirmedByIndexChange?: (next: Record<number, boolean>) => void;
}) {
  const { tenant } = useTenant();
  const useWdWe = orgUsesWdWeNomenclature(tenant?.is_wd_we_course_types_enabled);
  const [internalMode, setInternalMode] = useState<"simple" | "custom">(() =>
    canCollapseSlotsToSimple(slots, useWdWe) ? "simple" : "custom",
  );
  const mode = controlledMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  /**
   * When no weekdays are selected, `simpleValueToSlots` returns []. Parent state
   * then has no place to store times, so we keep a local draft for the picker UI.
   */
  const [draft, setDraft] = useState<SimpleScheduleValue | null>(null);

  const orgDefaults = useMemo(
    () => ({
      default_session_start_time: tenant?.default_session_start_time,
      default_session_duration_minutes: tenant?.default_session_duration_minutes,
    }),
    [tenant?.default_session_duration_minutes, tenant?.default_session_start_time],
  );

  useEffect(() => {
    if (slots.length > 0) setDraft(null);
  }, [slots]);

  const simpleValue: SimpleScheduleValue = useMemo(() => {
    if (!slots.length) {
      const defaults = createDefaultSimpleValue(orgDefaults);
      if (!draft) return defaults;
      return {
        ...defaults,
        weekdays: draft.weekdays,
        course_type: draft.course_type,
        time_from: draft.time_from || defaults.time_from,
        time_to: draft.time_to || defaults.time_to,
      };
    }
    const collapsed = slotsToSimpleValue(slots);
    if (collapsed) return collapsed;
    return createDefaultSimpleValue(orgDefaults);
  }, [draft, orgDefaults, slots]);

  const timezoneOffset = getTimezoneOffset(tenant?.timezone);
  const defaultSessionsLabel =
    tenant?.timezone && timezoneOffset
      ? `Sessions (${tenant.timezone}, ${timezoneOffset})`
      : "Sessions";
  const sessionsLabel = sessionsLabelProp ?? defaultSessionsLabel;

  return (
    <SimpleSchedulePicker
      value={simpleValue}
      onChange={(next) => {
        const nextSlots = simpleValueToSlots(next);
        if (nextSlots.length === 0) {
          setDraft(next);
        } else {
          setDraft(null);
        }
        onChange(nextSlots);
      }}
      useWdWeNomenclature={useWdWe}
      mode={mode}
      onModeChange={setMode}
      customSlotsForCollapse={slots}
      idPrefix={idPrefix}
      sessionsLabel={sessionsLabel}
      showTimeFields={showTimeFields}
      fieldMarks={fieldMarks}
      renderCustom={() => (
        <RecurringSlotsEditor
          idPrefix={idPrefix}
          slots={slots}
          onChange={onChange}
          overnightConfirmedByIndex={overnightConfirmedByIndex}
          onOvernightConfirmedByIndexChange={onOvernightConfirmedByIndexChange}
        />
      )}
    />
  );
}

/** Derive course_type from default slots when they match WD/WE exactly. */
export function courseTypeFromSlots(
  slots: RecurringSlot[],
): "WD" | "WE" | undefined {
  const simple = slotsToSimpleValue(slots);
  if (simple?.course_type === "WD" || simple?.course_type === "WE") {
    return simple.course_type;
  }
  return undefined;
}
