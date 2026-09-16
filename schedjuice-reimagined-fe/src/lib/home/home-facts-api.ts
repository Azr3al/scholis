import { makeGetRequest } from "@/app/client-api/utils";

export type HomeFactsPayload = {
  staff?: number;
  students?: number;
  courses?: number;
  sessions_today?: number;
  checked_in_today?: number;
  expected_staff_today?: number;
};

export async function fetchHomeFacts(): Promise<HomeFactsPayload> {
  const res = await makeGetRequest("home/facts");
  return (res.data?.data ?? {}) as HomeFactsPayload;
}
