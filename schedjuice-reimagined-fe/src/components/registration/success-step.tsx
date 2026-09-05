import { RegistrationStep } from "@/types/user";
import { useTenant } from "@/hooks/useTenant";
import Link from "next/link";

interface SuccessStepProps {
  setStep: (step: RegistrationStep) => void;
  email: string;
  nextUrl?: string;
}

const SuccessStep: React.FC<SuccessStepProps> = ({ email, nextUrl }) => {
  const { tenant } = useTenant();
  const homeUrl = tenant?.domain_url ? `https://${tenant.domain_url}` : "/";
  const footerLabel = tenant?.name ? `${tenant.name} Team` : "Schedjuice Team";

  return (
    <>
      <h2 className="text-xl font-bold text-center ">Success!</h2>
      <p>
        Your account has been successfully created. Please wait for the
        administrator&apos;s approval.
      </p>
      <p>
        Once approved, we will send you a notification email to{" "}
        <span className="font-bold">{email}</span>
      </p>
      {nextUrl ? (
        <p>
          After your account is approved,{" "}
          <Link className="font-medium underline" href={nextUrl}>
            return here to finish joining your course
          </Link>
          .
        </p>
      ) : null}
      <p>You can now safely close this window.</p>
      <div className="pt-36 flex justify-end">
        <div>
          <span>{"- "}</span>
          <Link className="underline" href={homeUrl} target="_blank">
            {footerLabel}
          </Link>
        </div>
      </div>
    </>
  );
};

export default SuccessStep;
