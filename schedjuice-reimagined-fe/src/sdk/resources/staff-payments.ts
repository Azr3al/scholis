import type { StaffPayment } from "../_types/staff-payments";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListStaffPaymentsArgs = SearchListArgs;

export const staffPaymentsSearch = defineSearchListResource<StaffPayment>({
  path: "staff-payments",
  keyNamespace: "staff-payments",
});

export const listStaffPayments = staffPaymentsSearch.list;

export async function confirmStaffPayment(id: number): Promise<StaffPayment> {
  const { axiosClient } = await import("@/lib/api");
  const res = await axiosClient.post(`staff-payments/${id}/confirm`);
  return res.data?.data as StaffPayment;
}
