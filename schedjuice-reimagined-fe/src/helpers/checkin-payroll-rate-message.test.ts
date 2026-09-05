import { describe, expect, it } from "vitest";
import {
  getPayrollRateMissingMessage,
  PAYROLL_RATE_MISSING_MESSAGE_ADMIN,
  PAYROLL_RATE_MISSING_MESSAGE_TEACHER,
  resolvePayrollRateMissingMessage,
} from "@/helpers/checkin-payroll-rate-message";
import { accountType, role } from "@/types/user";

function userWithRoles(roles: role[]): accountType {
  return { id: 1, roles } as accountType;
}

describe("getPayrollRateMissingMessage", () => {
  it("returns teacher copy for non-admin users", () => {
    expect(getPayrollRateMissingMessage(userWithRoles([role.teacher]))).toBe(
      PAYROLL_RATE_MISSING_MESSAGE_TEACHER,
    );
    expect(getPayrollRateMissingMessage(userWithRoles([role.teacher]))).toContain(
      "inform your school admin",
    );
  });

  it("returns admin copy for school admins", () => {
    expect(getPayrollRateMissingMessage(userWithRoles([role.admin]))).toBe(
      PAYROLL_RATE_MISSING_MESSAGE_ADMIN,
    );
    expect(getPayrollRateMissingMessage(userWithRoles([role.manager]))).toBe(
      PAYROLL_RATE_MISSING_MESSAGE_ADMIN,
    );
  });
});

describe("resolvePayrollRateMissingMessage", () => {
  it("prefers backend checkin_block_message when present", () => {
    expect(
      resolvePayrollRateMissingMessage(userWithRoles([role.teacher]), "From API"),
    ).toBe("From API");
  });

  it("falls back to role-aware copy when block message is absent", () => {
    expect(
      resolvePayrollRateMissingMessage(userWithRoles([role.teacher]), null),
    ).toBe(PAYROLL_RATE_MISSING_MESSAGE_TEACHER);
  });
});
