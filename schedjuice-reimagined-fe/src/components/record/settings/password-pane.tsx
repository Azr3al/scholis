"use client";
import { Button, useToast } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import { RecordSection } from "@/components/record/record-section";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";
import { useUser } from "@/hooks/useUser";
import { useMutation } from "@tanstack/react-query";

function getPasswordResetRequestErrorMessage(e: any): string {
  const status = e.response?.status ?? e.status;
  const details = e.response?.data?.details;
  if (status === 429) {
    return details ?? "Too many requests. Please wait and try again.";
  }
  return "Something went wrong.";
}

export function PasswordPane() {
  const { user } = useUser();
  const toast = useToast();
  const { secondsRemaining, canResend, startCooldown } = useResendCooldown(30);

  const mutation = useMutation({
    mutationFn: () =>
      makePostRequest("password-reset/request", { email: user?.email }),
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
    <RecordSection
      title="Change password"
      description="We'll email you a link to choose a new password."
    >
      <Button
        isLoading={mutation.isPending}
        disabled={!canResend || mutation.isPending || !user?.email}
        onClick={() => mutation.mutate()}
      >
        {secondsRemaining > 0
          ? `Send again in ${secondsRemaining}s`
          : "Send reset email"}
      </Button>
    </RecordSection>
  );
}
