# Strategy-aware payroll: earnings widget + rates Glide grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "My earnings" widget and the flat rates editor strategy-aware, and upgrade the flat rates table to Glide Data Grid with immediate per-cell save.

**Architecture:** Read `tenant.payroll_calculation_strategy` on the client. The earnings widget picks its payroll endpoint from it. The rates page computes which rate column(s) to render and passes them to a new self-contained `EmployeeRatesGrid` Glide component that fetches staff, renders editable rate cells, and PUTs each edit.

**Tech Stack:** Next.js (client components), React Query, `@glideapps/glide-data-grid` (already installed), existing `useGlideTheme`, `searchEntities` / `updateEntity` API helpers, shadcn `useToast`.

> **Workspace note:** This repo follows a no-git-commits rule. Do NOT run `git commit` unless the user explicitly asks. Each task ends with a verification step (typecheck/lint/manual) instead of a commit.

---

## Reference facts (verified against the codebase)

- Spec: `docs/superpowers/specs/2026-06-17-strategy-aware-payroll-rates-design.md`.
- `PayrollCalculationStrategy` enum lives in `src/types/organization.ts` with values
  `tr_phillips` and `session_based`. `organizationSchema` already has
  `payroll_calculation_strategy`.
- `useTenant()` from `@/hooks/useTenant` returns `{ tenant }` where `tenant` matches
  `organizationType`.
- API helpers in `src/app/client-api/utils.ts`:
  - `searchEntities(entity, queryParams, filterParams)` -> `POST entity/search`; list rows
    are at `res.data.data`.
  - `updateEntity(entity, id, data)` -> `PUT entity/:id`.
- Role filtering uses `filter_params` with `operatorEnum.contained_by` and
  `listToApiArray([...roles])` (see `src/app/(internal)/finances/rates/page.tsx`).
- Glide reference implementation: `src/components/import-grid/import-data-grid.tsx`.
  Theme hook: `src/components/import-grid/use-glide-theme.ts` (`useGlideTheme()`).
- `queryParamDefault` from `@/config/defaults`.

---

## Task 1: "My earnings" widget — strategy dispatch

**Files:**
- Modify: `src/components/home/widgets/my-earnings-widget.tsx`

- [ ] **Step 1: Add tenant + strategy-based endpoint**

Add the import and derive the endpoint. Replace the imports block and query:

```tsx
import { makePostRequest } from "@/app/client-api/utils";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/helpers/money";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { PayrollCalculationStrategy } from "@/types/organization";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo } from "react";
import { DashboardCard } from "../dashboard-card";

export default function MyEarningsWidget() {
  const { user } = useUser();
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const now = useMemo(() => new Date(), []);

  const payrollEndpoint =
    tenant?.payroll_calculation_strategy ===
    PayrollCalculationStrategy.session_based
      ? "payroll/session-based"
      : "payroll/trphillips";

  const payrollQuery = useQuery({
    queryKey: [
      "widget-my-earnings",
      payrollEndpoint,
      user?.id,
      now.getFullYear(),
      now.getMonth(),
    ],
    queryFn: async () => {
      const res = await makePostRequest(payrollEndpoint, {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        user_id: user?.id,
      });
      return res.data;
    },
    enabled: !!user?.id,
  });
```

Leave the rest of the component (earnings/formatted/return JSX) unchanged — both
endpoints return `aggregate.total_earnings`.

- [ ] **Step 2: Verify**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit`
Expected: no new type errors in `my-earnings-widget.tsx`.
Manual: on a `session_based` tenant the widget shows session-based earnings; on a default
tenant it is unchanged.

---

## Task 2: `EmployeeRatesGrid` Glide component

**Files:**
- Create: `src/components/finances/employee-rates-grid.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { searchEntities, updateEntity } from "@/app/client-api/utils";
import { Loader } from "@/components/form/loader";
import { useToast } from "@/components/ui/use-toast";
import { queryParamDefault } from "@/config/defaults";
import { listToApiArray } from "@/helpers/filter-params";
import { formatMoney } from "@/helpers/money";
import { cn } from "@/lib/utils";
import { useGlideTheme } from "@/components/import-grid/use-glide-theme";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

export type RateColumn = { field: string; title: string };

type RateRow = {
  id: number;
  name: string;
  email: string;
  [rateField: string]: string | number | null;
};

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 36;
const MIN_GRID_HEIGHT = 400;
const MAX_GRID_HEIGHT_RATIO = 0.7;

const ROLE_FILTER = {
  filter_params: [
    {
      field_name: "roles",
      operator: operatorEnum.contained_by,
      value: listToApiArray([role.admin, role.manager, role.teacher]),
    },
  ],
};

export default function EmployeeRatesGrid({
  rateColumns,
  includeInactive,
}: {
  rateColumns: RateColumn[];
  includeInactive: boolean;
}) {
  const theme = useGlideTheme();
  const currencySymbol = useTenantCurrencySymbol();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const rateFields = useMemo(
    () => rateColumns.map((c) => c.field),
    [rateColumns],
  );

  const fields = useMemo(
    () => ["id", "name", "email", ...rateFields],
    [rateFields],
  );

  const queryKey = useMemo(
    () => ["employee-rates", includeInactive, rateFields.join(",")],
    [includeInactive, rateFields],
  );

  const ratesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await searchEntities(
        "users",
        {
          ...queryParamDefault,
          size: -1,
          sorts: ["name"],
          fields,
          ...(includeInactive ? { include_inactive: true } : {}),
        },
        ROLE_FILTER,
      );
      return (res.data?.data ?? []) as RateRow[];
    },
  });

  const [rows, setRows] = useState<RateRow[]>([]);
  useEffect(() => {
    if (ratesQuery.data) setRows(ratesQuery.data);
  }, [ratesQuery.data]);

  const [viewportMaxHeight, setViewportMaxHeight] = useState(700);
  useEffect(() => {
    const update = () =>
      setViewportMaxHeight(
        Math.floor(window.innerHeight * MAX_GRID_HEIGHT_RATIO),
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const columns = useMemo<GridColumn[]>(
    () => [
      { title: "Name", id: "name", width: 220 },
      { title: "Email", id: "email", width: 260 },
      ...rateColumns.map((c) => ({ title: c.title, id: c.field, width: 200 })),
    ],
    [rateColumns],
  );

  const colFields = useMemo(
    () => ["name", "email", ...rateFields],
    [rateFields],
  );

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: number;
      field: string;
      value: string;
    }) => updateEntity("users", id, { [field]: value === "" ? null : value }),
    onSuccess: () => {
      toast({});
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      if (ratesQuery.data) setRows(ratesQuery.data);
      toast({ title: "Failed to update rate", variant: "destructive" });
    },
  });

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const field = colFields[col];
      const record = rows[row];
      const raw = record?.[field];
      const value = raw === null || raw === undefined ? "" : String(raw);
      const isRate = rateFields.includes(field);

      if (isRate) {
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: value === "" ? "-" : formatMoney(value, currencySymbol),
          allowOverlay: true,
          readonly: false,
          contentAlign: "right",
        };
      }

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
      };
    },
    [colFields, rows, rateFields, currencySymbol],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      if (newValue.kind !== GridCellKind.Text) return;
      const field = colFields[col];
      if (!rateFields.includes(field)) return;
      const record = rows[row];
      if (!record) return;

      const next = newValue.data.trim();
      setRows((prev) => {
        const copy = [...prev];
        copy[row] = { ...copy[row], [field]: next === "" ? null : next };
        return copy;
      });
      saveMutation.mutate({ id: record.id, field, value: next });
    },
    [colFields, rateFields, rows, saveMutation],
  );

  if (ratesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader />
        Loading rates…
      </div>
    );
  }

  if (ratesQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load staff rates. Try again.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground leading-relaxed max-w-[65ch]">
        No staff match the current filter.
      </p>
    );
  }

  const contentHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + 2;
  const gridHeight = Math.min(
    Math.max(contentHeight, MIN_GRID_HEIGHT),
    viewportMaxHeight,
  );

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-md border border-border",
      )}
      style={{ height: gridHeight }}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <DataEditor
          theme={theme}
          width="100%"
          height={gridHeight}
          columns={columns}
          rows={rows.length}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          freezeColumns={1}
          smoothScrollX
          smoothScrollY
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          keybindings={{ search: true }}
          onPaste={() => false}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit`
Expected: no type errors in `employee-rates-grid.tsx`. If `operatorEnum`/`role` import
paths differ, align them with `src/app/(internal)/finances/rates/page.tsx`.

---

## Task 3: Rates page — strategy columns + use the grid

**Files:**
- Modify: `src/app/(internal)/finances/rates/page.tsx`

- [ ] **Step 1: Replace `EmployeeRatesTable` with grid + strategy columns**

Rewrite the file so the flat branch computes rate columns from strategy and renders
`EmployeeRatesGrid`. Keep the `supports_course_specific_rates` branch as-is.

```tsx
"use client";

import { PageContainer } from "@/components/layout/page-container";
import CourseRatesEditor from "@/components/finances/course-rates-editor";
import EmployeeRatesGrid, {
  type RateColumn,
} from "@/components/finances/employee-rates-grid";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTenant } from "@/hooks/useTenant";
import { PayrollCalculationStrategy } from "@/types/organization";
import { useMemo, useState } from "react";

const EmployeeRatesTable = () => {
  const { tenant } = useTenant();
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(false);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end space-x-2">
        <Switch
          id="rates-include-inactive"
          checked={includeInactiveUsers}
          onCheckedChange={setIncludeInactiveUsers}
        />
        <Label
          htmlFor="rates-include-inactive"
          className="text-sm font-normal whitespace-nowrap"
        >
          Include inactive
        </Label>
      </div>
      <EmployeeRatesGrid
        rateColumns={rateColumns}
        includeInactive={includeInactiveUsers}
      />
    </div>
  );
};

const EmployeeRatesPage = () => {
  const { tenant } = useTenant();

  if (tenant?.supports_course_specific_rates) {
    return (
      <div className="space-y-3">
        <CourseRatesEditor />
      </div>
    );
  }

  return (
    <PageContainer width="wide">
      <EmployeeRatesTable />
    </PageContainer>
  );
};

export default EmployeeRatesPage;
```

- [ ] **Step 2: Verify**

Run: `cd schedjuice-reimagined-fe && npx tsc --noEmit && npx next lint --file "src/app/(internal)/finances/rates/page.tsx"`
Expected: no type/lint errors.
Manual:
- Default/hourly tenant: grid shows Name, Email, Hourly Rate, and Student Bonus Hourly
  Rate (when not Microsoft). Editing a rate + Enter persists (network PUT `users/:id`)
  and survives a refresh.
- `session_based` tenant: grid shows Name, Email, Per Session Rate; editing persists.
- `supports_course_specific_rates` tenant: unchanged `CourseRatesEditor`.

---

## Self-Review

- **Spec coverage:**
  - Spec section 1 (widget dispatch) -> Task 1.
  - Spec section 2 (column selection by strategy) -> Task 3 Step 1.
  - Spec section 3 (`EmployeeRatesGrid`) -> Task 2.
  - Spec section 4 (styling) -> Task 2 (glide theme, mono via `formatMoney`, rounded
    border, no emojis, no new deps).
  - Non-goal: `CourseRatesEditor` untouched -> preserved in Task 3.
- **Type consistency:** `RateColumn` defined and exported in Task 2, imported in Task 3.
  `EmployeeRatesGrid` props `{ rateColumns, includeInactive }` match between tasks.
- **Placeholder scan:** none.

## Execution Handoff

Two execution options:
1. Subagent-Driven (recommended) — fresh subagent per task, review between tasks.
2. Inline Execution — execute tasks in this session with checkpoints.
