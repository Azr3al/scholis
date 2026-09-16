"use client"
import { buttonVariants } from "@/components/primitives";
import { Card, CardContent } from "@/components/public/elevated-card";
import { useTenant } from "@/hooks/useTenant";
import Link from "next/link";

export default function RegistartionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tenant } = useTenant();

  if (tenant?.is_student_login_disabled) {
    return (
      <div className="sj-root w-screen h-full min-h-screen pt-10 flex items-center justify-center pb-[5vh]">
        <p className="absolute top-0 left-0 p-2">{tenant?.name}</p>
        <Card className="max-sm:shadow-none max-sm:border-none max-sm:w-full w-96">
          <CardContent className="pt-6 space-y-2">
            <p className="font-semibold">Registration unavailable</p>
            <p className="text-sm text-text-muted">
              Student self-registration is disabled for this organization. Please
              contact your administrator.
            </p>
            <Link
              href="/login"
              className={buttonVariants({ variant: "secondary", size: "sm"  })}
            >
              Back to login
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="sj-root w-screen h-full min-h-screen pt-10 flex items-center justify-center pb-[5vh]">
        <p className="absolute top-0 left-0 p-2">{tenant?.name}</p>
        <Card className="max-sm:shadow-none max-sm:border-none max-sm:w-full w-96">
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </>
  );
}
