import { isValid, parseISO } from "date-fns";

import type { ImportFieldDef } from "@/app/client-api/imports";

type NormalizeResult = {
  status: "valid" | "adjusted" | "error";
  value: string;
  reason?: string;
};

function isRealIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return isValid(parseISO(iso));
}

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return isRealIsoDate(s) ? s : null;
  }
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const iso = `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    return isRealIsoDate(iso) ? iso : null;
  }
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return null;
  const iso = new Date(parsed).toISOString().slice(0, 10);
  return isRealIsoDate(iso) ? iso : null;
}

export function normalizeCell(raw: string, field: ImportFieldDef): NormalizeResult {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { status: "valid", value: "" };

  switch (field.field_type) {
    case "date": {
      const iso = toIsoDate(trimmed);
      if (iso === null) return { status: "error", value: trimmed, reason: "Invalid date" };
      return { status: iso === trimmed ? "valid" : "adjusted", value: iso };
    }
    case "boolean": {
      const t = trimmed.toLowerCase();
      if (["true", "1", "yes", "y"].includes(t)) {
        return { status: "adjusted", value: "true" };
      }
      if (["false", "0", "no", "n"].includes(t)) {
        return { status: "adjusted", value: "false" };
      }
      return { status: "error", value: trimmed, reason: "Invalid boolean" };
    }
    case "choice": {
      const choices = field.choices ?? [];
      const hit = choices.find(
        (c) =>
          c.value.toLowerCase() === trimmed.toLowerCase() ||
          c.label.toLowerCase() === trimmed.toLowerCase(),
      );
      if (!hit) {
        return { status: "error", value: trimmed, reason: "Not an allowed choice" };
      }
      return { status: hit.value === trimmed ? "valid" : "adjusted", value: hit.value };
    }
    case "email": {
      const lower = trimmed.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
        return { status: "error", value: trimmed, reason: "Invalid email" };
      }
      return { status: lower === trimmed ? "valid" : "adjusted", value: lower };
    }
    case "number": {
      const n = Number(trimmed.replace(/,/g, ""));
      if (Number.isNaN(n)) {
        return { status: "error", value: trimmed, reason: "Not a number" };
      }
      const str = String(n);
      return { status: str === trimmed ? "valid" : "adjusted", value: str };
    }
    default: {
      const norm = trimmed;
      return { status: norm === raw ? "valid" : "adjusted", value: norm };
    }
  }
}
