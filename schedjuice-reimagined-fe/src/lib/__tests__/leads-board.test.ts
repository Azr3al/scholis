import { describe, it, expect } from "vitest";
import { groupLeadsByStatus, applyOptimisticMove } from "@/lib/leads-board";
import type { Lead, LeadStatus } from "@/types/lead";
import { leadStatusId } from "@/types/lead";

const statuses: LeadStatus[] = [
  {
    id: 1,
    name: "New",
    color: "#000",
    order: 1,
    behavior: "NORMAL",
    is_default: true,
  },
  {
    id: 2,
    name: "Contacted",
    color: "#000",
    order: 2,
    behavior: "NORMAL",
    is_default: false,
  },
];

const leads: Lead[] = [
  {
    id: 10,
    name: "A",
    status: 1,
    source: 1,
    assignee: null,
    converted_user: null,
    phone: "",
    email: "",
    facebook_link: "",
    interested_in: "",
    note: "",
    created_by: null,
  },
  {
    id: 11,
    name: "B",
    status: 2,
    source: 1,
    assignee: null,
    converted_user: null,
    phone: "",
    email: "",
    facebook_link: "",
    interested_in: "",
    note: "",
    created_by: null,
  },
];

describe("leads-board", () => {
  it("groups leads by status id", () => {
    const grouped = groupLeadsByStatus(leads, statuses);
    expect(grouped[1].map((l) => l.id)).toEqual([10]);
    expect(grouped[2].map((l) => l.id)).toEqual([11]);
  });

  it("optimistically moves a lead to a new status", () => {
    const next = applyOptimisticMove(leads, 10, 2);
    expect(leadStatusId(next.find((l) => l.id === 10)!)).toBe(2);
    expect(leadStatusId(next.find((l) => l.id === 11)!)).toBe(2);
  });
});
