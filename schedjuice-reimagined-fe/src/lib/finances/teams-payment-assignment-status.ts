import { PaymentAssignmentMonthUiStatus } from "@/components/finances/student-payments-report";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";

function formatWindowDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type TeamsPaymentHandInLabelOptions = {
  creationWindowStart?: string | null;
  creationWindowEnd?: string | null;
};

export function teamsPaymentHandInLabel(
  status: string,
  opts?: TeamsPaymentHandInLabelOptions,
): string {
  const creationWindowStart = opts?.creationWindowStart;
  const creationWindowEnd = opts?.creationWindowEnd;

  switch (status) {
    case PaymentAssignmentMonthUiStatus.Created:
      return "Teams payment: CREATED";
    case PaymentAssignmentMonthUiStatus.ExpectedButMissing:
      return "Teams payment: EXPECTED BUT MISSING";
    case PaymentAssignmentMonthUiStatus.Missed:
      if (creationWindowEnd) {
        return `Teams payment: MISSED (window closed ${formatWindowDate(creationWindowEnd)})`;
      }
      return "Teams payment: MISSED";
    case PaymentAssignmentMonthUiStatus.Scheduled:
      if (creationWindowStart) {
        return `Teams payment: Scheduled (creates ${formatWindowDate(creationWindowStart)})`;
      }
      return "Teams payment: Scheduled";
    case PaymentAssignmentMonthUiStatus.NotApplicable:
      return "Teams payment hand-in does not apply to this class.";
    case PaymentAssignmentMonthUiStatus.Skipped:
      return "Teams payment: NOT YET";
    default:
      return "Could not determine Teams payment hand-in status.";
  }
}

export function shouldShowTeamsPaymentAssignmentStatus(opts: {
  isMicrosoftOn: boolean;
  courseId: string | number | null | undefined;
}): boolean {
  if (!opts.isMicrosoftOn) return false;
  const cid = String(opts.courseId ?? "").trim();
  return isValidApiEntityIdParam(cid);
}
