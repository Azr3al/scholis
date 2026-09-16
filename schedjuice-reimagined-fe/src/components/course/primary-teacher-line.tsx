import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import { cn } from "@/lib/utils";
import Link from "next/link";

export type PrimaryTeacherDisplay = {
  id: number;
  name: string;
  email: string;
};

export function PrimaryTeacherLine({
  teacher,
  className,
  profileUserId,
}: {
  teacher: PrimaryTeacherDisplay | null | undefined;
  className?: string;
  /** When set, the teacher name links to this user profile (hover underline). */
  profileUserId?: number;
}) {
  if (!teacher?.name) return null;
  const nameNode =
    profileUserId != null ? (
      <Link
        href={`/users/${profileUserId}`}
        className="text-foreground/90 underline-offset-4 hover:underline"
      >
        {teacher.name}
      </Link>
    ) : (
      <span className="text-foreground/90">{teacher.name}</span>
    );
  const maskedEmail = maskEmailLocalPart(teacher.email);
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="shrink-0">{nameNode}</span>
      <span className="shrink-0" aria-hidden>
        ·
      </span>
      <span className="min-w-0 truncate" title={teacher.email || undefined}>
        {maskedEmail}
      </span>
    </div>
  );
}
