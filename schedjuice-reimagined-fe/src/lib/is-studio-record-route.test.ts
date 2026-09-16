import { describe, expect, it } from "vitest";
import { isStudioRecordRoute } from "./is-studio-record-route";

describe("isStudioRecordRoute", () => {
  it("matches studio library and award-title routes", () => {
    expect(isStudioRecordRoute("/studio")).toBe(true);
    expect(isStudioRecordRoute("/award-titles")).toBe(true);
    expect(isStudioRecordRoute("/award-titles/create")).toBe(true);
    expect(isStudioRecordRoute("/award-titles/3/edit")).toBe(true);
  });

  it("rejects the fullscreen document editor, award template editor, and unrelated routes", () => {
    expect(isStudioRecordRoute("/templates/document/1")).toBe(false);
    expect(isStudioRecordRoute("/award-titles/3/certificate")).toBe(false);
    expect(isStudioRecordRoute("/documents")).toBe(false);
    expect(isStudioRecordRoute("/finances")).toBe(false);
    expect(isStudioRecordRoute("/studiox")).toBe(false);
  });
});
