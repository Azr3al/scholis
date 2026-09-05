"use client";
import { Button, Checkbox, Textarea, buttonVariants } from "@/components/primitives";

import { format } from "date-fns";

import { formatDate } from "@/helpers/date";
import type { GradingBand, MonthlyReport } from "@/types/grading-reports";

type Props = {
  report: MonthlyReport;
  examDate: string;
  className: string;
  gradingBands: GradingBand[];
  editable?: boolean;
  onProjectRatingsChange?: (ratings: MonthlyReport["project_ratings"]) => void;
  onRemarksChange?: (remarks: string) => void;
  onFinalize?: () => void;
  isFinalizing?: boolean;
};

export function MonthlyReportPreview({
  report,
  examDate,
  className,
  gradingBands,
  editable = false,
  onProjectRatingsChange,
  onRemarksChange,
  onFinalize,
  isFinalizing,
}: Props) {
  const setRating = (
    index: number,
    patch: Partial<MonthlyReport["project_ratings"][number]>,
  ) => {
    if (!onProjectRatingsChange) return;
    const next = report.project_ratings.map((row, i) =>
      i === index ? { ...row, ...patch } : row,
    );
    onProjectRatingsChange(next);
  };

  return (
    <div className="space-y-6 print:text-sm">
      <div>
        <p className="text-muted-foreground text-sm">
          Date – {formatDate(examDate, "d.M.yyyy")}
        </p>
        <h2 className="text-2xl font-semibold">Monthly report</h2>
        <p className="text-muted-foreground">{className}</p>
        <p className="text-lg">{report.student_name}</p>
      </div>

      <section className="space-y-2">
        <h3 className="text-lg font-medium">Projects and Assignments</h3>
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th>Done</th>
              <th>Excellent</th>
              <th>Satisfactory</th>
              <th>Unsatisfactory</th>
            </tr>
          </thead>
          <tbody>
            {report.project_ratings.map((row, index) => (
              <tr key={`${row.title}-${index}`}>
                <td>{row.title}</td>
                <td>
                  <Checkbox
                    checked={row.done}
                    disabled={!editable}
                    onCheckedChange={(checked) =>
                      setRating(index, { done: checked === true })
                    }
                  />
                </td>
                {(["excellent", "satisfactory", "unsatisfactory"] as const).map(
                  (rating) => (
                    <td key={rating}>
                      <input
                        type="radio"
                        name={`rating-${index}`}
                        checked={row.rating === rating}
                        disabled={!editable}
                        onChange={() => setRating(index, { rating })}
                      />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-medium">Monthly Test Result</h3>
        <table>
          <thead>
            <tr>
              <th>Test & Project</th>
              <th>Marks</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {report.test_lines.map((line) => (
              <tr key={line.title}>
                <td>{line.title}</td>
                <td>
                  {line.marks}/{line.max_marks}
                </td>
                <td>{line.grade}</td>
              </tr>
            ))}
            <tr>
              <td className="font-medium">Percentage</td>
              <td>{report.overall.pct}%</td>
              <td>
                Attendance: {report.attendance.attended}/
                {report.attendance.total_days} ({report.attendance.pct}%)
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border p-3">
          <p className="font-medium">Academic Summary</p>
          <p>
            Total: {report.overall.total_marks}/{report.overall.total_max}
          </p>
          <p>Grade: {report.overall.grade}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="font-medium">Grading Scale</p>
          {gradingBands.map((band) => (
            <p key={band.label}>
              {band.min_pct}-{band.max_pct}% – {band.label}
            </p>
          ))}
        </div>
        <div className="rounded-md border p-3">
          <p className="font-medium">Attendance</p>
          <p>Total Days: {report.attendance.total_days}</p>
          <p>Attended: {report.attendance.attended}</p>
          <p>Absent: {report.attendance.absent}</p>
        </div>
      </div>

      <section className="space-y-2">
        <label htmlFor="remarks">Teacher&apos;s remarks</label>
        <Textarea
          id="remarks"
          value={report.teacher_remarks}
          readOnly={!editable}
          onChange={(e) => onRemarksChange?.(e.target.value)}
          rows={4}
        />
      </section>

      {editable && onFinalize ? (
        <Button onClick={onFinalize} isLoading={isFinalizing}>
          Finalize report
        </Button>
      ) : null}
      {report.status === "finalized" && report.finalized_at ? (
        <p className="text-muted-foreground text-sm">
          Finalized {format(new Date(report.finalized_at), "PPp")}
        </p>
      ) : null}
    </div>
  );
}
