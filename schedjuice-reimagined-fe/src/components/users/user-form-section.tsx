import { Separator } from "@/components/primitives";

interface UserFormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  showSeparator?: boolean;
}

export function UserFormSection({
  title,
  description,
  children,
  showSeparator = true,
}: UserFormSectionProps) {
  return (
    <section className="space-y-4">
      {showSeparator ? <Separator /> : null}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
