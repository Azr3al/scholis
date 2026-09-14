import { describe, expect, it, vi } from "vitest";
import {
  awardPngFileName,
  awardsZipFileName,
  collectAwardPngs,
} from "./award-download";

describe("award download helpers", () => {
  it("sanitizes png and zip names", () => {
    expect(
      awardPngFileName({
        studentName: "Hla Hla",
        titleName: "Top 1",
        periodKey: "2026-8",
      }),
    ).toBe("hla-hla_top-1_2026-8.png");
    expect(awardsZipFileName("IG 19", "overall")).toBe(
      "ig-19-awards-overall.zip",
    );
  });

  it("omits grants without display_template", async () => {
    const composite = vi.fn();
    const result = await collectAwardPngs(
      [
        {
          studentName: "A",
          titleName: "Local",
          periodKey: "overall",
          display_template: null,
        },
      ],
      composite,
    );
    expect(result).toEqual({ ok: true, files: [] });
    expect(composite).not.toHaveBeenCalled();
  });

  it("returns ok false and no files when any composite fails", async () => {
    const composite = vi
      .fn()
      .mockResolvedValueOnce("data:image/png;base64,aaa")
      .mockRejectedValueOnce(new Error("boom"));
    const tmpl = { id: 1, name: "T", document: {}, background_url: null };
    const result = await collectAwardPngs(
      [
        {
          studentName: "A",
          titleName: "Top 1",
          periodKey: "overall",
          display_template: tmpl,
        },
        {
          studentName: "B",
          titleName: "Top 1",
          periodKey: "overall",
          display_template: tmpl,
        },
      ],
      composite,
    );
    expect(result.ok).toBe(false);
    expect(result).toEqual({ ok: false });
  });
});
