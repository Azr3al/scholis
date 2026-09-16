import {
  GridCellKind,
  type CustomCell,
  type CustomRenderer,
} from "@glideapps/glide-data-grid";

import { chipAdvanceWidth, drawChip } from "@/components/import-grid/cells/draw-helpers";
import { getActiveFontPx } from "@/components/import-grid/glide-theme";

export type CourseChip = { id: number; title: string };

export type CourseChipsLayout = "inline" | "stack";

export type CourseChipsCellData = {
  kind: "course-chips-cell";
  courses: CourseChip[];
  layout?: CourseChipsLayout;
};

export type CourseChipsCell = CustomCell<CourseChipsCellData>;

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

function chipHeight(): number {
  const px = getActiveFontPx();
  return Math.max(16, Math.round(px * 1.45));
}

function stackGap(): number {
  return 8;
}

/** Layout of chips from the cell content left edge (before horizontal padding). */
export function measureCourseChips(
  titles: string[],
): { start: number; width: number }[] {
  const ctx = getMeasureCtx();
  if (!ctx) return [];
  let x = 0;
  return titles.map((title) => {
    const start = x;
    const advance = chipAdvanceWidth(ctx, title);
    const width = advance - 6;
    x += advance;
    return { start, width };
  });
}

export function findCourseChipIndex(
  titles: string[],
  localEventX: number,
  cellHorizontalPadding: number,
): number {
  const rel = localEventX - cellHorizontalPadding;
  const layout = measureCourseChips(titles);
  return layout.findIndex(
    (segment) => rel >= segment.start && rel <= segment.start + segment.width,
  );
}

export function measureStackedCourseChips(
  count: number,
  cellHeight: number,
): { start: number; height: number }[] {
  if (count <= 0) return [];
  const h = chipHeight();
  const gap = stackGap();
  const totalH = count * h + (count - 1) * gap;
  let y = (cellHeight - totalH) / 2;
  return Array.from({ length: count }, () => {
    const start = y;
    y += h + gap;
    return { start, height: h };
  });
}

export function findStackedCourseChipIndex(
  count: number,
  localEventY: number,
  cellHeight: number,
): number {
  const layout = measureStackedCourseChips(count, cellHeight);
  return layout.findIndex(
    (segment) =>
      localEventY >= segment.start && localEventY <= segment.start + segment.height,
  );
}

export const courseChipsRenderer: CustomRenderer<CourseChipsCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is CourseChipsCell =>
    c.kind === GridCellKind.Custom &&
    (c.data as CourseChipsCellData)?.kind === "course-chips-cell",
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    const courses = cell.data.courses;
    if (courses.length === 0) return;

    if (cell.data.layout === "stack") {
      const h = chipHeight();
      const gap = stackGap();
      const totalH = courses.length * h + (courses.length - 1) * gap;
      let y = rect.y + (rect.height - totalH) / 2;
      const x = rect.x + theme.cellHorizontalPadding;
      for (const course of courses) {
        drawChip(ctx, x, y, course.title, {});
        y += h + gap;
      }
      return;
    }

    let x = rect.x + theme.cellHorizontalPadding;
    const cy = rect.y + rect.height / 2;
    for (const course of courses) {
      x += drawChip(ctx, x, cy - 10, course.title, {});
    }
  },
};
