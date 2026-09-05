import { cn } from "@/lib/utils";

export function PageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "text-balance font-serif text-3xl leading-[1.25] text-text-primary",
        className,
      )}
    >
      {children}
    </h1>
  );
}
