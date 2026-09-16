import { axiosClient } from "@/lib/api";
import type {
  PlatformInvoiceListResponse,
  PlatformInvoiceResponse,
} from "@/types/platform-invoice";

export async function fetchPlatformInvoices(
  orgId: number | string,
): Promise<PlatformInvoiceListResponse> {
  const res = await axiosClient.get<PlatformInvoiceListResponse>(
    `organizations/${orgId}/platform-invoices`,
  );
  return res.data;
}

export async function generatePlatformInvoice(
  orgId: number | string,
  year: number,
  month: number,
): Promise<PlatformInvoiceResponse> {
  const res = await axiosClient.post<PlatformInvoiceResponse>(
    `organizations/${orgId}/platform-invoices`,
    { year, month },
  );
  return res.data;
}

export async function fetchPlatformInvoice(
  invoiceId: number | string,
): Promise<PlatformInvoiceResponse> {
  const res = await axiosClient.get<PlatformInvoiceResponse>(
    `platform-invoices/${invoiceId}`,
  );
  return res.data;
}
