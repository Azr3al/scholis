"use client";
import { Button, Input, buttonVariants, inputClassName } from "@/components/primitives";

import { Xmark as X } from "iconoir-react";
import { useState } from "react";

export function normalizeApprovedDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@")) {
    s = s.split("@").pop() ?? "";
    s = s.trim();
  }
  if (s.startsWith("@")) s = s.slice(1);
  if (!s || /\s/.test(s)) return null;
  return s;
}

interface ApprovedDomainsEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  error?: string;
}

export const ApprovedDomainsEditor: React.FC<ApprovedDomainsEditorProps> = ({
  value,
  onChange,
  disabled = false,
  error,
}) => {
  const [draft, setDraft] = useState("");
  const domains = value ?? [];

  const addDomain = () => {
    const normalized = normalizeApprovedDomain(draft);
    if (!normalized) return;
    if (domains.includes(normalized)) {
      setDraft("");
      return;
    }
    onChange([...domains, normalized]);
    setDraft("");
  };

  const removeDomain = (domain: string) => {
    onChange(domains.filter((d) => d !== domain));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDomain();
            }
          }}
          placeholder="e.g. school.edu"
          disabled={disabled}
          aria-label="Approved email domain"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addDomain}
          disabled={disabled || !normalizeApprovedDomain(draft)}
        >
          Add domain
        </Button>
      </div>
      {domains.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <li key={domain}>
              <span className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("gap-1 pr-1")}>
                {domain}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  onClick={() => removeDomain(domain)}
                  disabled={disabled}
                  aria-label={`Remove ${domain}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No approved domains yet.</p>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
};
