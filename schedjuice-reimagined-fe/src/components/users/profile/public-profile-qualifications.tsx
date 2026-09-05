"use client";

import { getQualificationsEditorOptions } from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import { useEditor } from "@tiptap/react";
import { GraduationCap } from "iconoir-react";
import { useEffect } from "react";
import { hasQualificationsContent } from "./public-profile-utils";

export function PublicProfileQualifications({
  qualifications,
}: {
  qualifications: Record<string, unknown> | null | undefined;
}) {
  const editor = useEditor({ ...getQualificationsEditorOptions(), editable: false });
  const hasContent = hasQualificationsContent(qualifications);

  useEffect(() => {
    if (!editor) return;
    if (qualifications) {
      editor.commands.setContent(qualifications);
    } else {
      editor.commands.clearContent();
    }
  }, [editor, qualifications]);

  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary mt-6 border-border/60 shadow-sm">
      <div className="flex flex-col gap-1.5 p-6 gap-1 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="size-5" aria-hidden />
          </div>
          <div>
            <h3 className="font-serif text-xl leading-none tracking-tight text-lg">Qualifications</h3>
            <p className="text-sm text-text-secondary">Experience, certifications, and background</p>
          </div>
        </div>
      </div>
      <div className="p-6 pt-0 min-w-0 pt-0">
        {editor && hasContent ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:px-5 sm:py-4">
            <TextEditor editor={editor} editable={false} hideMenu isViewOnly />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-text-muted">
            No qualifications have been added yet.
          </p>
        )}
      </div>
    </div>
  );
}
