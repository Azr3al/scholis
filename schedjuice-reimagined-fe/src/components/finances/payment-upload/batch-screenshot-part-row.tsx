"use client";

import Image from "next/image";

import EntityCombobox from "@/components/form/entity-combobox";
import { formatPaymentMethodDisplayName } from "@/helpers/payment-method-display";
import {
  EntityComboboxList,
  type EntityComboboxOption,
} from "@/components/form/entity-combobox-list";
import { Field, Input } from "@/components/primitives";
import {
  OCR_FIELD_EXTRACTING_MESSAGE,
  type OcrStudentMatchCandidate,
} from "@/lib/finances/ocr-payment-screenshot";
import { uploadPartFieldRootClassName } from "@/lib/finances/upload-form-layout";
import type { ScreenshotPartOcrState } from "@/components/finances/payment-upload/use-screenshot-part-ocr";

export type BatchScreenshotPart = {
  key: string;
  file: File;
  previewUrl: string;
  studentId: string;
  paymentMethodId: string;
  transactionId: string;
  parsedAmount: string;
  dateOnScreenshot: string;
  description: string;
  remarks: string;
  ocrEventId?: string;
  duplicateWarningId: number | null;
  studentMatchKind: "auto" | "candidates" | "none";
  studentMatchCandidates: OcrStudentMatchCandidate[];
};

type BatchScreenshotPartRowProps = {
  part: BatchScreenshotPart;
  ocrState: ScreenshotPartOcrState;
  studentOptions: EntityComboboxOption[];
  rosterLoading: boolean;
  onPreviewClick: () => void;
  onStudentChange: (studentId: string) => void;
  onPaymentMethodChange: (paymentMethodId: string) => void;
  onTransactionIdChange: (value: string) => void;
  onParsedAmountChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onDateOnScreenshotChange: (value: string) => void;
};

export function BatchScreenshotPartRow({
  part,
  ocrState,
  studentOptions,
  rosterLoading,
  onPreviewClick,
  onStudentChange,
  onPaymentMethodChange,
  onTransactionIdChange,
  onParsedAmountChange,
  onDescriptionChange,
  onRemarksChange,
  onDateOnScreenshotChange,
}: BatchScreenshotPartRowProps) {
  const ocrLoading = ocrState.status === "loading";
  const fieldsDisabled = ocrLoading;
  const fieldRootClassName = uploadPartFieldRootClassName();

  return (
    <div className="flex gap-5 items-start py-4">
      <Image
        onClick={onPreviewClick}
        className="object-cover cursor-pointer shrink-0"
        width={200}
        height={300}
        alt="screenshot"
        src={part.previewUrl}
      />
      <div className="flex w-full min-w-0 flex-col gap-3">
        {ocrState.status === "error" ? (
          <p className="text-sm text-text-muted" role="status">
            {ocrState.message}
          </p>
        ) : null}
        {part.duplicateWarningId ? (
          <p className="text-sm text-warning-foreground" role="status">
            This transaction may already be saved as payment #{part.duplicateWarningId}.
          </p>
        ) : null}

        <Field.Root className={fieldRootClassName}>
          <Field.Label>Student name</Field.Label>
          <EntityComboboxList
            value={part.studentId || undefined}
            setValue={onStudentChange}
            isLoading={rosterLoading}
            options={studentOptions}
            label="Student name"
            triggerAriaLabel="Student name"
            triggerClassName="w-full min-w-0"
            disabled={fieldsDisabled}
            loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
            loadingPlaceholderActive={ocrLoading}
          />
        </Field.Root>

        {part.studentMatchKind === "candidates" &&
        part.studentMatchCandidates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {part.studentMatchCandidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
                onClick={() => onStudentChange(String(candidate.id))}
              >
                {candidate.name} ({Math.round(candidate.score)}%)
              </button>
            ))}
          </div>
        ) : null}

        <Field.Root className={fieldRootClassName}>
          <Field.Label>Payment method</Field.Label>
          <EntityCombobox
            queryParams={{
              fields: ["name", "id", "is_retired"],
              sorts: ["name"],
            }}
            label="Payment method"
            hideLabel
            containerClassName="w-full min-w-0"
            displayFunction={(e) => formatPaymentMethodDisplayName(e)}
            entity="payment-methods"
            value={part.paymentMethodId || undefined}
            onChange={onPaymentMethodChange}
            disabled={fieldsDisabled}
            loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
            loadingPlaceholderActive={ocrLoading}
          />
        </Field.Root>

        <Field.Root className={fieldRootClassName}>
          <Field.Label>Transaction ID</Field.Label>
          <Input
            placeholder="Optional"
            value={part.transactionId}
            onChange={(e) => onTransactionIdChange(e.target.value)}
            disabled={fieldsDisabled}
            loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
            loadingPlaceholderActive={ocrLoading}
            className="h-9 w-full min-w-0"
          />
        </Field.Root>

        <Field.Root className={fieldRootClassName}>
          <Field.Label>Amount</Field.Label>
          <div className="relative w-full">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Required"
              value={part.parsedAmount}
              onChange={(e) => onParsedAmountChange(e.target.value)}
              className="h-9 w-full min-w-0 pr-14"
              disabled={fieldsDisabled}
              loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
              loadingPlaceholderActive={ocrLoading}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
              MMK
            </span>
          </div>
        </Field.Root>

        <Field.Root className={fieldRootClassName}>
          <Field.Label>Description</Field.Label>
          <Input
            placeholder="Optional"
            value={part.description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={fieldsDisabled}
            loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
            loadingPlaceholderActive={ocrLoading}
            className="h-9 w-full min-w-0"
          />
        </Field.Root>

        <Field.Root className={fieldRootClassName}>
          <Field.Label>Remarks</Field.Label>
          <Input
            placeholder="Optional"
            value={part.remarks}
            onChange={(e) => onRemarksChange(e.target.value)}
            className="h-9 w-full min-w-0"
          />
        </Field.Root>

        <Field.Root className={fieldRootClassName}>
          <Field.Label>Date on screenshot</Field.Label>
          <Input
            placeholder="Optional"
            value={part.dateOnScreenshot}
            onChange={(e) => onDateOnScreenshotChange(e.target.value)}
            disabled={fieldsDisabled}
            loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
            loadingPlaceholderActive={ocrLoading}
            className="h-9 w-full min-w-0"
          />
        </Field.Root>
      </div>
    </div>
  );
}
