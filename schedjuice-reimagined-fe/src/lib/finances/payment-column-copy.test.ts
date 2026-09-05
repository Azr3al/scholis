import { describe, expect, it } from "vitest";

import {
  paymentAmountValuesForCopy,
  paymentStudentSlotsForCopy,
} from "./payment-column-copy";

describe("paymentAmountValuesForCopy", () => {
  it("skips group_part rows", () => {
    expect(
      paymentAmountValuesForCopy([
        { parsed_amount: "1000", __flatKind: "group_parent" },
        { parsed_amount: "500", __flatKind: "group_part" },
        { parsed_amount: "2000", __flatKind: "standalone" },
      ]),
    ).toEqual(["1000", "2000"]);
  });

  it("returns raw numeric strings", () => {
    expect(
      paymentAmountValuesForCopy([
        { parsed_amount: "215000" },
        { parsed_amount: "500.5" },
      ]),
    ).toEqual(["215000", "500.5"]);
  });

  it("uses empty string for missing amounts", () => {
    expect(
      paymentAmountValuesForCopy([
        { parsed_amount: null },
        { parsed_amount: "" },
        { parsed_amount: undefined },
      ]),
    ).toEqual(["", "", ""]);
  });
});

describe("paymentStudentSlotsForCopy", () => {
  it("skips group_part rows", () => {
    expect(
      paymentStudentSlotsForCopy([
        {
          user: { id: 1, name: "A", email: "a@x" },
          __flatKind: "group_parent",
        },
        {
          user: { id: 1, name: "A", email: "a@x" },
          __flatKind: "group_part",
        },
        {
          user: { id: 2, name: "B", email: "b@x" },
          __flatKind: "standalone",
        },
      ]),
    ).toEqual([
      { userId: 1, name: "A", email: "a@x" },
      { userId: 2, name: "B", email: "b@x" },
    ]);
  });
});
