"use client";

import { useState, type KeyboardEvent } from "react";
import {
  applyBraceSuggestion,
  braceSuggestQuery,
  filterVariableOptions,
  joinTemplatePieces,
  moveTemplatePiece,
  splitTemplatePieces,
  type TemplatePiece,
} from "@/lib/image-template/variable-template";

function piecesForEdit(source: string): TemplatePiece[] {
  const pieces = splitTemplatePieces(source);
  const last = pieces.at(-1);
  if (!last || last.kind !== "text" || /^\s+$/.test(last.text)) {
    pieces.push({ kind: "text", text: "" });
  }
  return pieces;
}

export function TemplateCopyEditor({
  value,
  onChange,
  ariaLabel = "Layer template",
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const pieces = piecesForEdit(value);
  const [suggest, setSuggest] = useState<{
    caret: number;
    query: string;
    highlight: number;
  } | null>(null);
  const options = suggest ? filterVariableOptions(suggest.query) : [];

  const commit = (next: string, caret = next.length) => {
    onChange(next);
    const active = braceSuggestQuery(next, caret);
    setSuggest(active ? { caret, query: active.query, highlight: 0 } : null);
  };

  const pick = (key: string) => {
    if (!suggest) return;
    const next = applyBraceSuggestion(value, suggest.caret, key);
    onChange(next.text);
    setSuggest(null);
  };

  const onSuggestKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggest) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggest({
        ...suggest,
        highlight: Math.min(suggest.highlight + 1, Math.max(0, options.length - 1)),
      });
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggest({
        ...suggest,
        highlight: Math.max(suggest.highlight - 1, 0),
      });
    }
    if (event.key === "Enter" && options[suggest.highlight]) {
      event.preventDefault();
      pick(options[suggest.highlight].key);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSuggest(null);
    }
  };

  return (
    <div className="relative">
      <div
        aria-label={ariaLabel}
        className="flex min-h-20 flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
      >
        {pieces.map((piece, index) =>
          piece.kind === "token" ? (
            <button
              key={`${piece.raw}-${index}`}
              type="button"
              draggable
              data-testid={`token-chip-${piece.key}`}
              className="mx-0.5 cursor-grab rounded-md border border-dashed border-[rgba(107,78,230,0.5)] bg-[rgba(107,78,230,0.16)] px-1.5 py-0.5 text-[0.95em] italic text-[#6b4ee6]"
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", String(index));
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              {piece.raw}
            </button>
          ) : (
            <input
              key={`text-${index}`}
              aria-label={index === pieces.length - 1 ? "Add text" : `Text ${index}`}
              className="min-w-4 whitespace-pre border-0 bg-transparent p-0 text-sm outline-none"
              size={Math.max(1, piece.text.length)}
              value={piece.text}
              placeholder={value ? "" : "Type { to insert a variable"}
              onChange={(event) => {
                const nextPieces = [...pieces];
                nextPieces[index] = { kind: "text", text: event.target.value };
                const next = joinTemplatePieces(nextPieces);
                const before = joinTemplatePieces(nextPieces.slice(0, index));
                commit(next, before.length + event.target.value.length);
              }}
              onKeyDown={onSuggestKeyDown}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData("text/plain"));
                if (!Number.isFinite(from)) return;
                commit(moveTemplatePiece(value, from, index));
              }}
            />
          ),
        )}
      </div>
      {suggest && options.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Variables"
          className="absolute z-20 mt-1 max-h-48 w-56 overflow-auto rounded-md border border-border bg-surface-elevated py-1 shadow-md"
        >
          {options.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                role="option"
                aria-selected={index === suggest.highlight}
                className={`flex w-full px-2 py-1.5 text-left text-sm ${
                  index === suggest.highlight
                    ? "bg-accent text-accent-foreground"
                    : "text-text-primary"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(item.key);
                }}
              >
                {item.label}
                <span className="ml-auto text-xs text-text-muted">{`{{${item.key}}}`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
