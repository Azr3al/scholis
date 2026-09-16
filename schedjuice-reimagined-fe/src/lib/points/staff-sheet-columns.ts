import type { GridColumn } from "@glideapps/glide-data-grid";
import type { PointType } from "@/types/points";

const FIXED: GridColumn[] = [
  { id: "name", title: "Name", width: 200 },
  { id: "email", title: "Email", width: 220 },
  { id: "roles", title: "Roles", width: 160 },
];

export function buildStaffPointsColumns(pointTypes: PointType[]): GridColumn[] {
  const dynamic = pointTypes
    .filter((pt) => pt.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((pt) => ({
      id: `pt_${pt.id}`,
      title: pt.name,
      width: 100,
    }));
  return [...FIXED, ...dynamic];
}

export function cellText(
  row: {
    name: string;
    email: string;
    roles: string[];
    balances: Record<string, number>;
  },
  colId: string,
): string {
  if (colId === "name") return row.name;
  if (colId === "email") return row.email;
  if (colId === "roles") return row.roles.join(", ");
  if (colId.startsWith("pt_")) {
    const id = colId.slice(3);
    const v = row.balances[id];
    return v == null ? "0" : String(v);
  }
  return "";
}
