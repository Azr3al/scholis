export function canCreateSyntheticPaymentStub(args: {
  parsedAmount: string;
  paymentMethodId: string;
}): boolean {
  const amount = Number.parseFloat(args.parsedAmount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (!args.paymentMethodId.trim()) return false;
  return true;
}

export function buildSyntheticPaymentStubFormData(args: {
  userId: number;
  courseId: number;
  createdById?: number;
  issuedAtIso: string;
  billingStartIso: string;
  billingEndIso: string;
  parsedAmount: string;
  paymentMethodId: string;
  transactionId?: string;
  description?: string;
  remarks?: string;
  dateOnScreenshot?: string;
}): FormData {
  const fd = new FormData();
  fd.append("user", String(args.userId));
  fd.append("course", String(args.courseId));
  fd.append("issued_at", args.issuedAtIso);
  fd.append("billing_start_date", args.billingStartIso);
  fd.append("billing_end_date", args.billingEndIso);
  fd.append("parsed_amount", args.parsedAmount);
  fd.append("payment_method", args.paymentMethodId);
  if (args.createdById != null) fd.append("created_by", String(args.createdById));
  if (args.transactionId?.trim())
    fd.append("transaction_id", args.transactionId.trim());
  if (args.description?.trim()) fd.append("description", args.description.trim());
  if (args.remarks?.trim()) fd.append("remarks", args.remarks.trim());
  if (args.dateOnScreenshot?.trim())
    fd.append("date_on_screenshot", args.dateOnScreenshot.trim());
  return fd;
}
