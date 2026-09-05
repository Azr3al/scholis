"use client";

import { getQuizEditorExtensions } from "@/components/editor/config";
import { convertToEditorDoc } from "@/helpers/convertToEditorDoc";
import { onReadOnlyRichHtmlLinkClick } from "@/helpers/tiptapExternalLinkConfirm";
import { cn } from "@/lib/utils";
import { generateHTML } from "@tiptap/core";
import { memo, useMemo } from "react";
import "katex/dist/katex.min.css";

function richContentKey(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

type HtmlProps = {
  value: unknown;
  className?: string;
};

/** Renders TipTap JSON (or legacy plain string / empty) as HTML. */
function QuizRichContentHtmlInner({ value, className }: HtmlProps) {
  const contentKey = richContentKey(value);
  const html = useMemo(() => {
    const doc = convertToEditorDoc(value);
    return generateHTML(doc, getQuizEditorExtensions());
  }, [contentKey]);

  return (
    <div
      className={cn(
        "quiz-v3-rich-html prose prose-sm dark:prose-invert max-w-none text-text-primary [&_.katex]:text-text-primary [&_a]:cursor-pointer [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_img]:max-h-[min(420px,70vh)] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:object-contain",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onReadOnlyRichHtmlLinkClick}
    />
  );
}

export const QuizRichContentHtml = memo(
  QuizRichContentHtmlInner,
  (prev, next) =>
    richContentKey(prev.value) === richContentKey(next.value) &&
    prev.className === next.className,
);
QuizRichContentHtml.displayName = "QuizRichContentHtml";

type OptionProps = {
  body: unknown;
  className?: string;
};

/** Option `body` is TipTap JSON (object), legacy JSON string, or plain text. */
function QuizRichOptionContentInner({ body, className }: OptionProps) {
  const contentKey = richContentKey(body);
  const html = useMemo(() => {
    const doc = convertToEditorDoc(body);
    return generateHTML(doc, getQuizEditorExtensions());
  }, [contentKey]);

  return (
    <span
      className={cn(
        "quiz-v3-rich-html prose prose-sm dark:prose-invert inline max-w-none font-normal [&_p]:my-0 [&_p]:inline [&_.katex]:text-text-primary [&_a]:cursor-pointer [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_img]:max-h-32 [&_img]:max-w-[min(100%,280px)] [&_img]:rounded-sm [&_img]:object-contain [&_img]:align-middle",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onReadOnlyRichHtmlLinkClick}
    />
  );
}

export const QuizRichOptionContent = memo(
  QuizRichOptionContentInner,
  (prev, next) =>
    richContentKey(prev.body) === richContentKey(next.body) &&
    prev.className === next.className,
);
QuizRichOptionContent.displayName = "QuizRichOptionContent";
