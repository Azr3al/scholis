// src/components/primitives/button.tsx
import { type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/primitives/spinner";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-sans font-medium whitespace-nowrap " +
    "transition-[background-color,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] " +
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--action,var(--data-green-strong,#2f6e58))] text-[var(--action-foreground,#ffffff)] hover:bg-[color-mix(in_srgb,var(--action,var(--data-green-strong,#2f6e58))_88%,#000)]",
        secondary: "border border-border-strong bg-surface text-text-primary hover:bg-surface-hover",
        ghost: "text-text-primary hover:bg-surface-hover",
        link: "text-primary underline-offset-4 hover:underline",
        danger: "bg-danger text-white hover:bg-[color-mix(in_srgb,var(--danger)_88%,#000)]",
      },
      size: { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-base", lg: "h-12 px-6 text-lg" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  type = "button",
  isLoading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(buttonVariants({ variant, size }), isLoading && "relative", className)}
      {...props}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center gap-2",
          isLoading && "invisible",
        )}
        aria-hidden={isLoading || undefined}
      >
        {children}
      </span>
      {isLoading ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner className={size === "sm" ? "size-3.5" : "size-4"} />
        </span>
      ) : null}
    </button>
  );
}
