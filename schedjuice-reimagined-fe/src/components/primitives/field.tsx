// src/components/primitives/field.tsx
"use client";

import { type ComponentProps } from "react";
import { Field as BaseField } from "@base-ui/react/field";
import { cn } from "@/lib/utils";
import { inputClassName } from "./input";

function Root({ className, name, ...props }: ComponentProps<typeof BaseField.Root>) {
  return (
    <BaseField.Root
      className={cn("flex flex-col items-start gap-2", className)}
      name={name}
      data-field-name={name}
      {...props}
    />
  );
}

function Label({ className, ...props }: ComponentProps<typeof BaseField.Label>) {
  return (
    <BaseField.Label className={cn("text-sm font-medium text-text-secondary", className)} {...props} />
  );
}

function Control({ className, ...props }: ComponentProps<typeof BaseField.Control>) {
  return <BaseField.Control className={cn(inputClassName, className)} {...props} />;
}

function Description({ className, ...props }: ComponentProps<typeof BaseField.Description>) {
  return <BaseField.Description className={cn("text-sm text-text-muted", className)} {...props} />;
}

function FieldError({
  className,
  match,
  ...props
}: ComponentProps<typeof BaseField.Error>) {
  // Base UI only shows Field.Error for native ValidityState / Form context unless
  // match={true}. RHF and API errors pass children and control visibility themselves.
  const resolvedMatch =
    match ?? (props.children != null ? true : undefined);
  return (
    <BaseField.Error
      className={cn("text-sm text-danger", className)}
      match={resolvedMatch}
      {...props}
    />
  );
}

export const Field = {
  Root,
  Label,
  Control,
  Description,
  Error: FieldError,
};
