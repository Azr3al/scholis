"use client";

import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { cn } from "@/lib/utils";
import Link from "next/link";

const FormListPage = () => {
  return (
    <PageContainer width="wide" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <TypographyH1>Form List</TypographyH1>
        <Link
          href="/forms/create"
          className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
        >
          Create
        </Link>
      </div>
    </PageContainer>
  );
};

export default FormListPage;
