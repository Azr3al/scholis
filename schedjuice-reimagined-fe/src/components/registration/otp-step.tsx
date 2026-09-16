import { Button, buttonVariants, useToast } from "@/components/primitives";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/misc/input-otp";
import { RegistrationStep } from "@/types/user";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { makePostRequest } from "@/app/client-api/utils";
import { Loader } from "../form/loader";

interface OTPStepProps {
  setStep: (step: RegistrationStep) => void;
  email: string;
}

function getVerificationRequestErrorMessage(e: any): string {
  const status = e.response?.status ?? e.status;
  if (status === 429) {
    return (
      e.response?.data?.details ??
      "Too many requests. Please wait and try again."
    );
  }
  return "Could not send verification code. Please try again.";
}

const OTPStep: React.FC<OTPStepProps> = ({ setStep, email }) => {
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [errorMessage, setErrorMessage] = useState("");
  const toast = useToast();

  const requestVerificationMutation = useMutation({
    mutationKey: ["requestVerfication", email],
    mutationFn: () =>
      makePostRequest("verification-code", {
        source: "email_verification",
        email: email,
      }),
    onError: (e: any) => {
      toast.add({
        type: "error",
        description: getVerificationRequestErrorMessage(e),
      });
    },
  });

  const validateVerificationCodeMutation = useMutation({
    mutationKey: ["validateVerificationCode", email],
    mutationFn: () =>
      makePostRequest("verification-code/validate", {
        email: email,
        code: otp,
      }),
    onError: (e: any) => {
      if (e.status == 400) {
        setErrorMessage("Invalid code. Please try again.");
      }
    },
    onSuccess: () => {
      setErrorMessage("");
      toast.add({
        description: "Email verified successfully.",
      });
      setStep(RegistrationStep.INFO);
    },
  });

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [countdown]);

  const handleSendAgain = () => {
    if (countdown === 0) {
      requestVerificationMutation.mutate();
      setErrorMessage("");
      setCountdown(60);
    }
  };
  useEffect(() => {
    if (otp.length >= 6) {
      validateVerificationCodeMutation.mutate();
    }
  }, [otp]);
  useEffect(() => {
    requestVerificationMutation.mutate();
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 mb-1"
        onClick={() => setStep(RegistrationStep.EMAIL)}
      >
        Back
      </Button>
      <h2 className="text-xl font-bold text-text-primary">Enter your One-time Password</h2>
      <p className="text-text-muted">A 6-digit OTP has been sent to your email.</p>
      <div className="flex items-center justify-center">
        <InputOTP maxLength={6} value={otp} onChange={(value) => setOtp(value)}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      {validateVerificationCodeMutation.isPending && (
        <p className="flex items-center justify-center">
          <Loader></Loader>
          <span>Loading...</span>
        </p>
      )}
      {errorMessage && (
        <p className="text-destructive text-center">{errorMessage}</p>
      )}
      <div className="text-center">
        {countdown > 0 ? (
          <p className="text-sm text-muted-foreground underline">
            Send again in {countdown}s
          </p>
        ) : (
          <button
            type="button"
            onClick={handleSendAgain}
            className="underline text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Send again
          </button>
        )}
      </div>
    </>
  );
};

export default OTPStep;
