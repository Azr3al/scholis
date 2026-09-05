const LOCAL = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const DOMAIN = "(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)+[A-Za-z]{2,}";
const LEGAL_EMAIL_RE = new RegExp(`^${LOCAL}@${DOMAIN}$`);

export function isLegalEmail(value: string): boolean {
  return LEGAL_EMAIL_RE.test((value || "").trim());
}

export function isPlausiblePhone(value: string): boolean {
  return ((value || "").match(/\d/g)?.length ?? 0) >= 6;
}
