"use client";

import BackButton from "@/components/misc/back-button";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCreateFlow } from "./create-flow-context";

export function CreateFlowChrome() {
  const { reset } = useCreateFlow();

  return (
    <div className="flex items-center justify-between gap-4">
      <BackButton href="/courses" />
      <Link
        href="/courses"
        onClick={() => reset()}
        className={cn(buttonVariants({ variant: "secondary" }))}
      >
        Cancel
      </Link>
    </div>
  );
}
