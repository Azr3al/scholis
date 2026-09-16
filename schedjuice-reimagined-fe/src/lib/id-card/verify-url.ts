export type VerifyUrlInput = {
  verifyCode?: string | null;
  verifyToken?: string | null;
};

export function buildVerifyUrl(origin: string, input: VerifyUrlInput | null | undefined): string {
  if (!input) return "";
  const segment = input.verifyCode?.trim() || input.verifyToken?.trim();
  if (!segment) return "";
  const base = origin.replace(/\/+$/, "");
  return `${base}/verify/${segment}`;
}
