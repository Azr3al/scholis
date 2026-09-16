/** e.g. `james@...` from `james@school.org` */
export function maskEmailLocalPart(email: string | null | undefined): string {
  if (email == null || email === "") return "—";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email.slice(0, at)}@...`;
}
