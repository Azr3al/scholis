import { axiosClient } from "@/lib/api";
import type {
  PlatformBillingConfig,
  PlatformBillingConfigPatch,
  PlatformBillingConfigResponse,
} from "@/types/platform-billing-config";

export async function fetchPlatformBillingConfig(
  orgId: number | string,
): Promise<PlatformBillingConfig> {
  const res = await axiosClient.get<PlatformBillingConfigResponse>(
    `organizations/${orgId}/platform-billing-config`,
  );
  return res.data.data;
}

export async function patchPlatformBillingConfig(
  orgId: number | string,
  body: PlatformBillingConfigPatch,
): Promise<PlatformBillingConfig> {
  const res = await axiosClient.patch<PlatformBillingConfigResponse>(
    `organizations/${orgId}/platform-billing-config`,
    body,
  );
  return res.data.data;
}
