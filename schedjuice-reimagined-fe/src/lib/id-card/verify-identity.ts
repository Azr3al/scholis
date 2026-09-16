export type VerifiedIdentity = {
  verified: true;
  user_id: number;
  name: string;
  roles: string[];
  id_photo_url: string | null;
  org_name: string;
  public_profile_slug: string | null;
};

type VerifyResult =
  | { status: "verified"; identity: VerifiedIdentity }
  | { status: "invalid" };

/** Calls the public verify endpoint (tenant resolved from Origin). */
export async function fetchVerifiedIdentity(token: string): Promise<VerifyResult> {
  const apiBase = (process.env.NEXT_PUBLIC_BASE_API_URL || "/api/v1").replace(/\/$/, "");
  try {
    const res = await fetch(`${apiBase}/public/id-verify/${token}`);
    if (!res.ok) return { status: "invalid" };
    const json = await res.json();
    const identity = json?.data as VerifiedIdentity | undefined;
    if (!identity?.verified) return { status: "invalid" };
    return { status: "verified", identity };
  } catch {
    return { status: "invalid" };
  }
}
