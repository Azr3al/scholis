"use client";
import { Button, Dialog } from "@/components/primitives";

import { useState } from "react";
import { endOfMonth, format } from "date-fns";

import { DatePicker } from "@/components/date/date-picker";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { year: number; month: number; exam_date: string }) => void;
  isPending?: boolean;
};

function monthAnchor(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function CreateResultSheetDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: Props) {
  const now = new Date();
  const [monthDate, setMonthDate] = useState(() => monthAnchor(now));
  const [examDate, setExamDate] = useState(() =>
    format(endOfMonth(now), "yyyy-MM-dd"),
  );

  const handleMonthDateChange = (next: Date) => {
    const anchor = monthAnchor(next);
    setMonthDate(anchor);
    setExamDate(format(endOfMonth(anchor), "yyyy-MM-dd"));
  };

  const examDateValue = examDate
    ? new Date(`${examDate}T00:00:00`)
    : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Add results month</Dialog.Title>
        </div>
        <div className="space-y-4">
          <YearMonthSelector
            date={monthDate}
            setDate={handleMonthDateChange}
            fullWidth
          />
          <div className="space-y-2">
            <label>Exam date</label>
            <DatePicker
              date={examDateValue}
              setDate={(date) =>
                setExamDate(date ? format(date, "yyyy-MM-dd") : "")
              }
            />
          </div>
        </div>
        <div>
          <Button
            onClick={() =>
              onSubmit({
                year: monthDate.getFullYear(),
                month: monthDate.getMonth() + 1,
                exam_date: examDate,
              })
            }
            isLoading={isPending}
          >
            Create sheet
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
