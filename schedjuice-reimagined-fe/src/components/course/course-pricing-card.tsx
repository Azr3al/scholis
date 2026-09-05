"use client";

import { courseType } from "@/types/course";
import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { cn } from "@/lib/utils";
import { Button } from "@/components/primitives";

interface CoursePricingCardProps {
  course: courseType;
  onCheckedChange: (c: boolean) => void;
  checked: boolean;
  price: number;
  billingStartDate: Date;
  billingEndDate: Date;
}

const CoursePricingCard: React.FC<CoursePricingCardProps> = ({
  course,
  checked,
  onCheckedChange,
  price,
  billingStartDate,
  billingEndDate
}) => {
  const currencySymbol = useTenantCurrencySymbol();
  return (
    <div
      className={cn({
        "bg-card text-card-foreground shadow-md p-4 rounded-lg space-y-4 w-full min-w-0 border":
          true,
        "border-success": checked,
      })}
    >
      <div className="flex items-center gap-5 ">
        <div className="space-y-2 w-full">
          <div className="flex justify-between items-center">
            <p>
              {course.title}
              {course.code && (
                <span className="text-status-blue"> ({course.code})</span>
              )}
            </p>
            <p className="text-green-600 text-lg">
              {formatMoney(String(price), currencySymbol)}
            </p>
          </div>
          <p className="text-xs text-foreground">
            {formatDate(billingStartDate)} to{" "}
            {formatDate(billingEndDate)}
          </p>
        </div>
      </div>
      <Button
        type="button"
        onClick={() => onCheckedChange(true)}
        disabled={checked}
      >
        {checked ? "Chosen" : "Choose"}
      </Button>
    </div>
  );
};

export default CoursePricingCard;
