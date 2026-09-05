"use client";

import { makePostRequest } from "@/app/client-api/utils";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { PageContainer } from "@/components/layout/page-container";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(public)/(auth)/reset-password"),
);
import { Button, Input, useToast } from "@/components/primitives";
import { logout } from "@/helpers/auth";
import { evaluatePasswordRequirements } from "@/lib/password-requirements";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const PasswordResetSuspence = () => {
  const searchParams = useSearchParams();
  const toast = useToast();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);

  const { allMet } = evaluatePasswordRequirements(password);
  const canSubmit =
    allMet && password.length > 0 && password === confirmPassword;

  const passwordResetMutation = useMutation({
    mutationKey: ["passwordReset"],
    mutationFn: () => {
      return makePostRequest("/password-reset", {
        token: searchParams.get("token"),
        password: password,
      });
    },
    onSuccess: () => {
      toast.add({
        title: "Password reset successfully",
      });
      logout();
      router.push("/login");
    },
    onError: () => {
      toast.add({
        title: "Password reset failed",
        description:
          "Something went wrong. Please try requesting a new password reset link.",
      });
    },
  });

  const onSubmit = () => {
    if (!canSubmit) return;
    passwordResetMutation.mutate();
  };

  return (
    <PageContainer width={PAGE_WIDTH} className="flex min-h-screen items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold text-text-primary">
          Password Reset
        </h1>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary">
              Enter a new password
            </label>
            <Input
              className="w-full"
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              type="password"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoComplete="new-password"
            />
            <PasswordRequirements
              password={password}
              visible={passwordFocused}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary">
              Confirm your password
            </label>
            <Input
              className="w-full"
              onChange={(e) => setConfirmPassword(e.target.value)}
              value={confirmPassword}
              type="password"
              autoComplete="new-password"
            />
          </div>
          <Button
            onClick={onSubmit}
            isLoading={passwordResetMutation.isPending}
            disabled={!canSubmit || passwordResetMutation.isPending}
          >
            Submit
          </Button>
        </div>
      </div>
    </PageContainer>
  );
};

const PasswordResetPage = () => {
  return (
    <Suspense>
      <PasswordResetSuspence />
    </Suspense>
  );
};
export default PasswordResetPage;
