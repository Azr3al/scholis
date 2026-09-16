"use client";

import { PageContainer } from "@/components/layout/page-container";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(public)/(auth)/forgot-password"),
);
import { Button, Input, useToast } from "@/components/primitives";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";
import { axiosClient } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { Suspense } from "react";

function getPasswordResetRequestErrorMessage(e: any): string {
  const status = e.response?.status ?? e.status;
  const details = e.response?.data?.details;
  if (status === 429) {
    return details ?? "Too many requests. Please wait and try again.";
  }
  return "Something went wrong.";
}

const ForgotPasswordPage = () => {
  const [email, setEmail] = useQueryState("email", {
    defaultValue: "",
    parse: (v) => v,
  });
  const toast = useToast();
  const { secondsRemaining, canResend, startCooldown } = useResendCooldown(30);
  const trimmedEmail = (email || "").trim();
  const canSubmit =
    canResend && trimmedEmail.length > 0 && trimmedEmail.includes("@");

  const forgotPasswordMutation = useMutation({
    mutationKey: ["forgotPassword"],
    mutationFn: () => {
      return axiosClient.post("/password-reset/request", {
        email: trimmedEmail.toLowerCase(),
      });
    },
    onSuccess: () => {
      startCooldown(30);
      toast.add({
        description:
          "A link to reset your password has been sent to your email.",
      });
    },
    onError: (e: any) => {
      const status = e.response?.status ?? e.status;
      const retryAfter = e.response?.data?.retry_after_seconds;
      if (status === 429 && typeof retryAfter === "number") {
        startCooldown(retryAfter);
      }
      toast.add({
        description: getPasswordResetRequestErrorMessage(e),
      });
    },
  });
  return (
    <PageContainer width={PAGE_WIDTH} className="flex min-h-screen items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-text-primary">
            Change password
          </h1>
          <p className="text-sm text-text-secondary">
            Request a password change request.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary">
              Enter your email address
            </label>
            <Input
              className="w-full"
              value={email || ""}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          </div>
          <Button
            isLoading={forgotPasswordMutation.isPending}
            disabled={!canSubmit || forgotPasswordMutation.isPending}
            onClick={() => {
              forgotPasswordMutation.mutate();
            }}
            type="button"
          >
            {secondsRemaining > 0
              ? `Request again in ${secondsRemaining}s`
              : "Request"}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
};

const ForgotPasswordSuspence = () => {
  return (
    <Suspense>
      <ForgotPasswordPage />
    </Suspense>
  );
};

export default ForgotPasswordSuspence;
