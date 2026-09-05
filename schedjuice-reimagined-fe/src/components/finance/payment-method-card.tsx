"use client";

import { cn } from "@/lib/utils";

interface PaymentMethodCardProps {
  paymentMethod: {
    id: number;
    name: string;
    payment_bank: string;
    description?: string | null;
  };
  className?: string;
}

const PaymentMethodCard: React.FC<PaymentMethodCardProps> = ({
  paymentMethod,
  className,
}) => {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground shadow-md p-4 rounded-lg border w-full min-w-0",
        className
      )}
    >
      <div className="space-y-2">
        <p className="font-semibold">{paymentMethod.name}</p>
        <p className="text-sm text-muted-foreground">{paymentMethod.payment_bank}</p>
        {paymentMethod.description && (
          <p className="text-xs text-foreground">{paymentMethod.description}</p>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodCard;
