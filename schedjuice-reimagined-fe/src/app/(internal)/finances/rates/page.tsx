"use client";

// Dense-grid exception: employee rates use Glide DataSheet for inline editing;
// PageContainer width="wide" applies at route level for the tabular editor layout.

import { PageContainer } from "@/components/layout/page-container";
import {
  SHEET_FULLSCREEN_TOP_BAR_HEIGHT_PX,
  SheetFullscreenShell,
} from "@/components/layout/sheet-fullscreen-shell";
import { AttendanceAutosaveStatusBar } from "@/components/attendance/attendance-autosave-status";
import type { AttendanceAutosaveStatus } from "@/components/attendance/use-attendance-autosave";
import CourseRatesEditor from "@/components/finances/course-rates-editor";
import EmployeeRatesGrid, {
  type EmployeeRatesSaveState,
  type RateColumn,
} from "@/components/finances/employee-rates-grid";
import { Switch } from "@/components/primitives";
import { useTenant } from "@/hooks/useTenant";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { PayrollCalculationStrategy } from "@/types/organization";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const IncludeInactiveSwitch = ({
  checked,
  onCheckedChange,
  id = "rates-include-inactive",
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
}) => (
  <label htmlFor={id} className="flex items-center gap-2">
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    <span className="whitespace-nowrap text-sm font-normal text-text-primary">
      Include inactive
    </span>
  </label>
);

const EmployeeRatesTable = () => {
  const { tenant } = useTenant();
  const { effectiveFullscreen } = useFullscreen();
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(false);
  const [fullscreenGridHeight, setFullscreenGridHeight] = useState(700);
  const [saveStatus, setSaveStatus] = useState<AttendanceAutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveRetryRef = useRef<() => void>(() => {});

  const rateColumns = useMemo<RateColumn[]>(() => {
    if (
      tenant?.payroll_calculation_strategy ===
      PayrollCalculationStrategy.session_based
    ) {
      return [{ field: "per_session_rate", title: "Per Session Rate" }];
    }
    const cols: RateColumn[] = [
      { field: "per_hour_rate", title: "Hourly Rate" },
    ];
    if (!tenant?.is_microsoft_on) {
      cols.push({
        field: "student_bonus_hourly_rate",
        title: "Student Bonus Hourly Rate",
      });
    }
    return cols;
  }, [tenant?.payroll_calculation_strategy, tenant?.is_microsoft_on]);

  useEffect(() => {
    const update = () => {
      setFullscreenGridHeight(
        Math.max(420, window.innerHeight - SHEET_FULLSCREEN_TOP_BAR_HEIGHT_PX),
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handleSaveStateChange = useCallback((state: EmployeeRatesSaveState) => {
    setSaveStatus(state.saveStatus);
    setLastSavedAt(state.lastSavedAt);
    saveRetryRef.current = state.onRetry;
  }, []);

  const grid = (
    <EmployeeRatesGrid
      rateColumns={rateColumns}
      includeInactive={includeInactiveUsers}
      height={effectiveFullscreen ? fullscreenGridHeight : undefined}
      className={
        effectiveFullscreen ? "h-full rounded-none border-0" : undefined
      }
      showSaveStatus={!effectiveFullscreen}
      onSaveStateChange={
        effectiveFullscreen ? handleSaveStateChange : undefined
      }
    />
  );

  if (effectiveFullscreen) {
    return (
      <SheetFullscreenShell
        layout="grid-first"
        title="Rates"
        actions={
          <div className="flex items-center gap-4">
            <AttendanceAutosaveStatusBar
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              onRetry={() => saveRetryRef.current()}
            />
            <IncludeInactiveSwitch
              checked={includeInactiveUsers}
              onCheckedChange={setIncludeInactiveUsers}
            />
          </div>
        }
        main={grid}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <IncludeInactiveSwitch
          checked={includeInactiveUsers}
          onCheckedChange={setIncludeInactiveUsers}
        />
      </div>
      {grid}
    </div>
  );
};

const EmployeeRatesPage = () => {
  const { tenant } = useTenant();
  const { setAvailability, effectiveFullscreen } = useFullscreen();

  useEffect(() => {
    if (tenant?.supports_course_specific_rates) {
      setAvailability({ enabled: false });
      return;
    }
    setAvailability({ enabled: true, label: "Rates fullscreen" });
    return () => setAvailability({ enabled: false });
  }, [tenant?.supports_course_specific_rates, setAvailability]);

  if (tenant?.supports_course_specific_rates) {
    return (
      <div className="space-y-3">
        <CourseRatesEditor />
      </div>
    );
  }

  if (effectiveFullscreen) {
    return <EmployeeRatesTable />;
  }

  return (
    <PageContainer width="wide">
      <EmployeeRatesTable />
    </PageContainer>
  );
};

export default EmployeeRatesPage;
