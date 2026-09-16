"use client";
import { AttachmentDetailValue } from "@/components/custom-fields/attachment-detail-value";
import { Skeleton } from "@/components/primitives";

import { formatDate, formatDateTime } from "@/helpers/date";
import { fieldFormPath } from "@/lib/custom-fields/field-policy";
import type { FormConfig, FormConfigField, FormConfigGroup } from "@/types/form-config";
import type { ReactNode } from "react";

function valueAtPath(source: Record<string, unknown>, field: FormConfigField): unknown {
  if (field.source === "builtin") return source[field.fieldKey];
  const cd = source.custom_data;
  return cd && typeof cd === "object"
    ? (cd as Record<string, unknown>)[field.fieldKey]
    : undefined;
}

function format(field: FormConfigField, value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (field.fieldType === "attachment") {
    return <AttachmentDetailValue value={value} />;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (field.choices) {
      return value
        .map((v) => field.choices?.find((c) => c.value === v)?.label ?? String(v))
        .join(", ");
    }
    return value.join(", ");
  }
  if (field.choices) {
    const match = field.choices.find((c) => c.value === value);
    if (match) return match.label;
  }
  if (typeof value === "string") {
    if (field.fieldType === "date") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : formatDate(d);
    }
    if (field.fieldType === "datetime") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : formatDateTime(d);
    }
    return value;
  }
  return String(value);
}

function GroupFieldGrid({
  group,
  source,
  redacted,
}: {
  group: FormConfigGroup;
  source: Record<string, unknown>;
  redacted: Set<string>;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {group.fields.map((field) => {
        const isRedacted = field.source === "builtin" && redacted.has(field.fieldKey);
        return (
          <div key={fieldFormPath(field)} className="min-w-0 space-y-1">
            <dt className="text-sm font-medium text-muted-foreground">{field.fieldLabel}</dt>
            <dd className="text-sm break-words">
              {isRedacted ? (
                <span className="text-muted-foreground italic">Redacted</span>
              ) : (
                format(field, valueAtPath(source, field))
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function LoadingSkeleton({ embedded }: { embedded?: boolean }) {
  const grid = (
    <div className="grid gap-3 sm:grid-cols-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );

  if (embedded) return grid;

  return (
    <div>
      <div>
        <h3>Profile details</h3>
      </div>
      <div>{grid}</div>
    </div>
  );
}

export function FormConfigDetail({
  config,
  source,
  isLoading,
  redactedKeys,
  embedded,
}: {
  config: FormConfig;
  source: Record<string, unknown>;
  isLoading?: boolean;
  /** Built-in field keys hidden by the viewer's visibility settings. */
  redactedKeys?: string[];
  /** When true, skip Card/title chrome (for use inside InlineGroup). */
  embedded?: boolean;
}) {
  const redacted = new Set(redactedKeys ?? []);
  if (isLoading) {
    return <LoadingSkeleton embedded={embedded} />;
  }
  const groups = config.groups.filter((g) => g.fields.length > 0);
  if (groups.length === 0) return null;

  if (embedded) {
    return (
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <GroupFieldGrid
            key={group.id ?? group.name}
            group={group}
            source={source}
            redacted={redacted}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.id ?? group.name}>
          <div>
            <h3>{group.name}</h3>
          </div>
          <div>
            <GroupFieldGrid group={group} source={source} redacted={redacted} />
          </div>
        </div>
      ))}
    </div>
  );
}
