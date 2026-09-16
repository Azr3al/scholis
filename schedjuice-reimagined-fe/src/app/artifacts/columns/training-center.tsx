import { ArtifactType } from "../types";
import defaultColumns from "./default";
import { ColumnStrategyType } from "./types";
import { getBuildingCheckinUserColumns, getPayrollUserColumns, getHrUserColumns } from "./fragments";
import { customColumnDef } from "./types";
import { DEFAULT_COURSE_FIELDS } from "@/types/course";

const trainingCenterColumns: ColumnStrategyType = {
  artifact: ArtifactType.COLUMNS,
  name: "training-center",
  getColumns: (entityName: string, tenant?: any) => {
    let column = defaultColumns.getColumns(entityName);

    if (entityName === "courses" && column.length > 0) {
      const allColumns = column as customColumnDef<any, any>[];
      const byKey = new Map(allColumns.map((c) => [c.accessorKey, c]));
      const courseFields = [...DEFAULT_COURSE_FIELDS];
      const idCol = byKey.get("id");
      const ordered = courseFields
        .map((k: string) => byKey.get(k))
        .filter(Boolean) as customColumnDef<any, any>[];
      column = idCol ? [idCol, ...ordered] : ordered;
      const existingKeys = new Set(column.map((c) => c.accessorKey));
      for (const key of ["schedule", "primary_teacher"] as const) {
        const col = byKey.get(key);
        if (col && !existingKeys.has(key)) {
          column = [...column, col];
          existingKeys.add(key);
        }
      }
    }

    if (entityName === "users" && tenant) {
      const extras = [] as customColumnDef<any, any>[];

      if (tenant.is_building_checkin_enabled) {
        extras.push(...getBuildingCheckinUserColumns());
      }
      if (tenant.is_payroll_calculation_enabled) {
        extras.push(...getPayrollUserColumns());
      }
      if (tenant.is_hr_fields_enabled) {
        extras.push(...getHrUserColumns());
      }

      const existing = new Set(column.map((c) => c.accessorKey));
      const unique = extras.filter((c) => !existing.has(c.accessorKey));
      column = [...column, ...unique];
    }

    return column;
  },
};

export default trainingCenterColumns;

