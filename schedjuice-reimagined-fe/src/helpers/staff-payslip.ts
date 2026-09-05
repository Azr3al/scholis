import { formatDate } from "@/helpers/date";
import { formatPayrollMoney } from "@/lib/payroll/format";
import type { PayslipLineItem } from "@/lib/payroll/payslip-line-items";
import type { organizationType } from "@/types/organization";

export type StaffPayslipPayload = {
  orgName: string;
  orgLogoUrl: string | null;
  title: string;
  subtitle: string;
  lineItems: PayslipLineItem[];
  total: string;
  generatedAt: string;
};

export function buildStaffPayslipFilename(payPeriodLabel: string): string {
  const slug = payPeriodLabel.toLowerCase().replace(/\s+/g, "-");
  return `payslip-${slug}.pdf`;
}

export function formatPayPeriodRange(year: number, month: number): string {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return `${formatDate(start.toISOString())} – ${formatDate(end.toISOString())}`;
}

export function buildStaffPayslipPayload(args: {
  tenant: Pick<organizationType, "name" | "logo">;
  payPeriodLabel: string;
  payPeriodYear: number;
  payPeriodMonth: number;
  paidAtLabel: string | null;
  lineItems: PayslipLineItem[];
  totalEarnings: number;
  currencySymbol: string;
}): StaffPayslipPayload {
  const periodRange = formatPayPeriodRange(
    args.payPeriodYear,
    args.payPeriodMonth,
  );
  const subtitle = args.paidAtLabel
    ? `Pay period ${periodRange} · paid ${args.paidAtLabel}`
    : `Pay period ${periodRange} · payment pending`;

  return {
    orgName: args.tenant.name ?? "Schedjuice",
    orgLogoUrl: args.tenant.logo ?? null,
    title: `Payslip — ${args.payPeriodLabel}`,
    subtitle,
    lineItems: args.lineItems,
    total: formatPayrollMoney(args.totalEarnings, args.currencySymbol),
    generatedAt: new Date().toLocaleString(),
  };
}

export async function downloadStaffPayslip(
  payload: StaffPayslipPayload,
  filename: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { StaffPayslipPdfDocument } = await import(
    "@/components/finances/staff-payslip-pdf"
  );
  const { downloadFile } = await import("@/helpers/file");

  const blob = await pdf(StaffPayslipPdfDocument({ payload })).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
