import type { DraftReportTypeField } from "./report-type-field-validation";

export function reindexDraftFields(
  fields: DraftReportTypeField[],
): DraftReportTypeField[] {
  return fields.map((f, i) => ({ ...f, sort_order: i }));
}
