import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  getAcademicHubMyClassesOnly,
  resolveMyDefault,
} from "@/lib/academic-hub-my-preference";
import { pickDefaultIntake } from "@/helpers/academic-hub/pick-default-intake";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser } from "@/hooks/useUser";
import { HUB_PROGRAM_ALL, type HubFilterSet } from "@/types/academic-hub";
import { useHubFilters } from "./use-hub-filters";
import { useHubIntakes } from "./use-intakes";
import { useHubPrograms } from "./use-programs";

export type AcademicHubQueryStateValue = ReturnType<
  typeof useAcademicHubQueryState
>;

/**
 * Resolves Academic Hub filters before the first list fetch so mount-time URL
 * bootstrap (my-classes default, single-program tenant, default intake) does not
 * trigger a visible refetch flash on course cards.
 */
export function useAcademicHubQueryState() {
  const filters = useHubFilters();
  const { state, isMyExplicit, setMy, setProgram, setIntake } = filters;
  const searchParams = useSearchParams();
  const { user, isLoading: isUserLoading } = useUser();
  const { can, canAny } = usePermissions();
  const { data: programs = [], isLoading: isProgramsLoading } = useHubPrograms();

  const userId = user?.id ?? 0;
  const seesAllCourses = canAny(["course.view_all", "course.manage_all"]);
  const isTeacherScoped = can("course.update") && !seesAllCourses;

  const resolvedMy = useMemo((): boolean | null => {
    if (isUserLoading || !user?.id) return null;
    if (isMyExplicit) return state.my;
    const stored = getAcademicHubMyClassesOnly(user.id);
    if (stored !== null) return stored;
    return resolveMyDefault(seesAllCourses, isTeacherScoped);
  }, [
    isUserLoading,
    user?.id,
    isMyExplicit,
    state.my,
    seesAllCourses,
    isTeacherScoped,
  ]);

  const resolvedProgram = useMemo((): string | null => {
    if (isProgramsLoading) return null;
    if (programs.length === 1 && state.program === HUB_PROGRAM_ALL) {
      return String(programs[0].id);
    }
    return state.program;
  }, [isProgramsLoading, programs, state.program]);

  const selectedProgram = useMemo(
    () => programs.find((p) => String(p.id) === resolvedProgram),
    [programs, resolvedProgram],
  );

  const isIntakeBased =
    Boolean(selectedProgram) &&
    selectedProgram!.course_creation_method === "intake_based" &&
    resolvedProgram !== HUB_PROGRAM_ALL;

  const needsIntakeDefault =
    isIntakeBased && state.intake === null && !searchParams.has("intake");

  const intakesQuery = useHubIntakes(
    needsIntakeDefault && resolvedProgram ? resolvedProgram : null,
  );

  const resolvedIntake = useMemo((): string | null | undefined => {
    if (!needsIntakeDefault) return state.intake;
    if (intakesQuery.isLoading || !intakesQuery.data) return undefined;
    const def = pickDefaultIntake(intakesQuery.data);
    return def ? String(def.id) : null;
  }, [
    needsIntakeDefault,
    state.intake,
    intakesQuery.isLoading,
    intakesQuery.data,
  ]);

  const queryState = useMemo((): HubFilterSet | null => {
    if (resolvedMy === null || resolvedProgram === null) return null;
    if (needsIntakeDefault && resolvedIntake === undefined) return null;
    return {
      ...state,
      my: resolvedMy,
      program: resolvedProgram,
      intake: needsIntakeDefault ? (resolvedIntake ?? null) : state.intake,
    };
  }, [
    state,
    resolvedMy,
    resolvedProgram,
    needsIntakeDefault,
    resolvedIntake,
  ]);

  useEffect(() => {
    if (resolvedMy === null) return;
    if (!isMyExplicit && state.my !== resolvedMy) {
      setMy(resolvedMy);
    }
  }, [resolvedMy, isMyExplicit, state.my, setMy]);

  useEffect(() => {
    if (resolvedProgram === null) return;
    if (state.program === resolvedProgram) return;
    if (programs.length === 1 && state.program === HUB_PROGRAM_ALL) {
      setProgram(resolvedProgram, { resetFilters: false });
    }
  }, [resolvedProgram, state.program, programs.length, setProgram]);

  useEffect(() => {
    if (!needsIntakeDefault) return;
    if (resolvedIntake === undefined || resolvedIntake === null) return;
    if (state.intake === resolvedIntake) return;
    setIntake(resolvedIntake);
  }, [needsIntakeDefault, resolvedIntake, state.intake, setIntake]);

  return {
    filters,
    queryState,
    queryReady: queryState !== null,
    userId,
    selectedProgram,
  };
}
