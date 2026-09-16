import { describe, expect, it } from "vitest";

import {
  filterLeads,
  leadFieldText,
  type LeadTextContext,
} from "./leads-table";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";

const source: LeadSource = { id: 7, name: "Facebook", is_active: true };
const status: LeadStatus = {
  id: 3,
  name: "Contacted",
  color: "#22c55e",
  order: 1,
  behavior: "NORMAL",
  is_default: false,
};

const ctx: LeadTextContext = {
  sourceById: { 7: source },
  statusById: { 3: status },
};

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 1,
    name: "Jane Doe",
    phone: "0912",
    email: "jane@x.com",
    facebook_link: "",
    interested_in: "IELTS",
    note: "",
    source: 7,
    status: 3,
    assignee: null,
    created_by: null,
    converted_user: null,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("leadFieldText", () => {
  it("resolves source and status by id", () => {
    const l = baseLead();
    expect(leadFieldText(l, "source", ctx)).toBe("Facebook");
    expect(leadFieldText(l, "status", ctx)).toBe("Contacted");
  });
  it("resolves source and status from expanded objects", () => {
    const l = baseLead({ source, status });
    expect(leadFieldText(l, "source", ctx)).toBe("Facebook");
    expect(leadFieldText(l, "status", ctx)).toBe("Contacted");
  });
  it("shows an em dash for a missing assignee", () => {
    expect(leadFieldText(baseLead(), "assignee", ctx)).toBe("—");
  });
  it("uses the expanded assignee name when present", () => {
    const l = baseLead({
      assignee: { id: 2, name: "Aung", email: "a@x.com" } as unknown as number,
    });
    expect(leadFieldText(l, "assignee", ctx)).toBe("Aung");
  });
  it("shows an em dash when there is no appointment", () => {
    expect(leadFieldText(baseLead(), "next_appointment", ctx)).toBe("—");
  });
});

describe("filterLeads", () => {
  const leads = [
    baseLead({ id: 1, name: "Jane Doe", phone: "0912", email: "jane@x.com" }),
    baseLead({ id: 2, name: "Bob Lin", phone: "0700", email: "bob@y.com" }),
  ];
  it("returns all when query is blank", () => {
    expect(filterLeads(leads, "  ")).toHaveLength(2);
  });
  it("matches name, phone, or email case-insensitively", () => {
    expect(filterLeads(leads, "jane").map((l) => l.id)).toEqual([1]);
    expect(filterLeads(leads, "0700").map((l) => l.id)).toEqual([2]);
    expect(filterLeads(leads, "Y.COM").map((l) => l.id)).toEqual([2]);
  });
});
