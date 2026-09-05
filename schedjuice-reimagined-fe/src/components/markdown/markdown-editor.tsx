"use client";
import { Textarea } from "@/components/primitives";

import Link from "next/link";
import { useState } from "react";

import {
  ToolbarSegment,
  ToolbarSegmentGroup,
} from "@/components/shell/toolbar-segment-group";
import { cn } from "@/lib/utils";

import MarkdownRenderer from "./markdown-renderer";

interface IMarkdownEditorProps {
  value: string;
  onValueChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  label?: string | React.ReactNode;
}

const MarkdownEditor: React.FC<IMarkdownEditorProps> = ({
  value,
  onValueChange,
  label,
}) => {
  const [mode, setMode] = useState<"write" | "preview">("write");

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {label ? (
            <label className="text-sm font-medium text-text-primary">{label}</label>
          ) : (
            <p className="text-sm text-text-muted">
              Markdown supported.{" "}
              <Link
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-text-primary underline-offset-2 hover:underline"
                href="https://www.markdownguide.org/basic-syntax/"
              >
                Syntax guide
              </Link>
            </p>
          )}
        </div>
        <ToolbarSegmentGroup aria-label="Editor mode">
          <ToolbarSegment
            active={mode === "write"}
            aria-pressed={mode === "write"}
            onClick={() => setMode("write")}
          >
            Write
          </ToolbarSegment>
          <ToolbarSegment
            active={mode === "preview"}
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            Preview
          </ToolbarSegment>
        </ToolbarSegmentGroup>
      </div>

      <div className="p-4">
        <Textarea
          className={cn(
            "min-h-[320px] resize-y border-0 bg-transparent p-0 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0",
            mode !== "write" && "hidden",
          )}
          value={value}
          onChange={onValueChange}
          placeholder="# Heading&#10;&#10;Write your article here…"
          spellCheck={false}
        />

        {mode === "preview" ? (
          <div
            className={cn(
              "min-h-[320px] rounded-md border border-border-subtle bg-surface-elevated p-4",
              !value.trim() && "flex items-center justify-center text-sm text-text-muted",
            )}
          >
            {value.trim() ? (
              <MarkdownRenderer value={value} />
            ) : (
              "Nothing to preview yet."
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MarkdownEditor;
