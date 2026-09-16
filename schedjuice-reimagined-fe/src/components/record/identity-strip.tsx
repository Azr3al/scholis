"use client";
import { Avatar } from "@/components/primitives/avatar";
import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import { RecordActionsMenu } from "./record-actions-menu";
import type { accountType } from "@/types/user";

export function IdentityStrip({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  return (
    <div className="flex items-start gap-4">
      <Avatar src={subject.profile_image} name={subject.name ?? "?"} className="size-16" />
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-3xl text-text-primary">{subject.name}</h1>
        <p className="truncate text-text-muted" title={subject.email || undefined}>
          {maskEmailLocalPart(subject.email)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(subject.roles ?? []).map((r) => (
            <span
              key={r}
              className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-accent"
            >
              {r}
            </span>
          ))}
          {subject.resigned_at ? (
            <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-medium text-danger">
              Resigned
            </span>
          ) : subject.is_active === false ? (
            <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-medium text-danger">
              Disabled
            </span>
          ) : null}
        </div>
      </div>
      <RecordActionsMenu subject={subject} viewer={viewer} recordQueryKey={recordQueryKey} />
    </div>
  );
}
