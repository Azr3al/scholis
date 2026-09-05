import {
  matchUsersBulk,
  resolveCoursesBulk,
  type MatchSpec,
} from "@/app/client-api/imports";
import type { ImportState } from "@/store/import-store";
import {
  collectUniqueColumnValues,
  collectUniqueCourseTokens,
  coursesMappedColumn,
  matchableMappedColumns,
  nameMappedColumn,
} from "@/lib/imports/wizard-logic";
import {
  buildCourseResolutions,
  buildUserMatches,
  cellKey,
  type CellResolution,
  type MatchSpecResolved,
} from "@/lib/imports/resolution";

export async function resolveImportRowIndices(
  indices: number[],
  getState: () => ImportState,
  mergeResolutions: (entries: Map<string, CellResolution>) => void,
): Promise<void> {
  if (indices.length === 0) return;

  const { parse, mapping, rowIds, courseScope, matchConfig, matchPriority } =
    getState();
  if (!parse) return;

  const coursesIdx = coursesMappedColumn(mapping);
  const activeSpecs: MatchSpecResolved[] = matchableMappedColumns(mapping)
    .filter((c) => matchConfig[c.fieldKey]?.match)
    .map((c) => ({
      fieldKey: c.fieldKey,
      colIndex: c.colIndex,
      type: c.type,
      fuzzy: Boolean(matchConfig[c.fieldKey]?.fuzzy),
    }));

  const sliceRows = indices.map((i) => parse.rows[i]);
  const sliceRowIds = indices.map((i) => rowIds[i]);

  const seed = new Map<string, CellResolution>();
  if (activeSpecs.length > 0) {
    for (const rowId of sliceRowIds) {
      seed.set(cellKey(rowId, "email"), { status: "resolving" });
    }
  }
  if (coursesIdx != null) {
    for (const rowId of sliceRowIds) {
      seed.set(cellKey(rowId, "courses"), { status: "resolving", tokens: [] });
    }
  }
  if (seed.size > 0) mergeResolutions(seed);

  if (activeSpecs.length > 0) {
    const specs: MatchSpec[] = activeSpecs.map((s) => ({
      key: s.fieldKey,
      type: s.type,
      fuzzy: s.fuzzy,
      values: collectUniqueColumnValues(sliceRows, s.colIndex),
    }));
    const results = await matchUsersBulk(specs);
    const nameColIndex = nameMappedColumn(mapping);
    mergeResolutions(
      buildUserMatches(
        sliceRows,
        activeSpecs,
        matchPriority,
        sliceRowIds,
        results,
        nameColIndex,
      ),
    );
  }

  if (coursesIdx != null) {
    const names = collectUniqueCourseTokens(sliceRows, coursesIdx);
    const courseMap = await resolveCoursesBulk(names, courseScope);
    mergeResolutions(
      buildCourseResolutions(sliceRows, coursesIdx, sliceRowIds, courseMap),
    );
  }
}
