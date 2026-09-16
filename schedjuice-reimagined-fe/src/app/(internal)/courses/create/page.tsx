"use client";

import { useGetAllEntitiesQuery } from "@/components/form/entity-combobox";
import { CreateFlowLoading } from "@/components/scheduling/create-flow-loading";
import {
  CREATE_FLOW_PROGRAMS_QUERY_OPTIONS,
  CREATE_FLOW_PROGRAMS_QUERY_PARAMS,
} from "@/components/scheduling/create-flow-programs-query";
import { ProgramPicker } from "@/components/scheduling/program-picker";
import { programType } from "@/types/program";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function CourseCreateGatePage() {
  const router = useRouter();

  const programsQuery = useGetAllEntitiesQuery(
    "programs",
    CREATE_FLOW_PROGRAMS_QUERY_PARAMS,
    undefined,
    CREATE_FLOW_PROGRAMS_QUERY_OPTIONS,
  );

  const activePrograms = useMemo(
    () =>
      ((programsQuery.data?.data?.data ?? []) as programType[]).filter(
        (p) => p.is_active !== false,
      ),
    [programsQuery.data],
  );

  const singleProgram =
    activePrograms.length === 1 ? activePrograms[0] : undefined;

  useEffect(() => {
    if (singleProgram?.id) {
      router.replace(`/courses/create/program/${singleProgram.id}`);
    }
  }, [singleProgram, router]);

  const showProgramsLoading =
    !programsQuery.data &&
    (programsQuery.isLoading || programsQuery.isFetching);

  if (showProgramsLoading) {
    return <CreateFlowLoading message="Loading programs…" />;
  }

  if (programsQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load programs. Refresh and try again.
      </p>
    );
  }

  if (singleProgram) {
    return <CreateFlowLoading message="Opening program…" />;
  }

  if (activePrograms.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No programs configured yet. Create a program in settings first.
      </p>
    );
  }

  return <ProgramPicker programs={activePrograms} />;
}
