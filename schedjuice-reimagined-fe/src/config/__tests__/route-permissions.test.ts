import { describe, it, expect } from "vitest";
import { ruleForPath } from "../route-permissions";

describe("ruleForPath", () => {
  it("picks the LONGEST matching prefix (/finances/make-payment, not /finances)", () => {
    const rule = ruleForPath("/finances/make-payment");
    expect(rule?.prefix).toBe("/finances/make-payment");
    expect(rule?.anyOf).toEqual(["payment.make"]);
  });

  it("resolves /finances itself to the broad finances rule", () => {
    expect(ruleForPath("/finances")?.prefix).toBe("/finances");
    expect(ruleForPath("/finances")?.anyOf).toEqual([
      "payment.view_all",
      "payment.view",
      "payment.record",
      "payment.view_unpaid",
      "payment.view_unpaid_all",
      "analytics.view",
    ]);
  });

  it("resolves /finances/student-payments to staff payment permissions only", () => {
    const rule = ruleForPath("/finances/student-payments");
    expect(rule?.prefix).toBe("/finances/student-payments");
    expect(rule?.anyOf).toEqual(["payment.view_all", "payment.record"]);
  });

  it("resolves course student-payments to staff payment permissions", () => {
    const rule = ruleForPath("/courses/42/student-payments");
    expect(rule?.prefix).toBe("/courses");
    expect(rule?.suffix).toBe("student-payments");
    expect(rule?.anyOf).toEqual(["payment.view_all", "payment.record"]);
  });

  it("resolves generic course paths to course.view", () => {
    const rule = ruleForPath("/courses/42");
    expect(rule?.prefix).toBe("/courses");
    expect(rule?.suffix).toBeUndefined();
    expect(rule?.anyOf).toEqual(["course.view"]);
  });

  it("resolves /finances/payroll to the payroll rule (not /finances)", () => {
    const rule = ruleForPath("/finances/payroll");
    expect(rule?.prefix).toBe("/finances/payroll");
    expect(rule?.anyOf).toEqual(["payroll.view_all", "payroll.view"]);
  });

  it("resolves deep payroll paths to the payroll rule", () => {
    expect(ruleForPath("/finances/payroll/details")?.prefix).toBe(
      "/finances/payroll",
    );
  });

  it("resolves /internal tools under /internal prefix", () => {
    const rule = ruleForPath("/internal/cron-jobs");
    expect(rule?.prefix).toBe("/internal");
    expect(rule?.anyOf).toEqual(["org.manage_all"]);
  });

  it("resolves /platform/usage for ai.usage.view or billing.manage", () => {
    const rule = ruleForPath("/platform/usage");
    expect(rule?.prefix).toBe("/platform/usage");
    expect(rule?.anyOf).toEqual(["ai.usage.view", "billing.manage"]);
  });

  it("returns undefined for an unmapped internal path (so the guard allows it)", () => {
    expect(ruleForPath("/totally-unmapped-route")).toBeUndefined();
    expect(ruleForPath("/library")).toBeUndefined();
  });

  it("does not match on partial path segments (/newsletter is not /news)", () => {
    expect(ruleForPath("/newsletter")).toBeUndefined();
  });

  it("marks public / authed-only rules and leaves them without anyOf", () => {
    expect(ruleForPath("/login")?.public).toBe(true);
    expect(ruleForPath("/profile")?.authedOnly).toBe(true);
    expect(ruleForPath("/profile")?.anyOf).toBeUndefined();
    expect(ruleForPath("/help")?.authedOnly).toBe(true);
  });

  it("resolves /platform/docs for docs CMS permissions", () => {
    const rule = ruleForPath("/platform/docs/new");
    expect(rule?.prefix).toBe("/platform/docs");
    expect(rule?.anyOf).toEqual(["docs.view", "docs.manage"]);
  });

  it("resolves /organizations/profile for org.configure or ai.usage.view", () => {
    const rule = ruleForPath("/organizations/profile");
    expect(rule?.prefix).toBe("/organizations/profile");
    expect(rule?.anyOf).toEqual(["org.configure", "ai.usage.view"]);
  });

  it("resolves org detail paths via organizations rule", () => {
    const rule = ruleForPath("/organizations/42");
    expect(rule?.prefix).toBe("/organizations");
    expect(rule?.anyOf).toEqual(["org.manage_all"]);
  });

  it("resolves CRM settings before board routes", () => {
    expect(ruleForPath("/crm/leads/settings")?.prefix).toBe("/crm/leads/settings");
    expect(ruleForPath("/crm/leads/settings")?.anyOf).toEqual(["crm.configure"]);
    expect(ruleForPath("/crm/leads")?.prefix).toBe("/crm/leads");
    expect(ruleForPath("/crm/leads")?.anyOf).toEqual(["lead.view"]);
    expect(ruleForPath("/crm/issues/settings")?.prefix).toBe(
      "/crm/issues/settings",
    );
    expect(ruleForPath("/crm/issues/settings")?.anyOf).toEqual([
      "issue.configure",
    ]);
    expect(ruleForPath("/crm/issues")?.prefix).toBe("/crm/issues");
    expect(ruleForPath("/crm/issues")?.anyOf).toEqual(["issue.view"]);
  });

  it("resolves /templates/award for award_title.manage", () => {
    const rule = ruleForPath("/templates/award/12");
    expect(rule?.prefix).toBe("/templates/award");
    expect(rule?.anyOf).toEqual(["award_title.manage"]);
  });

  it("resolves studio library to either Studio permission and keeps the editor on document_template.manage", () => {
    expect(ruleForPath("/studio")?.anyOf).toEqual([
      "document_template.manage",
      "award_title.manage",
    ]);
    expect(ruleForPath("/documents")).toBeUndefined();
    expect(ruleForPath("/templates/document/1")?.anyOf).toEqual([
      "document_template.manage",
    ]);
  });

  it("gates admissions desk on admissions.view", () => {
    expect(ruleForPath("/admissions")?.anyOf).toEqual(["admissions.view"]);
    expect(ruleForPath("/admissions/courses")?.anyOf).toEqual([
      "admissions.view",
    ]);
  });

  it("resolves student complaints routes", () => {
    expect(ruleForPath("/complaints/new")?.prefix).toBe("/complaints/new");
    expect(ruleForPath("/complaints/new")?.anyOf).toEqual(["complaint.create"]);
    expect(ruleForPath("/complaints")?.prefix).toBe("/complaints");
    expect(ruleForPath("/complaints")?.anyOf).toEqual(["complaint.view_own"]);
    expect(ruleForPath("/complaints/42")?.prefix).toBe("/complaints");
    expect(ruleForPath("/complaints/42")?.anyOf).toEqual(["complaint.view_own"]);
  });
});
