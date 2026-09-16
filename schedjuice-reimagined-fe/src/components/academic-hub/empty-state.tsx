"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/primitives/button";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import {
  HubStatusFilter,
  HubStatusAggregate,
} from "@/types/academic-hub";
import { cn } from "@/lib/utils";

type EmptyVariant =
  | { kind: "no-results-status"; programName?: string; counts: HubStatusAggregate }
  | { kind: "no-search-results"; q: string }
  | { kind: "no-courses-yet"; programName?: string };

interface Props {
  variant: EmptyVariant;
  onBroadenStatus?: (status: HubStatusFilter) => void;
  onClearSearch?: () => void;
  isStudent?: boolean;
  onJoinClass?: () => void;
}

const STATUS_LABEL: Record<HubStatusFilter, string> = {
  active: "Active",
  planned: "Planned",
  ended: "Ended",
};

export function AcademicHubEmptyState({
  variant,
  onBroadenStatus,
  onClearSearch,
  isStudent = false,
  onJoinClass,
}: Props) {
  if (variant.kind === "no-results-status") {
    const programLabel = variant.programName ?? "this program";
    const others: { status: HubStatusFilter; count: number }[] = (
      [
        { status: "planned" as const, count: variant.counts.planned },
        { status: "ended" as const, count: variant.counts.ended },
      ] as const
    ).filter((c) => c.count > 0);

    return (
      <EmptyState
        action={
          others.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {others.map((c) => (
                <Button
                  key={c.status}
                  variant="secondary"
                  size="sm"
                  onClick={() => onBroadenStatus?.(c.status)}
                >
                  Show {STATUS_LABEL[c.status]} ({c.count})
                </Button>
              ))}
            </div>
          ) : undefined
        }
      >
        <EmptyCopy
          enBefore="No matching courses in "
          enHighlight={programLabel}
          enAfter=""
          myBefore={`${programLabel} အတွက် အတန်း`}
          myHighlight="မတွေ့"
          myAfter="ပါ"
        />
      </EmptyState>
    );
  }

  if (variant.kind === "no-search-results") {
    return (
      <EmptyState
        action={
          <Button variant="secondary" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      >
        <EmptyCopy
          enBefore="Nothing "
          enHighlight="matches"
          enAfter={` "${variant.q}"`}
          myBefore={`"${variant.q}" အတွက် `}
          myHighlight="မတွေ့"
          myAfter="ပါ"
        />
      </EmptyState>
    );
  }

  const programLabel = variant.programName ?? "This program";

  if (isStudent) {
    return (
      <EmptyState
        action={
          <Button variant="primary" size="sm" onClick={onJoinClass}>
            Join a class
          </Button>
        }
      >
        <EmptyCopy
          enBefore="No classes here "
          enHighlight="yet"
          enAfter=". Have an invite code from your teacher?"
          myBefore="အတန်းများ "
          myHighlight="မရှိ"
          myAfter=" သေး။ ဆရာ/မ မှ ဖိတ်ကြားလင့်ခ် ရှိပါသလား?"
        />
      </EmptyState>
    );
  }

  return (
    <EmptyState
      action={
        <Link
          href="/courses/create"
          className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
        >
          + Add classes
        </Link>
      }
    >
      <EmptyCopy
        enBefore={`${programLabel} has no courses `}
        enHighlight="yet"
        enAfter=""
        myBefore="အတန်းများ "
        myHighlight="မရှိ"
        myAfter=" သေး"
      />
    </EmptyState>
  );
}
