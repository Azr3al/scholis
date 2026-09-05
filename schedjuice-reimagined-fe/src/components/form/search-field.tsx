"use client";

import { Spinner } from "@/components/primitives/spinner";
import { Search } from "iconoir-react";

import { Input } from "@/components/primitives/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  isFetching?: boolean;
  ariaLabel?: string;
};

export function SearchField({
  className,
  isFetching = false,
  disabled,
  placeholder,
  ariaLabel,
  autoComplete = "off",
  autoCorrect = "off",
  name = "search",
  spellCheck = false,
  ...props
}: SearchFieldProps) {
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      />
      <Input
        {...props}
        type="search"
        name={name}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        className={cn("pl-9 pr-9", className)}
      />
      <Spinner
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted",
          isFetching ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
