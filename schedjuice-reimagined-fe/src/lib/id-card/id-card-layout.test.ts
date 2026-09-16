import { describe, expect, it } from "vitest";
import {
  computeIdCardLayout,
  MAX_PANEL_TOP,
  PANEL_HEIGHT,
} from "./id-card-layout";
import type { CardViewModel } from "./types";

function baseVm(overrides: Partial<CardViewModel> = {}): CardViewModel {
  return {
    name: "Ah Mad",
    email: "ahmad@sdecedu.com",
    roleLabel: "Student",
    role: "student",
    accent: "#d97706",
    photoUrl: null,
    initials: "AM",
    orgName: "SDEC International School",
    orgLogoUrl: null,
    bloodType: null,
    emergency: null,
    verifyToken: "token",
    verifyCode: null,
    studentId: null,
    className: null,
    courseTitle: null,
    expiresOn: null,
    ...overrides,
  };
}

function lastContentY(layout: ReturnType<typeof computeIdCardLayout>): number {
  return layout.bloodY ?? layout.emailY;
}

describe("computeIdCardLayout", () => {

  it("avoids overlap when student has ID, class, and blood type", () => {
    const layout = computeIdCardLayout(
      baseVm({
        studentId: "S001",
        className: "Year 5",
        bloodType: "O+",
      }),
    );
    expect(lastContentY(layout)).toBeLessThan(layout.panelTopY);
    expect(layout.panelTopY).toBeLessThanOrEqual(MAX_PANEL_TOP);
    expect(layout.panelTopY + PANEL_HEIGHT).toBeLessThanOrEqual(860 - 16);
  });

});
