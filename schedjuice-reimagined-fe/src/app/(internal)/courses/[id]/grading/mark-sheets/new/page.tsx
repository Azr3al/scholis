"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { DatePicker } from "@/components/date/date-picker";
import { OptionalMark, RequiredMark } from "@/components/form/required-mark";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { PageContainer } from "@/components/layout/page-container";
import { MarkSheetImportWizard } from "@/components/mark-sheets/mark-sheet-import-wizard";
import {
  Button,
  Field,
  Select,
  Skeleton,
  useToast,
} from "@/components/primitives";
import { InlineEntityTitle } from "@/components/record/inline/inline-entity-title";
import { markSheetNewStickyChromeClassName } from "@/lib/layout/entity-title-chrome";
import { createMarkSheet, listRubrics } from "@/lib/mark-sheets-api";
import { crossfade, crossfadeInstant } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

type CreateMarkSheetPayload = {
  rubricId: number;
  title: string;
  year: number;
  month: number;
  examDate: string | null;
};

export default function NewMarkSheetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const [creatingNew, setCreatingNew] = useState(false);
  const [title, setTitle] = useState("");
  const [rubricTitle, setRubricTitle] = useState("");
  const [existingRubricIdFromWizard, setExistingRubricIdFromWizard] = useState<
    number | null
  >(null);
  const [rubricId, setRubricId] = useState<string>("");
  const [yearMonthDate, setYearMonthDate] = useState(() => new Date());
  const [examDate, setExamDate] = useState<Date | undefined>();

  const rubricsQuery = useQuery({
    queryKey: ["rubrics", id],
    queryFn: () => listRubrics(id),
  });

  const yearMonth = useMemo(
    () => ({
      year: yearMonthDate.getFullYear(),
      month: yearMonthDate.getMonth() + 1,
    }),
    [yearMonthDate],
  );

  const rubricItems = useMemo(
    () =>
      (rubricsQuery.data ?? []).map((rubric) => ({
        value: String(rubric.id),
        label: rubric.title,
      })),
    [rubricsQuery.data],
  );

  const rubricCount = rubricsQuery.data?.length ?? 0;
  const autoImportMode = !rubricsQuery.isLoading && rubricCount === 0;
  const isImportMode = creatingNew || autoImportMode;

  const selectedRubric = useMemo(
    () => rubricsQuery.data?.find((r) => String(r.id) === rubricId),
    [rubricsQuery.data, rubricId],
  );

  const resolvedTitle = title.trim() || selectedRubric?.title || "";
  const examDateIso = examDate ? format(examDate, "yyyy-MM-dd") : null;

  const createMutation = useMutation({
    mutationFn: (payload: CreateMarkSheetPayload) =>
      createMarkSheet(id, {
        rubric_id: payload.rubricId,
        title: payload.title,
        year: payload.year,
        month: payload.month,
        exam_date: payload.examDate,
      }),
    onSuccess: (sheet) => {
      queryClient.invalidateQueries({ queryKey: ["mark-sheets", id] });
      router.push(`/courses/${id}/grading/mark-sheets/${sheet.id}`);
    },
    onError: () => {
      setRubricId("");
      toast.add({
        type: "error",
        description: "Could not create mark sheet. Check your inputs and try again.",
      });
    },
  });

  const handleRubricSelect = useCallback(
    (value: string | null) => {
      if (isImportMode || createMutation.isPending) {
        return;
      }

      const nextRubricId = value ?? "";
      setRubricId(nextRubricId);

      if (!nextRubricId) {
        return;
      }

      const rubric = rubricsQuery.data?.find((r) => String(r.id) === nextRubricId);
      const sheetTitle = title.trim() || rubric?.title || "";

      if (!sheetTitle) {
        toast.add({ description: "Enter a title for this mark sheet." });
        return;
      }

      createMutation.mutate({
        rubricId: Number(nextRubricId),
        title: sheetTitle,
        year: yearMonth.year,
        month: yearMonth.month,
        examDate: examDateIso,
      });
    },
    [
      isImportMode,
      createMutation,
      rubricsQuery.data,
      title,
      yearMonth.year,
      yearMonth.month,
      examDateIso,
      toast,
    ],
  );

  function handleCancelImport() {
    if (autoImportMode && !creatingNew) {
      router.push(`/courses/${id}/grading/mark-sheets`);
      return;
    }
    toggleCreatingNew();
  }

  function toggleCreatingNew() {
    setCreatingNew((current) => {
      const next = !current;
      if (next) {
        setRubricTitle("");
        setExistingRubricIdFromWizard(null);
        setRubricId("");
      }
      return next;
    });
  }

  const motionVariants = reducedMotion ? crossfadeInstant : crossfade;

  return (
    <PageContainer
      width="full"
      className={cn(
        "space-y-4",
        isImportMode && "flex min-h-0 flex-1 flex-col",
      )}
    >
      <div className={markSheetNewStickyChromeClassName()}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
          <Field.Root className="min-w-0 gap-1">
            <Field.Label>
              Title
              <RequiredMark />
            </Field.Label>
            <InlineEntityTitle
              value={title}
              onChange={setTitle}
              placeholder="Untitled Project"
              aria-label="Mark sheet title"
              className="w-full min-w-0 max-w-none"
              inputClassName="w-full min-w-0 max-w-none"
              displayClassName="text-xl lg:text-2xl"
            />
          </Field.Root>

          <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-6 lg:gap-6">
            <Field.Root className="shrink-0">
              <Field.Label>
                Reporting month
                <RequiredMark />
              </Field.Label>
              <YearMonthSelector
                date={yearMonthDate}
                setDate={setYearMonthDate}
              />
            </Field.Root>

            <Field.Root className="shrink-0 sm:min-w-44">
              <Field.Label>
                Exam date
                <OptionalMark />
              </Field.Label>
              <DatePicker
                date={examDate}
                setDate={setExamDate}
                size="default"
                className="w-full sm:w-auto"
              />
            </Field.Root>
          </div>
        </div>
      </div>

      <motion.div
        variants={motionVariants}
        initial="initial"
        animate="animate"
        className={cn("space-y-4", isImportMode && "flex min-h-0 flex-1 flex-col")}
      >
        <Field.Root>
          <Field.Label>
            Rubric
            <RequiredMark />
          </Field.Label>
          <div className="flex w-fit max-w-md flex-wrap items-center gap-2">
            {rubricsQuery.isLoading ? (
              <Skeleton className="h-10 w-64 rounded-md" aria-busy />
            ) : isImportMode ? (
              existingRubricIdFromWizard != null ? (
                <span className="min-w-0 truncate font-serif text-2xl text-text-primary">
                  {rubricTitle || "untitled rubric"}
                </span>
              ) : (
                <InlineEntityTitle
                  value={rubricTitle}
                  onChange={setRubricTitle}
                  placeholder="untitled rubric"
                  aria-label="New rubric title"
                  className="max-w-md"
                  inputClassName="max-w-md"
                />
              )
            ) : (
              <Select
                items={rubricItems}
                value={rubricId}
                onValueChange={handleRubricSelect}
                placeholder="Select a rubric"
                className="w-64"
                disabled={createMutation.isPending}
              />
            )}
            {!autoImportMode ? (
              <Button
                type="button"
                variant={isImportMode ? "secondary" : "ghost"}
                onClick={isImportMode ? handleCancelImport : toggleCreatingNew}
                className="shrink-0"
                disabled={createMutation.isPending}
              >
                {isImportMode ? "Cancel" : "Create new"}
              </Button>
            ) : null}
          </div>
        </Field.Root>

        <div
          className={cn(
            isImportMode &&
              "flex min-h-[calc(100dvh-18rem)] flex-1 flex-col",
          )}
        >
          <AnimatePresence mode="wait">
            {isImportMode ? (
              <motion.div
                key="import-wizard"
                variants={motionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex min-h-0 flex-1 flex-col"
              >
                <MarkSheetImportWizard
                  courseId={id}
                  title={resolvedTitle}
                  rubricTitle={rubricTitle}
                  onRubricTitleChange={setRubricTitle}
                  onExistingRubricChange={setExistingRubricIdFromWizard}
                  year={yearMonth.year}
                  month={yearMonth.month}
                  examDate={examDateIso}
                  onComplete={(sheetId) =>
                    router.push(`/courses/${id}/grading/mark-sheets/${sheetId}`)
                  }
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </PageContainer>
  );
}
