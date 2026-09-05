import { hasAdminCredentials } from "@/helpers/authorization";
import { accountType } from "@/types/user";

export const PAYROLL_RATE_MISSING_MESSAGE_TEACHER =
  "Hourly rate missing. Please inform your school admin to configure your hourly rate";

export const PAYROLL_RATE_MISSING_MESSAGE_ADMIN =
  "Hourly rate missing. Configure your hourly rate in the teacher's profile or course assignment before checking in.";

export function getPayrollRateMissingMessage(
  user: accountType | undefined | null,
): string {
  if (user && hasAdminCredentials(user)) {
    return PAYROLL_RATE_MISSING_MESSAGE_ADMIN;
  }
  return PAYROLL_RATE_MISSING_MESSAGE_TEACHER;
}

export function resolvePayrollRateMissingMessage(
  user: accountType | undefined | null,
  checkinBlockMessage?: string | null,
): string {
  if (checkinBlockMessage?.trim()) {
    return checkinBlockMessage.trim();
  }
  return getPayrollRateMissingMessage(user);
}
