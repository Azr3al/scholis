import { describe, expect, it } from "vitest";

import {
  isComplaintClosed,
  resolveOpenStatusIdFromIssues,
} from "@/lib/complaints/complaint-status";
import type { Issue, IssueStatus } from "@/types/issue";
import { IssueSource } from "@/types/issue";

function issueWithStatus(status: IssueStatus): Issue {
  return {
    id: 1,
    title: "Parent complaint — Student",
    description: "Help",
    source: IssueSource.ParentComplaint,
    status,
    assignee: null,
    created_by: null,
    related_student: null,
    related_course: null,
  };
}

describe("isComplaintClosed", () => {
  it("returns false for open statuses", () => {
    const issue = issueWithStatus({
      id: 1,
      name: "Open",
      color: "#64748b",
      order: 0,
      behavior: "NORMAL",
      is_default: true,
    });
    expect(isComplaintClosed(issue)).toBe(false);
  });

  it("returns true for done and cancelled", () => {
    const done = issueWithStatus({
      id: 2,
      name: "Done",
      color: "#16a34a",
      order: 2,
      behavior: "DONE",
      is_default: false,
    });
    const cancelled = issueWithStatus({
      id: 3,
      name: "Cancelled",
      color: "#94a3b8",
      order: 3,
      behavior: "CANCELLED",
      is_default: false,
    });
    expect(isComplaintClosed(done)).toBe(true);
    expect(isComplaintClosed(cancelled)).toBe(true);
  });
});

describe("resolveOpenStatusIdFromIssues", () => {
  it("returns default open status id", () => {
    const openStatus: IssueStatus = {
      id: 10,
      name: "Open",
      color: "#64748b",
      order: 0,
      behavior: "NORMAL",
      is_default: true,
    };
    const id = resolveOpenStatusIdFromIssues([issueWithStatus(openStatus)]);
    expect(id).toBe(10);
  });
});
