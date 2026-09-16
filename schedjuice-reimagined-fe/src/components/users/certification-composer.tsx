"use client";
import { Button, Input } from "@/components/primitives";

import AttachmentUploader from "@/components/attachment-uploader/attachment-uploader";
import { DatePicker } from "@/components/users/date-picker";
import { crossfade, crossfadeInstant, revealBar } from "@/lib/sj/motion";
import type { attachmentType } from "@/types/attachment";
import type { UserCertification } from "@/types/user-certification";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export type CertFormState = {
  title: string;
  issuing_organization: string;
  issued_on: Date | undefined;
  expires_on: Date | undefined;
  attachments: (attachmentType | File)[];
};

export const emptyCertForm = (): CertFormState => ({
  title: "",
  issuing_organization: "",
  issued_on: undefined,
  expires_on: undefined,
  attachments: [],
});

type CertificationComposerProps = {
  open: boolean;
  mode: "add" | "edit";
  form: CertFormState;
  onFormChange: Dispatch<SetStateAction<CertFormState>>;
  editing: UserCertification | null;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
};

export function CertificationComposer({
  open,
  mode,
  form,
  onFormChange,
  editing,
  onSave,
  onCancel,
  isSaving,
}: CertificationComposerProps) {
  const reduced = useReducedMotion();
  const barVariants = reduced ? crossfadeInstant : revealBar;
  const contentVariants = reduced ? crossfadeInstant : crossfade;
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
  }, [open, mode, editing?.id]);

  const canSave =
    form.title.trim().length > 0 &&
    form.issuing_organization.trim().length > 0 &&
    Boolean(form.issued_on);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="cert-composer"
          variants={barVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="overflow-hidden motion-reduce:transition-none"
        >
          <div className="rounded-lg border border-border bg-surface-sunken/40 p-4">
            <motion.div
              key={mode === "add" ? "add" : `edit-${editing?.id}`}
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              <p className="text-sm font-medium text-text-primary">
                {mode === "add" ? "Add certification" : "Edit certification"}
              </p>
              <div className="space-y-2">
                <label htmlFor="cert-title">Title</label>
                <Input
                  ref={titleRef}
                  id="cert-title"
                  value={form.title}
                  onChange={(e) =>
                    onFormChange((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="cert-org">Issuing organization</label>
                <Input
                  id="cert-org"
                  value={form.issuing_organization}
                  onChange={(e) =>
                    onFormChange((f) => ({
                      ...f,
                      issuing_organization: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label>Issue date</label>
                  <DatePicker
                    date={form.issued_on}
                    setDate={(date) =>
                      onFormChange((f) => ({ ...f, issued_on: date }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label>Expiry date (optional)</label>
                  <DatePicker
                    date={form.expires_on}
                    setDate={(date) =>
                      onFormChange((f) => ({ ...f, expires_on: date }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label>File (PDF or image, max 10 MB)</label>
                <AttachmentUploader
                  entityName="certification"
                  maxFiles={1}
                  attachments={form.attachments}
                  setAttachments={(attachments) =>
                    onFormChange((f) => ({ ...f, attachments }))
                  }
                />
                {editing?.attachment_filename &&
                form.attachments.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    Current file: {editing.attachment_filename}. Upload a new
                    file to replace it.
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={onSave}
                  isLoading={isSaving}
                  disabled={!canSave}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
