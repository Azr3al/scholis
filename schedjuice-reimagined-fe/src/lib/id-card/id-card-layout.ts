import { CARD_VIEWBOX } from "./dimensions";
import type { CardViewModel } from "./types";

const ROLE_PILL_BOTTOM = 540;
export const PANEL_HEIGHT = 200;
const BOTTOM_STRIP = 16;
export const MAX_PANEL_TOP =
  CARD_VIEWBOX.height - BOTTOM_STRIP - PANEL_HEIGHT;

/** Horizontal center of the text area beside the QR code inside the footer panel. */
export const PANEL_TEXT_CENTER_X = 352;

export type DetailRow = { label: string; value: string };

type IdCardLayout = {
  detailRows: DetailRow[];
  detailRowYs: number[];
  emailY: number;
  bloodY: number | null;
  panelTopY: number;
  panelHeight: number;
  qrBoxY: number;
  qrImageY: number;
  verifyHeadingY: number;
  verifyLine1Y: number;
  verifyLine2Y: number;
  emergencyHeadingY: number;
  emergencyPhoneY: number;
  emergencyNameY: number;
};

type GapConfig = {
  afterRole: number;
  lineHeight: number;
  rowsToEmail: number;
  emailToBlood: number;
  beforePanel: number;
};

const DEFAULT_GAPS: GapConfig = {
  afterRole: 20,
  lineHeight: 26,
  rowsToEmail: 12,
  emailToBlood: 28,
  beforePanel: 20,
};

const COMPRESSED_GAPS: GapConfig[] = [
  { afterRole: 20, lineHeight: 26, rowsToEmail: 12, emailToBlood: 28, beforePanel: 12 },
  { afterRole: 16, lineHeight: 24, rowsToEmail: 8, emailToBlood: 24, beforePanel: 8 },
  { afterRole: 12, lineHeight: 22, rowsToEmail: 6, emailToBlood: 22, beforePanel: 4 },
];

function buildDetailRows(vm: CardViewModel): DetailRow[] {
  const rows: DetailRow[] = [];
  if (vm.studentId) rows.push({ label: "ID", value: vm.studentId });
  if (vm.className) rows.push({ label: "Class", value: vm.className });
  if (vm.courseTitle) rows.push({ label: "Course", value: vm.courseTitle });
  return rows;
}

function computeWithGaps(
  vm: CardViewModel,
  rows: DetailRow[],
  gaps: GapConfig,
): Omit<IdCardLayout, "panelHeight"> & { panelTopY: number } {
  const detailStartY = ROLE_PILL_BOTTOM + gaps.afterRole;
  const detailRowYs = rows.map((_, index) => detailStartY + index * gaps.lineHeight);

  const emailY =
    rows.length > 0
      ? detailStartY + rows.length * gaps.lineHeight + gaps.rowsToEmail
      : ROLE_PILL_BOTTOM + 24;

  const bloodY = vm.bloodType ? emailY + gaps.emailToBlood : null;
  const lastContentY = bloodY ?? emailY;
  const panelTopY = lastContentY + gaps.beforePanel;

  const verifyCenterY = panelTopY + PANEL_HEIGHT / 2 + 6;
  const emergencyCenterY = panelTopY + PANEL_HEIGHT / 2;

  return {
    detailRows: rows,
    detailRowYs,
    emailY,
    bloodY,
    panelTopY,
    qrBoxY: panelTopY + 16,
    qrImageY: panelTopY + 24,
    verifyHeadingY: verifyCenterY - 30,
    verifyLine1Y: verifyCenterY + 2,
    verifyLine2Y: verifyCenterY + 28,
    emergencyHeadingY: emergencyCenterY - 44,
    emergencyPhoneY: emergencyCenterY - 8,
    emergencyNameY: emergencyCenterY + 28,
  };
}

/** Compute vertical positions for optional detail rows, email, blood type, and QR panel. */
export function computeIdCardLayout(vm: CardViewModel): IdCardLayout {
  const rows = buildDetailRows(vm);

  for (const gaps of [DEFAULT_GAPS, ...COMPRESSED_GAPS]) {
    const layout = computeWithGaps(vm, rows, gaps);
    if (layout.panelTopY <= MAX_PANEL_TOP) {
      return { ...layout, panelHeight: PANEL_HEIGHT };
    }
  }

  const fallback = computeWithGaps(vm, rows, COMPRESSED_GAPS[COMPRESSED_GAPS.length - 1]);
  return {
    ...fallback,
    panelTopY: MAX_PANEL_TOP,
    panelHeight: PANEL_HEIGHT,
    qrBoxY: MAX_PANEL_TOP + 16,
    qrImageY: MAX_PANEL_TOP + 24,
    verifyHeadingY: MAX_PANEL_TOP + 72,
    verifyLine1Y: MAX_PANEL_TOP + 106,
    verifyLine2Y: MAX_PANEL_TOP + 132,
    emergencyHeadingY: MAX_PANEL_TOP + 56,
    emergencyPhoneY: MAX_PANEL_TOP + 90,
    emergencyNameY: MAX_PANEL_TOP + 120,
  };
}
