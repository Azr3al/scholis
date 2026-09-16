"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { searchEntities } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import FileDragAndDrop, { extendedFileType } from "@/components/form/file-drag-and-drop";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { Button, Separator } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import {
  BatchScreenshotPartRow,
  type BatchScreenshotPart,
} from "@/components/finances/payment-upload/batch-screenshot-part-row";
import { useScreenshotPartOcr } from "@/components/finances/payment-upload/use-screenshot-part-ocr";
import { getCourseStudentFilterParams } from "@/helpers/course";
import {
  getActiveCourseFilterParams,
  getCalendarMonthUtcFilterBounds,
  getCourseMonthType,
} from "@/helpers/date";
import { useUser } from "@/hooks/useUser";
import { submitBatchScreenshots } from "@/lib/finances/batch-screenshot-submit";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

function createEmptyPart(file: File, previewUrl: string): BatchScreenshotPart {
  return {
    key: uuid(),
    file,
    previewUrl,
    studentId: "",
    paymentMethodId: "",
    transactionId: "",
    parsedAmount: "",
    dateOnScreenshot: "",
    description: "",
    remarks: "",
    duplicateWarningId: null,
    studentMatchKind: "none",
    studentMatchCandidates: [],
  };
}

const ScreenshotCreatePage = () => {
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<extendedFileType[]>([]);
  const [parts, setParts] = useState<BatchScreenshotPart[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();
  const { user } = useUser();
  const [courseId, setCourseId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState<Date>(new Date());
  const [selectedCourse, setSelectedCourse] = useState<{ start_date?: string } | null>(
    null,
  );
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const { runOcr, stateByKey, hasLoading } = useScreenshotPartOcr();
  const router = useRouter();

  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">
            Batch screenshot upload
          </h1>
        ),
      }),
      [],
    ),
  );

  const getCourseStudent = useQuery({
    enabled: courseId !== undefined,
    queryKey: ["getCourseStudents", courseId],
    queryFn: () =>
      searchEntities(
        "users",
        { size: -1, fields: ["name", "id"], sorts: ["name"] },
        {
          filter_params: getCourseStudentFilterParams(courseId!).filter_params,
        },
      ),
  });

  const studentOptions = useMemo(
    () =>
      (getCourseStudent.data?.data?.data ?? [])
        .filter((s: { id?: unknown; name?: string | null }) => s?.id != null)
        .map((s: { id: number | string; name?: string | null }) => ({
          value: String(s.id),
          label: s.name?.trim() || `User ${s.id}`,
        })),
    [getCourseStudent.data],
  );

  useEffect(() => {
    if (getCourseStudent.isError) {
      toast.add({
        description: "Could not load students for this course.",
      });
    }
  }, [getCourseStudent.isError, toast]);

  const revokeAllPreviewUrls = useCallback(() => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      revokeAllPreviewUrls();
    };
  }, [revokeAllPreviewUrls]);

  const resetBatch = useCallback(() => {
    revokeAllPreviewUrls();
    setFiles([]);
    setParts([]);
  }, [revokeAllPreviewUrls]);

  const handleCourseChange = (nextCourseId: string | undefined) => {
    if (parts.length > 0) {
      const confirmed = window.confirm(
        "Changing course clears uploaded screenshots and entered data.",
      );
      if (!confirmed) return;
      resetBatch();
    }
    setCourseId(nextCourseId);
  };

  const updatePart = useCallback(
    (key: string, patch: Partial<BatchScreenshotPart>) => {
      setParts((prev) =>
        prev.map((part) => (part.key === key ? { ...part, ...patch } : part)),
      );
    },
    [],
  );

  const runOcrForPart = useCallback(
    async (part: BatchScreenshotPart, file: File) => {
      if (!courseId) return;
      const data = await runOcr(part.key, file, { courseId });
      if (!data) return;
      updatePart(part.key, {
        transactionId: data.transactionId,
        parsedAmount: data.parsedAmount,
        paymentMethodId: data.suggestedPaymentMethodId,
        dateOnScreenshot: data.dateOnScreenshot,
        description: data.notesText,
        ocrEventId: data.ocrEventId || undefined,
        duplicateWarningId: data.duplicateWarningId,
        studentId:
          data.studentMatchKind === "auto" ? data.suggestedStudentId : "",
        studentMatchKind: data.studentMatchKind,
        studentMatchCandidates: data.studentMatchCandidates,
      });
    },
    [courseId, runOcr, updatePart],
  );

  const onSubmit = async () => {
    if (!courseId || parts.length === 0) return;
    if (parts.some((part) => !part.studentId)) {
      toast.add({
        description: "Please attach a student to all screenshots.",
      });
      return;
    }
    if (hasLoading) return;

    setIsSubmitting(true);
    const issuedBounds = getCalendarMonthUtcFilterBounds(date);
    try {
      const result = await submitBatchScreenshots(
        parts.map((part) => ({
          file: part.file,
          studentId: part.studentId,
          courseId,
          issuedAtIso: issuedBounds.start.toISOString(),
          transactionId: part.transactionId,
          parsedAmount: part.parsedAmount,
          paymentMethodId: part.paymentMethodId,
          dateOnScreenshot: part.dateOnScreenshot,
          description: part.description,
          remarks: part.remarks,
          ocrEventId: part.ocrEventId,
          createdById: user?.id ? String(user.id) : undefined,
        })),
      );

      if (result.failed.length === 0) {
        toast.add({
          description: `${result.succeeded} payments recorded`,
        });
        router.push("/finances/student-payments");
      } else {
        toast.add({
          type: "error",
          description: `${result.succeeded}/${parts.length} succeeded. Row ${result.failed[0].index + 1}: ${result.failed[0].message}`,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer width="narrow" className="space-y-6">
      <div className="flex flex-col gap-4">
        <YearMonthSelector
          label="Select a month"
          date={date}
          setDate={setDate}
          monthType={
            selectedCourse?.start_date
              ? getCourseMonthType(selectedCourse.start_date)
              : null
          }
        />
        <EntityCombobox
          filterParams={{
            filter_params: [...getActiveCourseFilterParams()],
          }}
          queryParams={{ fields: ["title", "id", "start_date"], sorts: ["title"] }}
          displayFunction={(e) => e.title}
          entity="courses"
          value={courseId}
          onChange={handleCourseChange}
          label="Select a course"
          onSelectedEntityChange={setSelectedCourse}
        />
      </div>

      {!courseId ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-text-muted">
          Select a course above to upload screenshots and enable auto-fill.
        </p>
      ) : null}

      <FileDragAndDrop
        label="Upload screenshots"
        files={files}
        disabled={!courseId}
        setFiles={(newFiles) => {
          const existingByFileId = new Map<string, BatchScreenshotPart>();
          files.forEach((f, index) => {
            if ("file" in f && parts[index]) {
              existingByFileId.set(f.id, parts[index]);
            }
          });

          const keptFileIds = new Set(newFiles.map((f) => f.id));
          files.forEach((f, index) => {
            if ("file" in f && !keptFileIds.has(f.id) && parts[index]) {
              URL.revokeObjectURL(parts[index].previewUrl);
              previewUrlsRef.current.delete(parts[index].previewUrl);
            }
          });

          const nextParts: BatchScreenshotPart[] = [];
          const addedParts: BatchScreenshotPart[] = [];

          newFiles.forEach((f) => {
            if (!("file" in f)) return;
            const existing = existingByFileId.get(f.id);
            if (existing) {
              nextParts.push(existing);
              return;
            }
            const previewUrl = URL.createObjectURL(f.file);
            previewUrlsRef.current.add(previewUrl);
            const part = createEmptyPart(f.file, previewUrl);
            nextParts.push(part);
            addedParts.push(part);
          });

          setFiles(newFiles);
          setParts(nextParts);
          addedParts.forEach((part) => {
            void runOcrForPart(part, part.file);
          });
        }}
        maxFiles={999}
        showCarousel={false}
      />

      <div>
        {parts.map((part, index) => (
          <div key={part.key}>
            {index > 0 ? <Separator className="my-1" /> : null}
            <BatchScreenshotPartRow
              part={part}
              ocrState={stateByKey[part.key] ?? {
                status: "idle",
                message: null,
                duplicatePaymentId: null,
              }}
              studentOptions={studentOptions}
              rosterLoading={Boolean(courseId && getCourseStudent.isLoading)}
              onPreviewClick={() => setViewImageUrl(part.previewUrl)}
              onStudentChange={(studentId) => updatePart(part.key, { studentId })}
              onPaymentMethodChange={(paymentMethodId) =>
                updatePart(part.key, { paymentMethodId })
              }
              onTransactionIdChange={(transactionId) =>
                updatePart(part.key, { transactionId })
              }
              onParsedAmountChange={(parsedAmount) =>
                updatePart(part.key, { parsedAmount })
              }
              onDescriptionChange={(description) =>
                updatePart(part.key, { description })
              }
              onRemarksChange={(remarks) => updatePart(part.key, { remarks })}
              onDateOnScreenshotChange={(dateOnScreenshot) =>
                updatePart(part.key, { dateOnScreenshot })
              }
            />
          </div>
        ))}
      </div>

      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Screenshot"
        onClose={() => setViewImageUrl(null)}
      />

      <Button
        className="w-full sm:w-auto"
        disabled={
          !courseId || !date || parts.length === 0 || hasLoading || isSubmitting
        }
        isLoading={isSubmitting}
        onClick={() => void onSubmit()}
      >
        Submit for scanning
      </Button>
    </PageContainer>
  );
};

export default ScreenshotCreatePage;
