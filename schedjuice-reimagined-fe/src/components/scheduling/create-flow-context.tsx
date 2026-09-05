"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, usePathname } from "next/navigation";
import type { IntakePreviewCourseRow, LevelSectionSelection, RecurringSlot, ExtraIntakeCourseDraft } from "@/types/intake";
import { serializeLevelSectionOverrides } from "@/helpers/intake-sections";
import type { DraftLevel } from "@/types/program";
import type { ExamBoardType } from "@/types/course";

export const CREATE_FLOW_STORAGE_KEY = "schedjuice:create-flow";
const STORAGE_KEY = CREATE_FLOW_STORAGE_KEY;

export type CreateFlowState = {
  programId?: number;
  intakeName?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: number;
  paymentPlanId?: number;
  examSessionDate?: string;
  examBoard?: ExamBoardType;
  intakeId?: number;
  structureDraft?: DraftLevel[];
  structurePersisted?: boolean;
  levelSubjectOverrides?: Record<number, number[]>;
  levelSectionOverrides?: Record<number, LevelSectionSelection[]>;
  extraCourses?: ExtraIntakeCourseDraft[];
  previewRows?: IntakePreviewCourseRow[];
  titleEdits?: Record<string, string>;
  excluded?: Record<string, boolean>;
  defaultStartDate?: string;
  defaultEndDate?: string;
  defaultCategoryId?: number;
  defaultPaymentPlanId?: number;
  defaultSlots?: RecurringSlot[];
  dateOverrides?: Record<string, { start_date?: string; end_date?: string }>;
  slotOverrides?: Record<string, RecurringSlot[]>;
  categoryOverrides?: Record<string, number>;
  paymentPlanOverrides?: Record<string, number>;
  previewSignature?: string;
};

export const INTAKE_PREVIEW_FIELDS = [
  "intakeId",
  "extraCourses",
  "previewRows",
  "titleEdits",
  "excluded",
  "defaultStartDate",
  "defaultEndDate",
  "defaultCategoryId",
  "defaultPaymentPlanId",
  "defaultSlots",
  "dateOverrides",
  "slotOverrides",
  "categoryOverrides",
  "paymentPlanOverrides",
  "previewSignature",
] as const satisfies readonly (keyof CreateFlowState)[];

type CreateFlowContextValue = {
  state: CreateFlowState;
  setState: (patch: Partial<CreateFlowState>) => void;
  reset: () => void;
  clearIntakePreviewState: () => void;
};

const CreateFlowContext = createContext<CreateFlowContextValue | null>(null);

function loadState(): CreateFlowState {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CreateFlowState) : {};
  } catch {
    return {};
  }
}

/** Pure guard: decides whether persisted wizard state should be dropped. */
export function shouldResetCreateFlowState(
  loaded: CreateFlowState,
  urlProgramId: number | undefined,
  isManualRoute: boolean,
): boolean {
  if (isManualRoute) return true;
  return (
    loaded.programId != null &&
    urlProgramId != null &&
    loaded.programId !== urlProgramId
  );
}

function parseUrlProgramId(raw?: string): number | undefined {
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function omitIntakePreviewFields(state: CreateFlowState): CreateFlowState {
  const next = { ...state };
  for (const key of INTAKE_PREVIEW_FIELDS) {
    delete next[key];
  }
  return next;
}

/** Stable cache key for intake preview; changes when intake identity or curriculum changes. */
export function buildPreviewSignature(
  programId: string | number,
  intakeName?: string,
  startDate?: string,
  endDate?: string,
  levelSubjectOverrides?: Record<number, number[]>,
  levelSectionOverrides?: Record<number, LevelSectionSelection[]>,
  extraCourses?: ExtraIntakeCourseDraft[],
): string {
  const subjectsKey = levelSubjectOverrides
    ? JSON.stringify(
        Object.entries(levelSubjectOverrides)
          .map(([levelId, ids]) => [levelId, [...ids].sort((a, b) => a - b)])
          .sort(([a], [b]) => Number(a) - Number(b)),
      )
    : "";
  const sectionsKey = serializeLevelSectionOverrides(levelSectionOverrides);
  const extraCoursesKey = extraCourses?.length
    ? JSON.stringify(
        [...extraCourses]
          .map((row) => [row.key, row.subject_id, row.title ?? ""])
          .sort(([a], [b]) => String(a).localeCompare(String(b))),
      )
    : "";
  return [
    programId,
    intakeName ?? "",
    startDate ?? "",
    endDate ?? "",
    subjectsKey,
    sectionsKey,
    extraCoursesKey,
  ].join("|");
}

export function shouldSkipPreviewFetch(
  state: CreateFlowState,
  signature: string,
  previewRowCount: number,
): boolean {
  return state.previewSignature === signature && previewRowCount > 0;
}

export function CreateFlowProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ programId?: string }>();
  const pathname = usePathname();
  const urlProgramId = parseUrlProgramId(params?.programId);
  const isManualRoute = pathname?.includes("/manual") ?? false;

  const [state, setStateInner] = useState<CreateFlowState>({});

  useEffect(() => {
    const loaded = loadState();
    if (shouldResetCreateFlowState(loaded, urlProgramId, isManualRoute)) {
      sessionStorage.removeItem(STORAGE_KEY);
      setStateInner({});
      return;
    }
    setStateInner(loaded);
  }, [urlProgramId, isManualRoute]);

  const setState = useCallback((patch: Partial<CreateFlowState>) => {
    setStateInner((prev) => {
      const next = { ...prev, ...patch };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setStateInner({});
  }, []);

  const clearIntakePreviewState = useCallback(() => {
    setStateInner((prev) => {
      const next = omitIntakePreviewFields(prev);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ state, setState, reset, clearIntakePreviewState }),
    [state, setState, reset, clearIntakePreviewState],
  );

  return (
    <CreateFlowContext.Provider value={value}>
      {children}
    </CreateFlowContext.Provider>
  );
}

export function useCreateFlow() {
  const ctx = useContext(CreateFlowContext);
  if (!ctx) {
    throw new Error("useCreateFlow must be used within CreateFlowProvider");
  }
  return ctx;
}
