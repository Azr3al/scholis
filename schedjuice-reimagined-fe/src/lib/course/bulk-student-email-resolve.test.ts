import { describe, expect, it } from "vitest";

import {
  classifyBulkStudentRows,
  summarizeBulkStudentRows,
  type BulkStudentSearchHit,
} from "./bulk-student-email-resolve";

const alice: BulkStudentSearchHit = {
  id: 1,
  email: "alice@school.com",
  name: "Alice",
  microsoft_id: "ms-1",
};

const bobUnlinked: BulkStudentSearchHit = {
  id: 2,
  email: "bob@school.com",
  name: "Bob",
  microsoft_id: null,
};

describe("classifyBulkStudentRows", () => {

  it("marks unlinked student as needs_ms_link when MS required", () => {
    const rows = classifyBulkStudentRows({
      emails: ["bob@school.com"],
      hitsByEmail: new Map([["bob@school.com", bobUnlinked]]),
      rosterEmails: new Set<string>(),
      requiresMsLink: true,
    });
    expect(rows[0].status).toBe("needs_ms_link");
  });

  it("marks email on roster as already_on_roster", () => {
    const rows = classifyBulkStudentRows({
      emails: ["alice@school.com"],
      hitsByEmail: new Map([["alice@school.com", alice]]),
      rosterEmails: new Set(["alice@school.com"]),
      requiresMsLink: false,
    });
    expect(rows[0].status).toBe("already_on_roster");
  });

  it("marks unknown email as not_found", () => {
    const rows = classifyBulkStudentRows({
      emails: ["ghost@school.com"],
      hitsByEmail: new Map(),
      rosterEmails: new Set<string>(),
      requiresMsLink: false,
    });
    expect(rows[0].status).toBe("not_found");
  });

  it("marks second paste occurrence as duplicate", () => {
    const rows = classifyBulkStudentRows({
      emails: ["alice@school.com", "alice@school.com"],
      hitsByEmail: new Map([["alice@school.com", alice]]),
      rosterEmails: new Set<string>(),
      requiresMsLink: false,
    });
    expect(rows[0].status).toBe("ready");
    expect(rows[1].status).toBe("duplicate");
  });
});

describe("summarizeBulkStudentRows", () => {
  it("counts statuses and ready users", () => {
    const rows = classifyBulkStudentRows({
      emails: ["alice@school.com", "ghost@school.com"],
      hitsByEmail: new Map([["alice@school.com", alice]]),
      rosterEmails: new Set<string>(),
      requiresMsLink: false,
    });
    const summary = summarizeBulkStudentRows(rows);
    expect(summary.ready).toBe(1);
    expect(summary.notFound).toBe(1);
    expect(summary.readyUsers).toHaveLength(1);
    expect(summary.readyUsers[0].id).toBe(1);
  });
});
