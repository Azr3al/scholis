"use client";

import type { LogEntry, ReportType, UserMini } from "@/types/user-log";
import { LogAuditTrail } from "./log-audit-trail";

function formatFieldValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") {
    const o = v as { name?: string; title?: string };
    return o.name ?? o.title ?? JSON.stringify(v);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function LogEntryDetail({ entry }: { entry: LogEntry }) {
  const rt =
    typeof entry.report_type === "object"
      ? (entry.report_type as ReportType)
      : null;
  const author =
    typeof entry.author === "object" ? (entry.author as UserMini) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {rt && (
          <span style={{ backgroundColor: rt.color }} className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary text-white">
            {rt.name}
          </span>
        )}
        <h3 className="text-lg font-semibold">{entry.title}</h3>
      </div>
      <div className="text-xs text-muted-foreground">
        {author?.name ?? "Unknown"} ·{" "}
        {new Date(entry.created_at).toLocaleString()}
      </div>
      {entry.body ? (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: entry.body }}
        />
      ) : null}
      {rt?.fields && rt.fields.length > 0 && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {rt.fields.map((f) => {
            const v = entry.field_values_display?.[f.field_key];
            return (
              <div key={f.field_key}>
                <dt className="text-xs font-medium text-muted-foreground">
                  {f.field_label}
                </dt>
                <dd className="text-sm">{formatFieldValue(v)}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {entry.attachments?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Attachments
          </p>
          <ul className="text-sm">
            {entry.attachments.map((a) => (
              <li key={a.id}>{a.filename}</li>
            ))}
          </ul>
        </div>
      )}
      <LogAuditTrail entryId={entry.id} />
    </div>
  );
}
