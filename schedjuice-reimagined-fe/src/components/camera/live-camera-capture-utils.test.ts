import { describe, expect, it } from "vitest";
import { mapGetUserMediaError } from "./live-camera-capture-utils";

describe("mapGetUserMediaError", () => {
  it("maps permission errors to denied", () => {
    expect(
      mapGetUserMediaError(new DOMException("denied", "NotAllowedError")),
    ).toBe("denied");
    expect(
      mapGetUserMediaError(
        new DOMException("denied", "PermissionDeniedError"),
      ),
    ).toBe("denied");
  });

  it("maps other errors to failed", () => {
    expect(mapGetUserMediaError(new Error("device missing"))).toBe("failed");
  });
});
