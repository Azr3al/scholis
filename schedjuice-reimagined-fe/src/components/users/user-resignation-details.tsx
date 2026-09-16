"use client";

import type { accountType } from "@/types/user";
import { format } from "date-fns";

const TYPE_OF_PAY_LABELS: Record<string, string> = {
  per_month: "Per Month",
  per_session: "Per Session",
  collaboration: "Collaboration Half/Half",
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time (FTE)",
  part_time: "Part-time",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "dd MMM yyyy");
}

type UserResignationDetailsProps = {
  user: accountType;
};

export function UserResignationDetails({ user }: UserResignationDetailsProps) {
  if (!user.resigned_at) return null;

  return (
    <div className="rounded-lg bg-danger/5 px-4 py-4">
      <p className="mb-3 text-base font-semibold text-text-primary">Resignation</p>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-text-muted">Resigned on</p>
          <p className="font-medium">{formatDate(user.resigned_at)}</p>
        </div>
        <div>
          <p className="text-text-muted">Inform date</p>
          <p className="font-medium">
            {formatDate(user.resignation_inform_date)}
          </p>
        </div>
        <div>
          <p className="text-text-muted">Last working date</p>
          <p className="font-medium">
            {formatDate(user.resignation_last_working_date)}
          </p>
        </div>
        <div>
          <p className="text-text-muted">Type of pay</p>
          <p className="font-medium">
            {user.resignation_type_of_pay
              ? TYPE_OF_PAY_LABELS[user.resignation_type_of_pay] ??
                user.resignation_type_of_pay
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-text-muted">Employment type</p>
          <p className="font-medium">
            {user.resignation_employment_type
              ? EMPLOYMENT_TYPE_LABELS[user.resignation_employment_type] ??
                user.resignation_employment_type
              : "—"}
          </p>
        </div>
        {user.resignation_remark ? (
          <div className="sm:col-span-2">
            <p className="text-text-muted">Remark</p>
            <p className="font-medium whitespace-pre-wrap">
              {user.resignation_remark}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
