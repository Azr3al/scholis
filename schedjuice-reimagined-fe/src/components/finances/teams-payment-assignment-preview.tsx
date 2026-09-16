"use client";

import type { CSSProperties } from "react";

import { Button } from "@/components/primitives";
import {
  groupActivePaymentMethodsByBank,
  samplePaymentAssignmentDueDate,
  samplePaymentAssignmentDueLabel,
  samplePaymentAssignmentTitle,
} from "@/helpers/payment-method-assignment-preview";
import type { PaymentMethod } from "@/sdk";

type TeamsPaymentAssignmentPreviewProps = {
  methods: PaymentMethod[];
  now?: Date;
};

export function TeamsPaymentAssignmentPreview({
  methods,
  now = new Date(),
}: TeamsPaymentAssignmentPreviewProps) {
  const groups = groupActivePaymentMethodsByBank(methods);
  const title = samplePaymentAssignmentTitle(now);
  const due = samplePaymentAssignmentDueDate(now);

  return (
    <section className="space-y-2" aria-label="Teams assignment preview">
      <div>
        <p className="font-serif text-base text-text-primary">
          Teams assignment preview
        </p>
        <p className="text-sm text-text-muted">
          Students will see this in the assignment instructions.
        </p>
      </div>
      <div
        className="overflow-hidden rounded-md border border-border-subtle shadow-sm"
        style={
          {
            "--teams-bar": "#5B5FC7",
            "--teams-bar-text": "#ffffff",
            "--teams-canvas": "#ffffff",
          } as CSSProperties
        }
      >
        <div className="bg-(--teams-bar) px-4 py-2 text-sm text-(--teams-bar-text)">
          Assignments
        </div>
        <div className="space-y-4 bg-(--teams-canvas) p-4 text-zinc-900">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-zinc-600">
              Due {samplePaymentAssignmentDueLabel(due)}
            </p>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-medium text-zinc-700">Instructions</p>
            <p>
              Please upload your payment screenshot for this month. This
              assignment is for students to submit proof of payment.
            </p>
            {groups.length > 0 ? (
              <div className="space-y-3">
                <p>Pay using one of these accounts:</p>
                {groups.map((group) => (
                  <div key={group.bank} className="space-y-2">
                    <h3 className="font-semibold">{group.bank}</h3>
                    {group.methods.map((method) => {
                      const number = method.bank_account_number?.trim();
                      return (
                        <div key={method.id}>
                          <p className="font-medium">{method.name}</p>
                          {number ? (
                            <p className="font-mono text-zinc-700">{number}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <Button type="button" size="sm" disabled>
            Submit
          </Button>
        </div>
      </div>
    </section>
  );
}
