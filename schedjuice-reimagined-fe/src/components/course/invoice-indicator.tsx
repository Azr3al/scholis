"use client";

import { searchEntities } from "@/app/client-api/utils";
import { isStudent } from "@/helpers/authorization";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { courseType } from "@/types/course";
import { UserPayment, UserPaymentStatus } from "@/types/finance";
import { useQuery } from "@tanstack/react-query";
import { add } from "date-fns";
import { InfoCircle as Info } from "iconoir-react";
import Link from "next/link";
import { useEffect } from "react";
import { useToast } from "@/components/primitives";
import { useRouter } from "next/navigation";

interface InvoiceIndicatorProps {
  courseId: number | string;
}

const InvoiceIndicator: React.FC<InvoiceIndicatorProps> = ({ courseId }) => {
  const { user } = useUser();
  const router = useRouter();

  const getOutstandingInvoice = useQuery({
    enabled:
      user?.id !== undefined &&
      isValidApiEntityIdParam(String(courseId)),
    queryKey: ["getOutstandingInvoices", user?.id, courseId],
    queryFn: () =>
      searchEntities(
        "user-payments",
        { expand: ["course.payment_plan"] },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: String(user?.id),
            },
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: String(Math.trunc(Number(courseId))),
            },
            {
              field_name: "status",
              operator: operatorEnum.exact,
              value: UserPaymentStatus.pending_payment,
            },
          ],
        }
      ),
  });

  useEffect(() => {
    if (getOutstandingInvoice.data && getOutstandingInvoice.isSuccess) {
      const expiredUserPayments = getOutstandingInvoice.data?.data.data.filter(
        (up: UserPayment) =>
          new Date() >
          add(new Date(up.billing_start_date), {
            days:
              // @ts-ignore
              up.course.payment_plan.days_before_course_locked,
          })
      );
      if (user && expiredUserPayments.length > 0 && isStudent(user)) {
        router.push(`/courses/${courseId}/locked`);
      }
    }
  }, [getOutstandingInvoice.data, getOutstandingInvoice.isSuccess, user]);
  return (
    <div>
      {user &&
        isStudent(user) &&
        getOutstandingInvoice.data?.data.data.length > 0 && (
          <div className="m-2 flex items-center justify-center gap-3 rounded-md border border-warning bg-warning/10 p-1 text-sm text-warning-foreground">
            <Info></Info>
            <p>There is an outstanding invoice for this course.</p>
            <Link
              href={`/finances/make-payment?courseId=${encodeURIComponent(String(courseId))}`}
              className="underline"
            >
              Make payment
            </Link>
          </div>
        )}
    </div>
  );
};
export default InvoiceIndicator;
