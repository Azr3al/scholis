"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useRouter } from "next/navigation";

import { TypographyH1 } from "@/components/typography/h1";

export function PlatformDocsWelcome() {
  const router = useRouter();

  return (
    <div className="space-y-4 p-6 lg:p-8">
      <div className="space-y-4 rounded-lg border border-dashed border-border p-8">
        <TypographyH1>No articles yet</TypographyH1>
        <p className="text-muted-foreground">
          Create your first help article. It will appear here and on /help once published.
        </p>
        <Button type="button" onClick={() => router.push("/platform/docs/new")}>
          New article
        </Button>
      </div>
    </div>
  );
}
