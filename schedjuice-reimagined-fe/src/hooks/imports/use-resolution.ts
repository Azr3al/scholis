import { useEffect, useMemo, useRef } from "react";

import {
  matchUsersBulk,
  resolveCoursesBulk,
  type MatchSpec,
} from "@/app/client-api/imports";
import useImportStore from "@/store/import-store";
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
import { scopeKey } from "@/lib/imports/course-scope";

export function useResolution() {
  const parse = useImportStore((s) => s.parse);
  const mapping = useImportStore((s) => s.mapping);
  const rowIds = useImportStore((s) => s.rowIds);
  const courseScope = useImportStore((s) => s.courseScope);
  const matchConfig = useImportStore((s) => s.matchConfig);
  const matchPriority = useImportStore((s) => s.matchPriority);
  const mergeResolutions = useImportStore((s) => s.mergeResolutions);
  const userMatchStartedRef = useRef(false);
  const lastCourseScopeKey = useRef<string | null>(null);

  const coursesIdx = useMemo(() => coursesMappedColumn(mapping), [mapping]);
  const nameColIndex = useMemo(() => nameMappedColumn(mapping), [mapping]);

  const activeSpecs = useMemo<MatchSpecResolved[]>(
    () =>
      matchableMappedColumns(mapping)
        .filter((c) => matchConfig[c.fieldKey]?.match)
        .map((c) => ({
          fieldKey: c.fieldKey,
          colIndex: c.colIndex,
          type: c.type,
          fuzzy: Boolean(matchConfig[c.fieldKey]?.fuzzy),
        })),
    [mapping, matchConfig],
  );

  useEffect(() => {
    if (!parse || userMatchStartedRef.current || activeSpecs.length === 0) return;
    userMatchStartedRef.current = true;

    const seed = new Map<string, CellResolution>();
    parse.rows.forEach((_, i) =>
      seed.set(cellKey(rowIds[i], "email"), { status: "resolving" }),
    );
    mergeResolutions(seed);

    const specs: MatchSpec[] = activeSpecs.map((s) => ({
      key: s.fieldKey,
      type: s.type,
      fuzzy: s.fuzzy,
      values: collectUniqueColumnValues(parse.rows, s.colIndex),
    }));

    void matchUsersBulk(specs).then((results) => {
      mergeResolutions(
        buildUserMatches(
          parse.rows,
          activeSpecs,
          matchPriority,
          rowIds,
          results,
          nameColIndex,
        ),
      );
    });
  }, [parse, activeSpecs, matchPriority, rowIds, nameColIndex, mergeResolutions]);

  useEffect(() => {
    if (!parse || coursesIdx == null) return;
    const key = scopeKey(courseScope);
    if (lastCourseScopeKey.current === key) return;
    lastCourseScopeKey.current = key;

    const seed = new Map<string, CellResolution>();
    parse.rows.forEach((_, i) =>
      seed.set(cellKey(rowIds[i], "courses"), {
        status: "resolving",
        tokens: [],
      }),
    );
    mergeResolutions(seed);

    const names = collectUniqueCourseTokens(parse.rows, coursesIdx);
    void resolveCoursesBulk(names, courseScope).then((map) => {
      mergeResolutions(
        buildCourseResolutions(parse.rows, coursesIdx, rowIds, map),
      );
    });
  }, [parse, coursesIdx, rowIds, courseScope, mergeResolutions]);
}
