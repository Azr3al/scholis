import { axiosClient } from "@/lib/api";

export async function fetchGoogleLinkAuthorizeUrl(returnPath: string): Promise<string> {
  const response = await axiosClient.get<{ authorize_url?: string }>(
    "google/oauth/start/link",
    {
      params: {
        return_origin: window.location.origin,
        return_path: returnPath,
      },
    },
  );
  const authorizeUrl = response.data?.authorize_url;
  if (!authorizeUrl) {
    throw new Error("No authorize URL returned.");
  }
  return authorizeUrl;
}

export const unlinkGoogleAccount = () => axiosClient.post("google/unlink", {});

/** Platform superadmin: force-unlink another user's Google account. */
export const unlinkGoogleAccountForUser = (userId: number) =>
  axiosClient.post(`users/${userId}/unlink-google`, {});
