"use client";

import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Props = {
  courseId: number;
  /** `footer`: separated row below content; `inline`: button only (e.g. next to other actions). */
  layout?: "footer" | "inline";
};

/** After submitting a course-scoped quiz, link learners back to the course hub. */
export function QuizTakeCourseReturnButton({
  courseId,
  layout = "footer",
}: Props) {
  const btn = (
    <Link
      href={`/courses/${courseId}`}
      className={cn(buttonVariants({ variant: "secondary", size: "md" }), "cursor-pointer")}
    >
      Return to course
    </Link>
  );
  if (layout === "inline") {
    return btn;
  }
  return (
    <div className="border-border/70 mt-8 border-t pt-6">{btn}</div>
  );
}
