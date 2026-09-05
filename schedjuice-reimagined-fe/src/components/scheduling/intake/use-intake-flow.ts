"use client";

import { fetchEntity, searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { programType, SubjectStrategy } from "@/types/program";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { IntakeFlowContext } from "./intake-steps";

export function useIntakeFlow(programId: string) {
  const programQuery = useQuery({
    queryKey: ["intake-flow-program", programId],
    queryFn: () => fetchEntity("programs", programId),
  });

  const program = programQuery.data?.data?.data as programType | undefined;
  const isFirstIntake = (program?.intake_count ?? 0) === 0;
  const subjectStrategy =
    program?.subject_strategy ?? SubjectStrategy.optional;

  const needsLevelsQuery = subjectStrategy !== SubjectStrategy.required;

  const levelsQuery = useQuery({
    queryKey: ["program-has-levels", programId],
    queryFn: () =>
      searchEntities(
        "program-levels",
        { page: 1, size: 1, sorts: ["sort_order"] },
        {
          filter_params: [
            {
              field_name: "program",
              operator: operatorEnum.exact,
              value: programId,
            },
          ],
        },
      ),
    enabled: Boolean(programId) && needsLevelsQuery,
  });

  const subjectsQuery = useQuery({
    queryKey: ["program-has-subjects", programId],
    queryFn: () =>
      searchEntities(
        "program-subjects",
        { page: 1, size: 1, sorts: ["sort_order"] },
        {
          filter_params: [
            {
              field_name: "program",
              operator: operatorEnum.exact,
              value: programId,
            },
          ],
        },
      ),
    enabled: Boolean(programId),
  });

  const hasProgramStructure =
    ((levelsQuery.data?.data?.data ?? []) as unknown[]).length > 0;

  const hasProgramSubjects =
    ((subjectsQuery.data?.data?.data ?? []) as unknown[]).length > 0;

  const isLoading =
    programQuery.isLoading ||
    (needsLevelsQuery && levelsQuery.isLoading) ||
    subjectsQuery.isLoading;

  const flowContext: IntakeFlowContext = useMemo(
    () => ({
      isFirstIntake,
      hasProgramStructure,
      hasProgramSubjects,
      subjectStrategy,
    }),
    [isFirstIntake, hasProgramStructure, hasProgramSubjects, subjectStrategy],
  );

  return {
    program,
    isFirstIntake,
    hasProgramStructure,
    hasProgramSubjects,
    subjectStrategy,
    flowContext,
    isLoading,
    isError: programQuery.isError,
  };
}
