import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { getCalendarMonthUtcFilterBounds } from "@/helpers/date";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { operatorEnum, type filterParamsBody } from "@/types/api";
import { PaymentBank, type UserPaymentStatus } from "@/types/finance";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type BuildRecentTxnFilterParamsOpts = {
  transactionId: string;
  monthDate?: Date;
  day?: Date;
  courseId: string;
  status?: UserPaymentStatus;
  tenant?: organizationType | null;
  paymentBanks?: PaymentBank[];
};

const ALL_PAYMENT_BANKS = Object.values(PaymentBank);

export function buildRecentTxnFilterParams(
  u: accountType,
  opts: BuildRecentTxnFilterParamsOpts,
): filterParamsBody {
  const fParams: filterParamsBody = { filter_params: [] };

  if (isPaymentMembershipScoped(u)) {
    fParams.filter_params?.push({
      field_name: "course__user_courses__user_id",
      operator: operatorEnum.exact,
      value: String(u.id),
    });
  }
  if (opts.courseId && isValidApiEntityIdParam(String(opts.courseId))) {
    fParams.filter_params?.push({
      field_name: "course_id",
      operator: operatorEnum.exact,
      value: String(Math.trunc(Number(opts.courseId))),
    });
  }
  if (opts.transactionId) {
    fParams.filter_params?.push({
      field_name: "transaction_id",
      operator: operatorEnum.contains,
      value: opts.transactionId,
    });
  }
  if (opts.day) {
    fParams.filter_params?.push({
      field_name: "payment_date",
      operator: operatorEnum.gte,
      value: new Date(
        opts.day.getFullYear(),
        opts.day.getMonth(),
        opts.day.getDate(),
        0,
        0,
        0,
      ).toISOString(),
    });
    fParams.filter_params?.push({
      field_name: "payment_date",
      operator: operatorEnum.lte,
      value: new Date(
        opts.day.getFullYear(),
        opts.day.getMonth(),
        opts.day.getDate(),
        23,
        59,
        59,
      ).toISOString(),
    });
  } else if (opts.monthDate) {
    const bounds = getCalendarMonthUtcFilterBounds(opts.monthDate);
    fParams.filter_params?.push({
      field_name: "payment_date",
      operator: operatorEnum.gte,
      value: bounds.start.toISOString(),
    });
    fParams.filter_params?.push({
      field_name: "payment_date",
      operator: operatorEnum.lte,
      value: bounds.end.toISOString(),
    });
  }
  if (opts.status) {
    fParams.filter_params?.push({
      field_name: "status",
      operator: operatorEnum.exact,
      value: opts.status,
    });
  }
  const banks = opts.paymentBanks ?? [];
  if (banks.length > 0 && banks.length < ALL_PAYMENT_BANKS.length) {
    fParams.filter_params?.push({
      field_name: "payment_method__payment_bank",
      operator: operatorEnum.in,
      value: banks.join(","),
    });
  }
  return fParams;
}
