import { describe, expect, it } from "vitest";
import {
  formatAbsenceListCopy,
  formatAbsenceListDate,
} from "./format-absence-list-copy";

describe("formatAbsenceListDate", () => {

  it("returns the input when not a ymd string", () => {
    expect(formatAbsenceListDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatAbsenceListCopy", () => {
  it("formats class name, date, present summary, and student bullets", () => {
    expect(
      formatAbsenceListCopy({
        className: "Class Meeting",
        dateYmd: "2026-07-18",
        presentCount: 9,
        totalCount: 12,
        presentPercent: 75,
        studentNames: ["Eant Htoo Thaw", "Ei Yamone Phoo"],
      }),
    ).toBe(
      [
        "Class Meeting 18/07/2026",
        "9 out of 12 (75%)",
        "absent list",
        "- Eant Htoo Thaw",
        "- Ei Yamone Phoo",
      ].join("\n"),
    );
  });

  it("includes present summary when nobody is absent", () => {
    expect(
      formatAbsenceListCopy({
        className: "Class Meeting",
        dateYmd: "2026-07-18",
        presentCount: 12,
        totalCount: 12,
        presentPercent: 100,
        studentNames: [],
      }),
    ).toBe(
      ["Class Meeting 18/07/2026", "12 out of 12 (100%)", "absent list"].join(
        "\n",
      ),
    );
  });
});
