import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RecurringSlotsEditor,
  recurringSlotsEditorValid,
} from "./recurring-slots-editor";

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { timezone: "Asia/Yangon" } }),
}));

describe("RecurringSlotsEditor overnight", () => {
  it("requires confirmation for long overnight spans", () => {
    const slots = [{ weekday: "Mon", time_from: "20:00", time_to: "06:00" }];
    expect(recurringSlotsEditorValid(slots)).toBe(false);
    expect(
      recurringSlotsEditorValid(slots, { overnightConfirmedByIndex: { 0: true } }),
    ).toBe(true);
  });

  it("shows overnight hint for short overnight slot", () => {
    render(
      <RecurringSlotsEditor
        slots={[{ weekday: "Mon", time_from: "22:30", time_to: "00:00" }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/ends next day/i)).toBeTruthy();
  });
});
