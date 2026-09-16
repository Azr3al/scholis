import { axiosClient } from "@/lib/api";
import type {
  GradingBand,
  MonthlyReport,
  MonthlyResultSheet,
  ReportBatch,
  ResultColumn,
  ResultSheetGrid,
} from "@/types/grading-reports";

type Envelope<T> = { isError: boolean; message: string; data: T };

export async function listResultSheets(
  courseId: string,
): Promise<MonthlyResultSheet[]> {
  const res = await axiosClient.get<Envelope<MonthlyResultSheet[]>>(
    `courses/${courseId}/result-sheets`,
  );
  return res.data.data;
}

export async function createResultSheet(
  courseId: string,
  body: { year: number; month: number; exam_date: string },
): Promise<MonthlyResultSheet> {
  const res = await axiosClient.post<Envelope<MonthlyResultSheet>>(
    `courses/${courseId}/result-sheets`,
    body,
  );
  return res.data.data;
}

export async function getResultSheetGrid(
  sheetId: number,
): Promise<ResultSheetGrid> {
  const res = await axiosClient.get<Envelope<ResultSheetGrid>>(
    `result-sheets/${sheetId}/grid`,
  );
  return res.data.data;
}

export async function upsertResultCells(
  sheetId: number,
  cells: Array<{ column_id: number; student_id: number; marks: number | null }>,
): Promise<void> {
  await axiosClient.patch(`result-sheets/${sheetId}/cells`, { cells });
}

export async function createResultColumn(
  sheetId: number,
  body: Pick<ResultColumn, "title" | "max_marks" | "is_named_test">,
): Promise<ResultColumn> {
  const res = await axiosClient.post<Envelope<ResultColumn>>(
    `result-sheets/${sheetId}/columns`,
    body,
  );
  return res.data.data;
}

export async function listReportBatches(
  courseId: string,
): Promise<ReportBatch[]> {
  const res = await axiosClient.get<Envelope<ReportBatch[]>>(
    `courses/${courseId}/report-batches`,
  );
  return res.data.data;
}

export async function createReportBatch(
  courseId: string,
  body: {
    sheet_id: number;
    column_ids: number[];
    project_templates: { title: string }[];
  },
): Promise<ReportBatch> {
  const res = await axiosClient.post<Envelope<ReportBatch>>(
    `courses/${courseId}/report-batches`,
    body,
  );
  return res.data.data;
}

export async function getReportBatch(batchId: number): Promise<ReportBatch> {
  const res = await axiosClient.get<Envelope<ReportBatch>>(
    `report-batches/${batchId}`,
  );
  return res.data.data;
}

export async function regenerateReportBatch(
  batchId: number,
): Promise<ReportBatch> {
  const res = await axiosClient.post<Envelope<ReportBatch>>(
    `report-batches/${batchId}/regenerate`,
  );
  return res.data.data;
}

export async function updateMonthlyReport(
  reportId: number,
  body: Partial<Pick<MonthlyReport, "project_ratings" | "teacher_remarks">>,
): Promise<MonthlyReport> {
  const res = await axiosClient.patch<Envelope<MonthlyReport>>(
    `monthly-reports/${reportId}`,
    body,
  );
  return res.data.data;
}

export async function finalizeMonthlyReport(
  reportId: number,
): Promise<MonthlyReport> {
  const res = await axiosClient.post<Envelope<MonthlyReport>>(
    `monthly-reports/${reportId}/finalize`,
  );
  return res.data.data;
}

export async function getResolvedGradingScale(
  courseId: string,
): Promise<GradingBand[]> {
  const res = await axiosClient.get<Envelope<{ bands: GradingBand[] }>>(
    `courses/${courseId}/grading-scale/resolved`,
  );
  return res.data.data.bands;
}
