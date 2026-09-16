import { describe, expect, it } from "vitest";
import { shouldConfirmClose } from "./should-confirm-close";

describe("shouldConfirmClose", () => {
  it("confirms only when dirty and the user has not accepted", () => {
    expect(shouldConfirmClose({ dirty: true, userAccepted: false })).toBe(true);
    expect(shouldConfirmClose({ dirty: true, userAccepted: true })).toBe(false);
    expect(shouldConfirmClose({ dirty: false, userAccepted: false })).toBe(false);
  });
});
