"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type SearchInputProps = Omit<ComponentProps<"input">, "type"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function SearchInput({
  value,
  onValueChange,
  className,
  placeholder = "Search…",
  ...props
}: SearchInputProps) {
  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={placeholder}
      className={cn("max-w-sm", className)}
      {...props}
    />
  );
}
