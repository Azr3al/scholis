import { axiosClient } from "@/lib/api";
import {
  AiUserPreferences,
  AiUserUsageDetail,
  aiUserPreferencesSchema,
  aiUserUsageDetailSchema,
} from "@/types/ai-user-preferences";

type MonthParams = {
  year: number;
  month: number;
};

export async function fetchUserAiUsage(
  userId: number,
  params: MonthParams,
): Promise<AiUserUsageDetail> {
  const res = await axiosClient.get(`users/${userId}/ai-usage`, { params });
  const { isError, message, data } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI usage");
  }
  return aiUserUsageDetailSchema.parse(data);
}

export async function fetchUserAiPreferences(
  userId: number,
): Promise<AiUserPreferences> {
  const res = await axiosClient.get(`users/${userId}/ai-preferences`);
  const { isError, message, data } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to load AI memory");
  }
  return aiUserPreferencesSchema.parse(data);
}

export async function patchUserAiPreferences(
  userId: number,
  body: Partial<
    Pick<
      AiUserPreferences,
      "response_language" | "tone" | "verbosity" | "preferred_name"
    >
  > & { monthly_usd_limit?: number | null },
): Promise<AiUserPreferences> {
  const res = await axiosClient.patch(`users/${userId}/ai-preferences`, body);
  const { isError, message, data } = res.data ?? {};
  if (isError) {
    throw new Error(message ?? "Failed to save AI memory");
  }
  return aiUserPreferencesSchema.parse(data);
}
