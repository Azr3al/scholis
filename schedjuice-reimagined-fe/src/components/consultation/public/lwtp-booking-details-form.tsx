"use client";

import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { EXAM_SESSION_YEARS_AHEAD } from "@/components/form/selectors/year-selector";
import { Button, Checkbox, Field, Input, Radio, RadioGroup, Select } from "@/components/primitives";
import { formatDate, formatSessionClock } from "@/helpers/date";
import {
  buildLwtpBookingDetails,
  CLASS_PREFERENCE_OPTIONS,
  DEFAULT_PHONE_DIAL_CODE,
  validateLwtpBookingForm,
  type LwtpBookingDetailsPayload,
  type LwtpBookingFormValues,
} from "@/lib/consultation/lwtp-booking-fields";
import type {
  ConsultationAvailabilitySlot,
  ConsultationPublicBookingOptions,
} from "@/types/consultation";
import { EXAM_BOARD_OPTIONS } from "@/types/course";
import { useMemo, useState } from "react";

type LwtpBookingDetailsFormProps = {
  selectedDate: Date;
  selectedSlot: ConsultationAvailabilitySlot;
  bookingOptions: ConsultationPublicBookingOptions;
  onSubmit: (values: {
    student_name: string;
    student_email: string;
    details: LwtpBookingDetailsPayload;
  }) => void;
  isSubmitting: boolean;
  errorMessage: string | null;
};

export function LwtpBookingDetailsForm({
  selectedDate,
  selectedSlot,
  bookingOptions,
  onSubmit,
  isSubmitting,
  errorMessage,
}: LwtpBookingDetailsFormProps) {
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [myanmarName, setMyanmarName] = useState("");
  const [classPreference, setClassPreference] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState(DEFAULT_PHONE_DIAL_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [examTargetDate, setExamTargetDate] = useState<Date | undefined>();
  const [examBoard, setExamBoard] = useState("");
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [subjectOtherChecked, setSubjectOtherChecked] = useState(false);
  const [subjectOther, setSubjectOther] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const dateLabel = formatDate(selectedDate, "EEEE, MMMM d, yyyy");
  const timeLabel = formatSessionClock(selectedSlot.slot_time);

  const boardOptions = useMemo(() => {
    if (bookingOptions.exam_boards.length > 0) {
      return bookingOptions.exam_boards;
    }
    return [...EXAM_BOARD_OPTIONS];
  }, [bookingOptions.exam_boards]);

  const subjectsForBoard = useMemo(() => {
    if (!examBoard) return [];
    return bookingOptions.subjects_by_board[examBoard] ?? [];
  }, [bookingOptions.subjects_by_board, examBoard]);

  function handleExamBoardChange(nextBoard: string) {
    setExamBoard(nextBoard);
    setSubjectIds([]);
    setSubjectOtherChecked(false);
    setSubjectOther("");
  }

  function toggleSubject(subjectId: number, checked: boolean) {
    setSubjectIds((current) => {
      if (checked) {
        return current.includes(subjectId) ? current : [...current, subjectId];
      }
      return current.filter((id) => id !== subjectId);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const formValues: LwtpBookingFormValues = {
      student_name: studentName,
      student_email: studentEmail,
      myanmar_name: myanmarName,
      class_preference: classPreference,
      phoneDialCode,
      phoneNumber,
      telegram_username: telegramUsername,
      examTargetDate,
      exam_board: examBoard,
      subjectIds,
      subjectOtherChecked,
      subject_other: subjectOther,
    };

    const validationError = validateLwtpBookingForm(formValues);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    onSubmit({
      student_name: studentName.trim(),
      student_email: studentEmail.trim(),
      details: buildLwtpBookingDetails(formValues),
    });
  }

  const displayError = localError ?? errorMessage;

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm">
        <p className="font-medium text-text-primary">{dateLabel}</p>
        <p className="text-text-secondary">{timeLabel}</p>
      </div>

      <Field.Root name="student_name">
        <Field.Label>Name</Field.Label>
        <Input
          value={studentName}
          onChange={(event) => setStudentName(event.target.value)}
          autoComplete="name"
          disabled={isSubmitting}
          required
        />
      </Field.Root>

      <Field.Root name="student_email">
        <Field.Label>Email</Field.Label>
        <Input
          type="email"
          value={studentEmail}
          onChange={(event) => setStudentEmail(event.target.value)}
          autoComplete="email"
          disabled={isSubmitting}
          required
        />
        <Field.Description>
          Used for your meeting invite and cancellation link.
        </Field.Description>
      </Field.Root>

      <Field.Root name="myanmar_name">
        <Field.Label>Myanmar name</Field.Label>
        <Input
          value={myanmarName}
          onChange={(event) => setMyanmarName(event.target.value)}
          disabled={isSubmitting}
          required
        />
      </Field.Root>

      <Field.Root name="class_preference">
        <Field.Label>Premium one on one special class or group class?</Field.Label>
        <Select
          items={CLASS_PREFERENCE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={classPreference}
          onValueChange={setClassPreference}
          disabled={isSubmitting}
          fullWidth
        />
      </Field.Root>

      <Field.Root name="phone">
        <Field.Label>Phone</Field.Label>
        <div className="flex gap-2">
          <Input
            value={phoneDialCode}
            onChange={(event) => setPhoneDialCode(event.target.value)}
            disabled={isSubmitting}
            className="w-24 shrink-0"
            aria-label="Country code"
          />
          <Input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            disabled={isSubmitting}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="9xxxxxxxx"
            className="min-w-0 flex-1"
          />
        </div>
      </Field.Root>

      <Field.Root name="telegram_username">
        <Field.Label>Telegram username</Field.Label>
        <Input
          value={telegramUsername}
          onChange={(event) => setTelegramUsername(event.target.value)}
          disabled={isSubmitting}
          placeholder="@username"
        />
      </Field.Root>

      <Field.Root name="exam_target">
        <Field.Label>Exam target</Field.Label>
        <Field.Description>Target exam month and year.</Field.Description>
        <YearMonthSelector
          date={examTargetDate}
          setDate={setExamTargetDate}
          yearsAhead={EXAM_SESSION_YEARS_AHEAD}
          fullWidth
          label=""
        />
      </Field.Root>

      <Field.Root name="exam_board">
        <Field.Label>CIE or Edexcel</Field.Label>
        <RadioGroup
          value={examBoard}
          onValueChange={handleExamBoardChange}
          className="flex flex-col gap-2"
        >
          {boardOptions.map((board) => (
            <label key={board} className="flex cursor-pointer items-center gap-2 text-sm">
              <Radio value={board} disabled={isSubmitting} />
              <span>{board}</span>
            </label>
          ))}
        </RadioGroup>
      </Field.Root>

      {examBoard ? (
        <Field.Root name="subjects">
          <Field.Label>Subjects</Field.Label>
          <div className="w-full space-y-2">
            {subjectsForBoard.map((subject) => {
              const checked = subjectIds.includes(subject.id);
              return (
                <label
                  key={subject.id}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => toggleSubject(subject.id, Boolean(value))}
                    disabled={isSubmitting}
                    className="mt-0.5"
                  />
                  <span>{subject.name}</span>
                </label>
              );
            })}
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={subjectOtherChecked}
                onCheckedChange={(value) => {
                  const checked = Boolean(value);
                  setSubjectOtherChecked(checked);
                  if (!checked) {
                    setSubjectOther("");
                  }
                }}
                disabled={isSubmitting}
                className="mt-0.5"
              />
              <span>Other</span>
            </label>
            {subjectOtherChecked ? (
              <Input
                value={subjectOther}
                onChange={(event) => setSubjectOther(event.target.value)}
                disabled={isSubmitting}
                placeholder="Describe the subject"
              />
            ) : null}
          </div>
        </Field.Root>
      ) : null}

      {displayError ? (
        <p className="text-sm text-danger" role="alert">
          {displayError}
        </p>
      ) : null}

      <Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
        Confirm booking
      </Button>
    </form>
  );
}
