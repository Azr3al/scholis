import { describe, expect, it } from "vitest";
import { formatGoogleCalendarAccountLabel } from "@/lib/consultation/google-calendar-copy";

describe("formatGoogleCalendarAccountLabel", () => {
  it("returns null when calendar is not connected", () => {
    expect(
      formatGoogleCalendarAccountLabel({
        connected: false,
        authorized_email: "",
        authorized_display_name: "",
      }),
    ).toBeNull();
  });

  it("prefers name and email when both differ", () => {
    expect(
      formatGoogleCalendarAccountLabel({
        connected: true,
        authorized_email: "teacher@gmail.com",
        authorized_display_name: "Teacher Name",
      }),
    ).toBe("Teacher Name (teacher@gmail.com)");
  });

  it("falls back to email only", () => {
    expect(
      formatGoogleCalendarAccountLabel({
        connected: true,
        authorized_email: "teacher@gmail.com",
        authorized_display_name: "",
      }),
    ).toBe("teacher@gmail.com");
  });
});
