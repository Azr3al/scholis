"use client";

import { makePostRequest } from "@/app/client-api/utils";
import EmailStep from "@/components/registration/email-step";
import InfoStep from "@/components/registration/info-step";
import OTPStep from "@/components/registration/otp-step";
import SuccessStep from "@/components/registration/success-step";
import { RegistrationStep } from "@/types/user";
import { useQueryState } from "nuqs";
import { Suspense } from "react";

const RegistrationPage = () => {
  const [email, setEmail] = useQueryState("email", {
    defaultValue: "",
    parse: (r) => r,
  });
  const [courseId, setCourseId] = useQueryState("courseId", {
    defaultValue: null,
    parse: (r) => (r ? parseInt(r) : null),
  });
  const [nextUrl] = useQueryState("next", {
    defaultValue: "",
    parse: (r) => r,
  });
  const [step, setStep] = useQueryState("step", {
    defaultValue: RegistrationStep.EMAIL,
    parse: (v) => v as RegistrationStep,
  });

  return (
    <div className="space-y-3 w-full flex flex-col  ">
      <div className="space-y-3">
        {step === RegistrationStep.EMAIL && (
          <EmailStep
            setEmail={setEmail}
            email={email}
            setStep={setStep}
            nextUrl={nextUrl || undefined}
          ></EmailStep>
        )}
        {step === RegistrationStep.OTP && (
          <OTPStep email={email} setStep={setStep}></OTPStep>
        )}
        {step === RegistrationStep.INFO && (
          <InfoStep
            email={email}
            setStep={setStep}
            courseId={courseId ? String(courseId) : undefined}
          ></InfoStep>
        )}
        {step === RegistrationStep.SUCCESS && (
          <SuccessStep
            email={email}
            setStep={setStep}
            nextUrl={nextUrl || undefined}
          ></SuccessStep>
        )}
      </div>
    </div>
  );
};

const RegistratonPageSuspence = () => {
  return (
    <Suspense>
      <RegistrationPage></RegistrationPage>
    </Suspense>
  );
};
export default RegistratonPageSuspence;
