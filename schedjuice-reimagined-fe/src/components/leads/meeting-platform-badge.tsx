import Image from "next/image";
import Link from "next/link";
import { OpenNewWindow as ExternalLink } from "iconoir-react";

export function MeetingPlatformBadge({
  icon,
  label,
  className,
}: {
  icon?: string | null;
  label: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      {icon ? (
        <Image
          src={icon}
          alt=""
          width={16}
          height={16}
          className="shrink-0"
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export function MeetingLinkRow({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 break-all text-accent hover:underline ${className ?? ""}`}
    >
      {href}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </Link>
  );
}
