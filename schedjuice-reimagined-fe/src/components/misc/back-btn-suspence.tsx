"use client";
import { Button, buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { NavArrowLeft as ChevronLeft } from "iconoir-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface BackButtonProps {
  href?: string;
  sendBack?: boolean;
  label?: string;
  className?: string;
}

const BackBtnSuspence = ({ href, sendBack, label, className }: BackButtonProps) => {
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("ref") !== null) {
      setReferenceUrl(decodeURIComponent(searchParams.get("ref") as string));
    }
  }, []);

  return sendBack ? (
    <Button
      onClick={() => router.back()}
      size="sm"
      variant="ghost"
      className={cn("w-fit self-start", className)}
    />
  ) : (
    <Link
      // @ts-ignore
      href={referenceUrl ? referenceUrl : href}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "w-fit self-start",
        className,
      )}
    >
      <ChevronLeft />
      <span>{label || "Back"}</span>
    </Link>
  );
};

export default BackBtnSuspence;
