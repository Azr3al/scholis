import { describe, expect, it } from "vitest";

import { resolveStatusChange } from "./leads-board";
import type { Lead, LeadStatus } from "@/types/lead";

function status(id: number, behavior: LeadStatus["behavior"]): LeadStatus {
  return {
    id,
    name: `S${id}`,
    color: "#888888",
    order: id,
    behavior,
    is_default: false,
  };
}

function lead(statusId: number): Lead {
  return {
    id: 1,
    name: "Test",
    phone: "",
    email: "",
    facebook_link: "",
    interested_in: "",
    note: "",
    source: 1,
    status: statusId,
    assignee: null,
    created_by: null,
    converted_user: null,
  };
}

describe("resolveStatusChange", () => {
  it("noop when moving to the same status", () => {
    expect(resolveStatusChange(lead(5), status(5, "NORMAL"))).toEqual({
      kind: "noop",
    });
  });
  it("appointment behavior opens the appointment flow", () => {
    expect(resolveStatusChange(lead(1), status(2, "APPOINTMENT"))).toEqual({
      kind: "appointment",
    });
  });
  it("converted behavior opens the convert flow", () => {
    expect(resolveStatusChange(lead(1), status(3, "CONVERTED"))).toEqual({
      kind: "convert",
    });
  });
  it("normal/lost behavior just moves", () => {
    expect(resolveStatusChange(lead(1), status(4, "NORMAL"))).toEqual({
      kind: "move",
    });
    expect(resolveStatusChange(lead(1), status(5, "LOST"))).toEqual({
      kind: "move",
    });
  });
});
