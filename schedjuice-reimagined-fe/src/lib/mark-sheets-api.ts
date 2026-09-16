import { axiosClient } from "@/lib/api";
import type { UserMatchResult } from "@/app/client-api/imports";
import type {
  CourseRubric,
  ImportParseResult,
  MarkSheet,
  MarkSheetGrid,
  RubricColumn,
  RubricMatchSuggestion,
} from "@/types/mark-sheets";

type Envelope<T> = { isError: boolean; message: string; data: T };

export type CourseRosterStudent = {
  user_course_id: number;
  id: number;
  name: string;
  email: string;
  code?: string | null;
};

export async function listCourseRosterStudents(
  courseId: string,
): Promise<CourseRosterStudent[]> {
  const res = await axiosClient.get<Envelope<CourseRosterStudent[]>>(
    `courses/${courseId}/students`,
  );
  return res.data.data;
}

export async function listRubrics(courseId: string): Promise<CourseRubric[]> {
  const res = await axiosClient.get<Envelope<CourseRubric[]>>(
    `courses/${courseId}/rubrics`,
  );
  return res.data.data;
}

export async function createRubric(
  courseId: string,
  body: { title: string; columns: RubricColumn[] },
): Promise<CourseRubric> {
  const res = await axiosClient.post<Envelope<CourseRubric>>(
    `courses/${courseId}/rubrics`,
    body,
  );
  return res.data.data;
}

export async function matchRubrics(
  courseId: string,
  columns: RubricColumn[],
): Promise<RubricMatchSuggestion[]> {
  const res = await axiosClient.post<Envelope<RubricMatchSuggestion[]>>(
    `courses/${courseId}/rubrics/match`,
    { columns },
  );
  return res.data.data;
}

export async function listMarkSheets(
  courseId: string,
  params?: { year?: number; month?: number },
): Promise<MarkSheet[]> {
  const res = await axiosClient.get<Envelope<MarkSheet[]>>(
    `courses/${courseId}/mark-sheets`,
    { params },
  );
  return res.data.data;
}

export async function createMarkSheet(
  courseId: string,
  body: {
    rubric_id: number;
    title?: string;
    year: number;
    month: number;
    exam_date?: string | null;
  },
): Promise<MarkSheet> {
  const res = await axiosClient.post<Envelope<MarkSheet>>(
    `courses/${courseId}/mark-sheets`,
    body,
  );
  return res.data.data;
}

export async function getMarkSheetGrid(sheetId: number): Promise<MarkSheetGrid> {
  const res = await axiosClient.get<Envelope<MarkSheetGrid>>(
    `mark-sheets/${sheetId}/grid`,
  );
  return res.data.data;
}

export async function upsertMarkSheetCells(
  sheetId: number,
  cells: Array<{
    student_id: number;
    column_key: string;
    marks: number | null;
  }>,
): Promise<void> {
  await axiosClient.patch(`mark-sheets/${sheetId}/cells`, { cells });
}

export async function parseMarkSheetImport(
  courseId: string,
  input: { file?: File; paste?: string },
): Promise<ImportParseResult> {
  if (input.file) {
    const form = new FormData();
    form.append("file", input.file);
    const res = await axiosClient.post<Envelope<ImportParseResult>>(
      `courses/${courseId}/mark-sheets/import/parse`,
      form,
    );
    return res.data.data;
  }
  const res = await axiosClient.post<Envelope<ImportParseResult>>(
    `courses/${courseId}/mark-sheets/import/parse`,
    { paste: input.paste },
  );
  return res.data.data;
}

export async function matchMarkSheetStudents(
  courseId: string,
  body: {
    rows: (string | number | null)[][];
    column_mapping: Record<string, number>;
  },
): Promise<Record<string, Record<string, UserMatchResult>>> {
  const res = await axiosClient.post<
    Envelope<{ results: Record<string, Record<string, UserMatchResult>> }>
  >(`courses/${courseId}/mark-sheets/import/match-students`, body);
  return res.data.data.results as Record<string, Record<string, UserMatchResult>>;
}

export async function commitMarkSheetImport(
  courseId: string,
  body: {
    title: string;
    year: number;
    month: number;
    exam_date?: string | null;
    rubric_id?: number;
    rubric?: { title: string; columns: RubricColumn[] };
    rows: Array<{ student_id: number; marks: Record<string, number | string> }>;
  },
): Promise<MarkSheet> {
  const res = await axiosClient.post<Envelope<MarkSheet>>(
    `courses/${courseId}/mark-sheets/import/commit`,
    body,
  );
  return res.data.data;
}
