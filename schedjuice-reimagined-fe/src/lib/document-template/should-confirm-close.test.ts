import { describe, expect, it } from "vitest";
import { shouldConfirmClose } from "./should-confirm-close";

describe("shouldConfirmClose", () => {
  it("confirms Back when dirty and not accepted", () => {
    expect(shouldConfirmClose({ dirty: true, userAccepted: false })).toBe(true);
    expect(shouldConfirmClose({ dirty: true, userAccepted: true })).toBe(false);
  });
});
