"use client";

import {
  applyConsultationLwtpPreset,
  fetchConsultationWhitelist,
  patchConsultationWhitelist,
} from "@/app/client-api/consultation";
import { consultationBookingLinkQueryKey } from "@/components/consultation/booking-link-card";
import { CustomWhitelistSchedule } from "@/components/consultation/custom-whitelist-schedule";
import { SimpleWhitelistSchedule } from "@/components/consultation/simple-whitelist-schedule";
import { Button, Skeleton, useToast } from "@/components/primitives";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import {
  canCollapseWhitelistSchedule,
  normalizeWhitelistSchedule,
  scheduleToSimpleValue,
  simpleValueToSchedule,
  validateWhitelistSchedule,
  type WhitelistScheduleValidationError,
} from "@/lib/consultation/whitelist-schedule";
import {
  crossfade,
  crossfadeInstant,
  crossfadeOpacity,
  revealBar,
} from "@/lib/sj/motion";
import {
  type ConsultationDaySchedule,
  type ConsultationWeekdayKey,
  type ConsultationWhitelist,
} from "@/types/consultation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

export const consultationWhitelistQueryKey = ["consultation", "whitelist"] as const;

type EditorMode = "simple" | "custom";

function resolveInitialMode(
  schedule: Record<ConsultationWeekdayKey, ConsultationDaySchedule>,
): EditorMode {
  return canCollapseWhitelistSchedule(schedule) ? "simple" : "custom";
}

export function WhitelistEditor({ readOnly = false }: { readOnly?: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const loadingVariants = reducedMotion ? crossfadeInstant : crossfadeOpacity;
  const modeVariants = reducedMotion ? crossfadeInstant : crossfade;
  const saveBarVariants = reducedMotion ? crossfadeInstant : revealBar;

  const [draft, setDraft] = useState<Record<
    ConsultationWeekdayKey,
    ConsultationDaySchedule
  > | null>(null);
  const [mode, setMode] = useState<EditorMode>("simple");
  const [dirty, setDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    WhitelistScheduleValidationError[]
  >([]);

  const whitelistQuery = useQuery({
    queryKey: consultationWhitelistQueryKey,
    queryFn: fetchConsultationWhitelist,
  });

  useEffect(() => {
    if (whitelistQuery.data && !dirty) {
      const normalized = normalizeWhitelistSchedule(whitelistQuery.data.schedule);
      setDraft(normalized);
      setMode(resolveInitialMode(normalized));
      setValidationErrors([]);
    }
  }, [whitelistQuery.data, dirty]);

  const simpleValue = useMemo(() => {
    if (!draft) {
      return scheduleToSimpleValue(normalizeWhitelistSchedule(undefined))!;
    }
    return scheduleToSimpleValue(draft)!;
  }, [draft]);

  const saveMutation = useMutation({
    mutationFn: (schedule: ConsultationWhitelist["schedule"]) =>
      patchConsultationWhitelist(schedule),
    onSuccess: () => {
      toast.add({ title: "Weekly schedule saved" });
      setDirty(false);
      setValidationErrors([]);
      void queryClient.invalidateQueries({
        queryKey: consultationWhitelistQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: consultationBookingLinkQueryKey,
      });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not save schedule",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const presetMutation = useMutation({
    mutationFn: applyConsultationLwtpPreset,
    onSuccess: (data) => {
      toast.add({ title: "Default schedule applied" });
      const normalized = normalizeWhitelistSchedule(data.schedule);
      setDraft(normalized);
      setMode("simple");
      setDirty(false);
      setValidationErrors([]);
      void queryClient.invalidateQueries({
        queryKey: consultationWhitelistQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: consultationBookingLinkQueryKey,
      });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not apply default schedule",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const isBusy =
    whitelistQuery.isLoading ||
    saveMutation.isLoading ||
    presetMutation.isLoading;

  const isLoading = whitelistQuery.isLoading || !draft;

  function updateDay(
    day: ConsultationWeekdayKey,
    updater: (current: ConsultationDaySchedule) => ConsultationDaySchedule,
  ) {
    if (readOnly || !draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [day]: updater(prev[day]) };
    });
    setDirty(true);
    setValidationErrors([]);
  }

  function handleSimpleChange(next: Parameters<typeof simpleValueToSchedule>[0]) {
    if (readOnly) return;
    setDraft(simpleValueToSchedule(next));
    setDirty(true);
    setValidationErrors([]);
  }

  function handleSave() {
    if (!draft) return;
    const errors = validateWhitelistSchedule(draft);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setMode("custom");
      toast.add({
        type: "error",
        title: "Fix schedule times before saving",
        description: errors[0]?.message,
      });
      return;
    }
    saveMutation.mutate(draft);
  }

  function handleBackToSimple() {
    if (!draft || !canCollapseWhitelistSchedule(draft)) return;
    setMode("simple");
    setValidationErrors([]);
  }

  const helperText =
    mode === "simple"
      ? "Pick the days and hours students can book. Times use your school timezone."
      : "Set different hours for each day if needed. Times use your school timezone.";

  const canReturnToSimple = draft ? canCollapseWhitelistSchedule(draft) : false;

  return (
    <div className="min-h-48" aria-busy={isBusy}>
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.div
            key="whitelist-loading"
            variants={loadingVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Skeleton className="h-48 w-full" aria-busy="true" />
          </motion.div>
        ) : (
          <motion.div
            key="whitelist-loaded"
            className="flex flex-col gap-4"
            variants={loadingVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{helperText}</p>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isBusy}
                  isLoading={presetMutation.isLoading}
                  onClick={() => presetMutation.mutate()}
                >
                  Apply default schedule
                </Button>
              ) : null}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                variants={modeVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {mode === "simple" ? (
                  <SimpleWhitelistSchedule
                    value={simpleValue}
                    isBusy={isBusy}
                    readOnly={readOnly}
                    onChange={handleSimpleChange}
                    onCustomizeByDay={() => setMode("custom")}
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    <CustomWhitelistSchedule
                      draft={draft}
                      readOnly={readOnly}
                      isBusy={isBusy}
                      validationErrors={validationErrors}
                      onUpdateDay={updateDay}
                    />
                    {!readOnly && canReturnToSimple ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        disabled={isBusy}
                        onClick={handleBackToSimple}
                      >
                        Back to simple
                      </Button>
                    ) : null}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {!readOnly && dirty ? (
                <motion.div
                  key="whitelist-save-bar"
                  variants={saveBarVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="overflow-hidden motion-reduce:transition-none"
                >
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={isBusy}
                      isLoading={saveMutation.isLoading}
                      onClick={handleSave}
                    >
                      Save schedule
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
