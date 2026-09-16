import { describe, expect, it } from "vitest";

import { parseStudentEmailPaste } from "./parse-student-email-paste";

describe("parseStudentEmailPaste", () => {
  it("splits on newlines and trims", () => {
    expect(parseStudentEmailPaste("a@x.com\n b@y.com ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("splits tab-separated single-column Excel paste", () => {
    expect(parseStudentEmailPaste("a@x.com\tb@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("dedupes case-insensitively keeping first casing", () => {
    expect(parseStudentEmailPaste("A@X.com\na@x.com\nB@y.com")).toEqual([
      "A@X.com",
      "B@y.com",
    ]);
  });

  it("ignores empty lines", () => {
    expect(parseStudentEmailPaste("a@x.com\n\n\n")).toEqual(["a@x.com"]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(parseStudentEmailPaste("  \n  ")).toEqual([]);
  });
});
