const PASSWORD_SPECIAL_CHAR_CLASS = "#?!@$%^&*-";

export type PasswordRequirementId =
  | "minLength"
  | "number"
  | "lowercase"
  | "uppercase"
  | "special";

export type PasswordRequirementRule = {
  id: PasswordRequirementId;
  label: string;
};

export const PASSWORD_REQUIREMENT_RULES: readonly PasswordRequirementRule[] = [
  { id: "minLength", label: "At least 8 characters" },
  { id: "number", label: "Contains a number" },
  { id: "lowercase", label: "One lowercase letter" },
  { id: "uppercase", label: "One uppercase letter" },
  { id: "special", label: "One special character" },
] as const;

export type PasswordRequirementResult = Record<PasswordRequirementId, boolean> & {
  allMet: boolean;
};

const SPECIAL_RE = new RegExp(`[${PASSWORD_SPECIAL_CHAR_CLASS}]`);

export function evaluatePasswordRequirements(
  password: string,
): PasswordRequirementResult {
  const minLength = password.length >= 8;
  const number = /[0-9]/.test(password);
  const lowercase = /[a-z]/.test(password);
  const uppercase = /[A-Z]/.test(password);
  const special = SPECIAL_RE.test(password);
  const allMet = minLength && number && lowercase && uppercase && special;
  return { minLength, number, lowercase, uppercase, special, allMet };
}
