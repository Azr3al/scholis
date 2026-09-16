export type SuspiciousContactField =
  | "phone"
  | "communication_email"
  | "emergency_phone";

const PHONE_BLOCKLIST = new Set([
  "0900000",
  "09000000",
  "0000000",
  "1234567890",
  "9999999999",
  "1111111111",
  "00000000000",
]);

const EMAIL_BLOCKLIST = new Set([
  "test@test.com",
  "n/a@example.com",
  "none@example.com",
  "noemail@example.com",
  "na@example.com",
  "xxx@example.com",
]);

const LAZY_EMAIL_LOCALS = new Set([
  "test",
  "admin",
  "noreply",
  "none",
  "na",
  "xxx",
  "noemail",
  "dummy",
]);

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isSuspiciousPhone(digits: string): boolean {
  if (!digits) return false;
  if (PHONE_BLOCKLIST.has(digits)) return true;
  if (digits.length < 7) return true;
  if (digits.split("").every((d) => d === digits[0])) return true;
  if (/^09?0+$/.test(digits)) return true;
  return false;
}

function isSuspiciousEmail(email: string): boolean {
  if (!email) return false;
  if (EMAIL_BLOCKLIST.has(email)) return true;
  const at = email.indexOf("@");
  if (at <= 0) return false;
  const local = email.slice(0, at);
  return LAZY_EMAIL_LOCALS.has(local);
}

export function isSuspiciousContact(
  value: string,
  field: SuspiciousContactField
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (field === "communication_email") {
    return isSuspiciousEmail(normalizeEmail(trimmed));
  }

  return isSuspiciousPhone(normalizePhoneDigits(trimmed));
}
