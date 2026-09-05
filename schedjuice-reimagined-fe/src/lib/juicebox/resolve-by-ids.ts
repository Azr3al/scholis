import { getJuiceBoxOrigin, juiceBoxAuthHeaders } from "@/lib/juicebox/auth";
import type { JuiceBoxAttachmentsResponse } from "@/lib/juicebox/types";

export async function fetchJuiceBoxAttachmentsByIds(
  ids: number[]
): Promise<JuiceBoxAttachmentsResponse> {
  const uniqueIds = Array.from(
    new Set(ids.filter((id) => Number.isFinite(id) && id > 0))
  );
  if (uniqueIds.length === 0) {
    return { attachments: [] };
  }

  const response = await fetch(`${getJuiceBoxOrigin()}/attachments/resolve`, {
    method: "POST",
    headers: {
      ...juiceBoxAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: uniqueIds }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Failed to resolve attachments");
    throw new Error(errorBody || "Failed to resolve attachments");
  }

  return response.json();
}
