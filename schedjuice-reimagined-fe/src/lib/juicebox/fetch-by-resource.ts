import { getJuiceBoxOrigin, juiceBoxAuthHeaders } from "@/lib/juicebox/auth";
import type { JuiceBoxAttachmentsResponse } from "@/lib/juicebox/types";

export async function fetchJuiceBoxAttachments(
  resource: string,
  foreignKey: string
): Promise<JuiceBoxAttachmentsResponse> {
  if (!resource || !foreignKey) {
    throw new Error("resource and foreignKey are required.");
  }

  const url = `${getJuiceBoxOrigin()}/attachments/${encodeURIComponent(resource)}/${encodeURIComponent(foreignKey)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...juiceBoxAuthHeaders(),
      "Content-Type": "application/json",
    },
  });

  if (response.status === 404) {
    return { attachments: [] };
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Failed to fetch attachments");
    throw new Error(errorBody || "Failed to fetch attachments");
  }

  return response.json();
}
