"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { Button, Checkbox, Input } from "@/components/primitives";
import { formatDate } from "@/helpers/date";
import {
  createReportBatch,
  getResultSheetGrid,
  listResultSheets,
} from "@/lib/grading-reports-api";

export default function CreateGradingReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [columnIds, setColumnIds] = useState<number[]>([]);
  const [projects, setProjects] = useState([{ title: "" }]);

  const sheetsQuery = useQuery({
    queryKey: ["result-sheets", id],
    queryFn: () => listResultSheets(id),
  });

  const gridQuery = useQuery({
    queryKey: ["result-sheet-grid", sheetId],
    queryFn: () => getResultSheetGrid(sheetId!),
    enabled: sheetId != null,
  });

  const namedColumns = useMemo(
    () => (gridQuery.data?.columns ?? []).filter((c) => c.is_named_test),
    [gridQuery.data],
  );

  const selectedSheet = sheetsQuery.data?.find((s) => s.id === sheetId);

  const createMutation = useMutation({
    mutationFn: () =>
      createReportBatch(id, {
        sheet_id: sheetId!,
        column_ids: columnIds,
        project_templates: projects
          .filter((p) => p.title.trim())
          .map((p) => ({ title: p.title.trim() })),
      }),
    onSuccess: (batch) => {
      router.push(`/courses/${id}/grading/reports/${batch.id}`);
    },
  });

  return (
    <PageContainer width="narrow" className="space-y-6">
      <div>
        <Link
          href={`/courses/${id}/grading/reports`}
          className="text-primary text-sm hover:underline"
        >
          Back to reports
        </Link>
        <h1 className="text-xl">Generate monthly reports</h1>
        <p className="text-text-muted text-sm">Step {step} of 3</p>
      </div>

      {step === 1 ? (
        <section className="space-y-3">
          <h2 className="font-medium">Select month</h2>
          {(sheetsQuery.data ?? []).map((sheet) => (
            <label
              key={sheet.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border p-3"
            >
              <input
                type="radio"
                name="sheet"
                checked={sheetId === sheet.id}
                onChange={() => {
                  setSheetId(sheet.id);
                  setColumnIds([]);
                }}
              />
              <div>
                <p>
                  {format(
                    new Date(sheet.year, sheet.month - 1, 1),
                    "MMMM yyyy",
                  )}
                </p>
                <p className="text-text-muted text-sm">
                  Exam date: {formatDate(sheet.exam_date, "d.M.yyyy")}
                </p>
              </div>
            </label>
          ))}
          {(sheetsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-secondary">
              No result sheets yet.{" "}
              <Link href={`/courses/${id}/grading/results`} className="text-accent">
                Add results first.
              </Link>
            </p>
          ) : null}
          <Button disabled={!sheetId} onClick={() => setStep(2)}>
            Next
          </Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-3">
          <h2 className="font-medium">Select tests</h2>
          {namedColumns.map((col) => (
            <label key={col.id} className="flex items-center gap-2">
              <Checkbox
                checked={columnIds.includes(col.id)}
                onCheckedChange={(checked) => {
                  setColumnIds((prev) =>
                    checked
                      ? [...prev, col.id]
                      : prev.filter((id) => id !== col.id),
                  );
                }}
              />
              <span>
                {col.title} /{col.max_marks}
              </span>
            </label>
          ))}
          {namedColumns.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No named tests on this sheet.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={columnIds.length === 0}
              onClick={() => setStep(3)}
            >
              Next
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-3">
          <h2 className="font-medium">Projects & assignments</h2>
          {projects.map((project, index) => (
            <div key={index} className="space-y-1">
              <label className="text-sm font-medium text-text-primary">
                Project {index + 1}
              </label>
              <Input
                value={project.title}
                onChange={(e) => {
                  const next = [...projects];
                  next[index] = { title: e.target.value };
                  setProjects(next);
                }}
                placeholder="Speaking project"
              />
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => setProjects((prev) => [...prev, { title: "" }])}
          >
            Add project
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              disabled={!selectedSheet}
              isLoading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Generate reports
            </Button>
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}
