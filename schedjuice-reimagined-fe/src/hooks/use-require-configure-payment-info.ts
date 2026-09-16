"use client";

import { canConfigurePaymentInfo } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Redirects to /home when the viewer lacks payment.configure (admin payout CRUD). */
export function useRequireConfigurePaymentInfo(): {
  allowed: boolean;
  isLoading: boolean;
} {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const allowed = user != null && canConfigurePaymentInfo(user);

  useEffect(() => {
    if (isLoading || user == null) return;
    if (!canConfigurePaymentInfo(user)) {
      router.replace("/home");
    }
  }, [isLoading, router, user]);

  return { allowed, isLoading };
}
