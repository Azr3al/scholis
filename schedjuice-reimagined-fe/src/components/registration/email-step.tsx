import { Button, Input, buttonVariants, inputClassName, useToast } from "@/components/primitives";
import { useMutation } from "@tanstack/react-query";
import { makeGetRequest } from "@/app/client-api/utils";
import { RegistrationStep } from "@/types/user";
import { useRouter } from "next/navigation";

interface EmailStepProps {
  setStep: (step: RegistrationStep) => void;
  setEmail: (email: string) => void;
  email: string;
  nextUrl?: string;
}

function getSearchEmailErrorMessage(e: any): string {
  const status = e.response?.status ?? e.status;
  const details = e.response?.data?.details;
  if (status === 429) {
    return details ?? "Too many requests. Please wait and try again.";
  }
  if (details) {
    return details;
  }
  if (!e.response) {
    return "Network error. Please check your connection and try again.";
  }
  return "Could not verify email. Please try again.";
}

function loginPathWithNext(nextUrl?: string) {
  if (!nextUrl) {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(nextUrl)}`;
}

const EmailStep: React.FC<EmailStepProps> = ({
  setStep,
  setEmail,
  email,
  nextUrl,
}) => {
  const toast = useToast();
  const router = useRouter();
  const searchExistingEmailMutation = useMutation({
    mutationKey: ["searchExistingEmail"],
    mutationFn: () => makeGetRequest(`search-user/${email}`),
    onSuccess: (r) => {
      if (r.status === 200) {
        setStep(RegistrationStep.OTP);
      } else if (r.status === 202) {
        toast.add({
          title: "Registration pending",
          description:
            "Your account is awaiting administrator approval. We will email you when it is ready.",
        });
        router.push(loginPathWithNext(nextUrl));
      } else if (r.status === 201) {
        toast.add({
          title: "Email already in use",
          description:
            "This email has already been registered. Please login instead.",
        });
        router.push(loginPathWithNext(nextUrl));
      }
    },
    onError: (e: any) => {
      toast.add({
        type: "error",
        description: getSearchEmailErrorMessage(e),
      });
    },
  });
  return (
    <>
      <h2 className="text-xl font-bold">Enter your email</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email) {
            searchExistingEmailMutation.mutate();
          }
        }}
        className="space-y-2"
      >
        <Input
          value={email}
          onChange={(e) => {
            e.preventDefault();
            setEmail(e.target.value);
          }}
          className="w-full"
          type="email"
          placeholder="your email"
        ></Input>
        <Button
          className="w-full"
          type="submit"
          disabled={email === ""}
          isLoading={searchExistingEmailMutation.isPending}
        >
          Register
        </Button>
      </form>
    </>
  );
};

export default EmailStep;
