"use client";

import { useEffect, useState } from "react";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { formatDate } from "@/helpers/date";
import { formatPaymentReceiptBillingPeriod } from "@/helpers/payment-receipt";
import {
  isAttendingNotFound,
  useAdmissionsAttending,
  type AdmissionsLatestPayment,
} from "@/hooks/admissions/use-admissions-attending";

function paymentAmount(pay: AdmissionsLatestPayment): string {
  if (pay.amount == null || pay.amount === "") return "—";
  return String(pay.amount);
}

function PaymentBlock({ pay }: { pay: AdmissionsLatestPayment }) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const uploader = pay.created_by?.name?.trim() || "—";
  const period = formatPaymentReceiptBillingPeriod({
    covered_months: pay.covered_months,
  });
  const notes = pay.remarks?.trim() || "";

  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-text-muted">Date</dt>
      <dd className="tabular-nums">
        {pay.payment_date ? formatDate(pay.payment_date) : "—"}
      </dd>
      <dt className="text-text-muted">Amount</dt>
      <dd className="tabular-nums">{paymentAmount(pay)}</dd>
      <dt className="text-text-muted">Receipt</dt>
      <dd className="tabular-nums">{pay.receipt_number ?? "—"}</dd>
      <dt className="text-text-muted">Period</dt>
      <dd>{period}</dd>
      {notes ? (
        <>
          <dt className="text-text-muted">Notes</dt>
          <dd>{notes}</dd>
        </>
      ) : null}
      <dt className="text-text-muted">Status</dt>
      <dd>{pay.status}</dd>
      <dt className="text-text-muted">Uploaded by</dt>
      <dd>{uploader}</dd>
      <dt className="text-text-muted">Screenshot</dt>
      <dd>
        {pay.screenshot ? (
          <button
            type="button"
            className="text-left text-text-primary underline-offset-2 hover:underline"
            onClick={() => setViewUrl(pay.screenshot)}
          >
            View screenshot
          </button>
        ) : (
          "—"
        )}
      </dd>
      <FullScreenImageViewer
        imageUrl={viewUrl}
        title="Payment screenshot"
        onClose={() => setViewUrl(null)}
      />
    </dl>
  );
}

export function PersonAttendingPanel({
  personId,
  onNotFound,
}: {
  personId: number | null;
  onNotFound: () => void;
}) {
  const attending = useAdmissionsAttending(personId);

  useEffect(() => {
    if (personId != null && isAttendingNotFound(attending.error)) {
      onNotFound();
    }
  }, [attending.error, onNotFound, personId]);

  if (personId == null) {
    return (
      <p className="text-sm text-text-secondary">Select a person</p>
    );
  }

  if (isAttendingNotFound(attending.error)) {
    return (
      <p className="text-sm text-text-secondary">Person not found</p>
    );
  }

  if (attending.isError) {
    return (
      <p className="text-sm text-text-secondary">Could not load classes.</p>
    );
  }

  if (attending.isLoading) {
    return <p className="text-sm text-text-muted">Loading classes…</p>;
  }

  const classes = attending.data?.classes ?? [];
  if (classes.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Not attending any active or planned classes.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {classes.map((row) => (
        <li key={row.course_id}>
          <p className="font-medium text-text-primary">{row.title}</p>
          {row.latest_payment ? (
            <PaymentBlock pay={row.latest_payment} />
          ) : (
            <p className="mt-1 text-sm text-text-muted">No payment</p>
          )}
        </li>
      ))}
    </ul>
  );
}
