"use client";
import { ReactNode } from "react";
import { EmptyCopy } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

const SPAN = { sm: "md:col-span-3", md: "md:col-span-4", lg: "md:col-span-6" } as const;

export function DashboardCard({
  title,
  span = "md",
  loading,
  empty,
  error,
  children,
}: {
  title: string;
  span?: "sm" | "md" | "lg";
  loading?: boolean;
  empty?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section className={`col-span-1 ${SPAN[span]} flex flex-col gap-3`}>
      <h3 className="px-1 text-sm font-medium tracking-tight text-text-muted">
        {title}
      </h3>
      <div className="rounded-3xl border border-border/60 bg-surface-elevated p-6 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.18)]">
        {loading ? (
          <CardSkeleton />
        ) : error ? (
          <CardError msg={error} />
        ) : empty ? (
          <CardEmpty />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-2/3 animate-pulse rounded bg-surface-sunken" />
      <div className="h-5 w-1/2 animate-pulse rounded bg-surface-sunken" />
    </div>
  );
}

function CardEmpty() {
  return (
    <EmptyCopy {...EMPTY_COPY_PRESETS.nothingHere} className="text-hand !text-[1.125rem]" />
  );
}

function CardError({ msg }: { msg: string }) {
  return <p className="text-sm text-danger">{msg}</p>;
}
