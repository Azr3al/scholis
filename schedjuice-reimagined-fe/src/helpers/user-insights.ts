import type { DuplicateClusterUser, MsSignInEntry } from "@/types/user-insights";

export function recommendSurvivor(
  users: DuplicateClusterUser[],
  signInByUserId: Record<string, MsSignInEntry>,
): {
  survivorUserId: number;
  primaryEmail: string;
  microsoftId: string | null;
} {
  const ranked = [...users].sort((a, b) => {
    const aTs = signInByUserId[String(a.id)]?.last_sign_in ?? "";
    const bTs = signInByUserId[String(b.id)]?.last_sign_in ?? "";
    if (aTs !== bTs) return bTs.localeCompare(aTs);
    return a.id - b.id;
  });
  const survivor = ranked[0];
  return {
    survivorUserId: survivor.id,
    primaryEmail: survivor.email,
    microsoftId: survivor.microsoft_id,
  };
}

export function formatMsLastSignIn(entry: MsSignInEntry | undefined): string {
  if (!entry) return "—";
  if (entry.error === "not_linked") return "Not linked";
  if (entry.error === "graph_error") return "Unavailable";
  if (!entry.last_sign_in) return "Never";
  return new Date(entry.last_sign_in).toLocaleString();
}
