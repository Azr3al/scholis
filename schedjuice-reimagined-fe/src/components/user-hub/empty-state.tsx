"use client";

import { Button } from "@/components/primitives/button";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

type EmptyVariant =
  | { kind: "no-search-results"; q: string }
  | { kind: "no-users" };

interface Props {
  variant: EmptyVariant;
  onClearSearch?: () => void;
}

export function UserHubEmptyState({ variant, onClearSearch }: Props) {
  if (variant.kind === "no-search-results") {
    return (
      <EmptyState
        action={
          onClearSearch ? (
            <Button variant="secondary" size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
          ) : undefined
        }
      >
        <EmptyCopy
          enBefore="No "
          enHighlight="match"
          enAfter={` for "${variant.q}"`}
          myBefore={`"${variant.q}" အတွက် `}
          myHighlight="မတွေ့"
          myAfter="ပါ"
        />
      </EmptyState>
    );
  }

  return (
    <EmptyState>
      <EmptyCopy {...EMPTY_COPY_PRESETS.noUsers} />
    </EmptyState>
  );
}
