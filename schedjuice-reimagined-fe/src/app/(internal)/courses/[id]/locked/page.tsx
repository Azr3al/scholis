"use client";

import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { NavArrowRight } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const CourseLockedPage = () => {
  const params = useParams<{ id: string }>();
  const courseId = params?.id;

  return (
    <PageContainer width="default" className="space-y-3 text-center">
      <h2 className="font-bold text-3xl">Course Locked {":("}</h2>
      <p>
        This course is currently locked due to outstanding course fee invoices.
      </p>
      <Link
        className={cn(buttonVariants({ variant: "primary" }), "space-x-2")}
        href={
          courseId
            ? `/finances/make-payment?courseId=${encodeURIComponent(courseId)}`
            : "/finances/make-payment"
        }
      >
        <span>Make Payment</span>
        <NavArrowRight />
      </Link>
    </PageContainer>
  );
};

export default CourseLockedPage;
