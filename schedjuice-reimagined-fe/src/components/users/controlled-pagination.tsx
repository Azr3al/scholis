"use client";

import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function ControlledPagination({
  page,
  totalPages,
  onPageChange,
  className,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className={cn("flex flex-wrap items-center justify-center gap-1", className)}
      aria-label="Pagination"
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      {Array.from({ length: totalPages }).map((_, i) => {
        const pageNumber = i + 1;
        return (
          <Button
            key={pageNumber}
            type="button"
            variant={page === pageNumber ? "primary" : "ghost"}
            size="sm"
            onClick={() => onPageChange(pageNumber)}
            aria-current={page === pageNumber ? "page" : undefined}
          >
            {pageNumber}
          </Button>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
