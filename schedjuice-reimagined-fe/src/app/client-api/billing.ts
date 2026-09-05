import { axiosClient } from "@/lib/api";
import { BillingResponse } from "@/types/billing";

export async function fetchOrgBilling(
  orgId: number | string,
  date: string,
): Promise<BillingResponse> {
  const res = await axiosClient.get<BillingResponse>(
    `organizations/${orgId}/billing`,
    {
      params: { date },
    },
  );
  return res.data;
}
