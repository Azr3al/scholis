import { axiosClient } from "@/lib/api";
import {
  OrganizationAiSettings,
  OrganizationAiSettingsEdit,
} from "@/types/organization-ai-settings";

export async function fetchAiSettings(orgId: number | string) {
  const res = await axiosClient.get(`organizations/${orgId}/ai-settings`);
  return res.data.data as OrganizationAiSettings;
}

export async function patchAiSettings(
  orgId: number | string,
  body: Partial<OrganizationAiSettingsEdit>,
) {
  const res = await axiosClient.patch(`organizations/${orgId}/ai-settings`, body);
  return res.data.data as OrganizationAiSettings;
}
