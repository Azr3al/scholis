"use client";
import { Button, useToast } from "@/components/primitives";

import {
  CertificationComposer,
  emptyCertForm,
  type CertFormState,
} from "@/components/users/certification-composer";
import {
  createUserCertification,
  deleteUserCertification,
  fetchUserCertifications,
  updateUserCertification,
} from "@/helpers/user-certifications";
import { getDateISOString } from "@/helpers/date";
import { parseAttachmentUploadIds, uploadAttachments } from "@/helpers/file";
import type { UserCertification } from "@/types/user-certification";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Page as FileText, EditPencil as Pencil, Plus, Trash as Trash2 } from "iconoir-react";
import { useMemo, useState } from "react";

/** Stable fallback so loading renders don't allocate a new [] every time. */
const EMPTY_CERTIFICATIONS: UserCertification[] = [];

export function UserCertificationsSection({
  userId,
  canEdit,
}: {
  userId: number;
  canEdit: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["user-certifications", userId], [userId]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<UserCertification | null>(null);
  const [form, setForm] = useState<CertFormState>(emptyCertForm);

  const { data: certifications, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchUserCertifications(userId),
  });

  const resolvedCertifications = certifications ?? EMPTY_CERTIFICATIONS;

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const closeComposer = () => {
    setComposerOpen(false);
    setEditing(null);
    setForm(emptyCertForm());
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let attachmentId: number | null | undefined = editing?.attachment_id ?? null;
      const pendingFile = form.attachments.find((a) => a instanceof File) as File | undefined;
      if (pendingFile) {
        const res = await uploadAttachments([pendingFile], "user_certification", String(userId));
        attachmentId = parseAttachmentUploadIds(res)[0] ?? null;
      }
      const payload = {
        title: form.title.trim(),
        issuing_organization: form.issuing_organization.trim(),
        issued_on: form.issued_on ? getDateISOString(form.issued_on) : "",
        expires_on: form.expires_on ? getDateISOString(form.expires_on) : null,
        attachment_id: attachmentId,
      };
      if (editing) {
        return updateUserCertification(userId, editing.id, payload);
      }
      return createUserCertification(userId, payload);
    },
    onSuccess: () => {
      toast.add({ title: editing ? "Certification updated" : "Certification added" });
      closeComposer();
      void invalidate();
    },
    onError: () => {
      toast.add({
        title: "Could not save certification",
        description: "Check the fields and try again."});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (certId: number) => deleteUserCertification(userId, certId),
    onSuccess: () => {
      toast.add({ title: "Certification removed" });
      void invalidate();
    },
    onError: () => {
      toast.add({ title: "Could not remove certification" });
    },
  });

  const scrollComposerIntoView = () => {
    requestAnimationFrame(() => {
      document.getElementById("cert-composer-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyCertForm());
    setComposerMode("add");
    setComposerOpen(true);
    scrollComposerIntoView();
  };

  const openEdit = (cert: UserCertification) => {
    setEditing(cert);
    setForm({
      title: cert.title,
      issuing_organization: cert.issuing_organization,
      issued_on: cert.issued_on ? new Date(cert.issued_on) : undefined,
      expires_on: cert.expires_on ? new Date(cert.expires_on) : undefined,
      attachments: [],
    });
    setComposerMode("edit");
    setComposerOpen(true);
    scrollComposerIntoView();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Certifications</h3>
          <p className="text-sm text-text-muted">
            Upload credentials with title, issuer, and dates.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openCreate}
            disabled={composerOpen}
          >
            <Plus className="mr-1 size-4" />
            Add
          </Button>
        ) : null}
      </div>

      <div id="cert-composer-anchor">
        <CertificationComposer
          open={composerOpen && canEdit}
          mode={composerMode}
          form={form}
          onFormChange={setForm}
          editing={editing}
          onSave={() => saveMutation.mutate()}
          onCancel={closeComposer}
          isSaving={saveMutation.isPending}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Loading certifications…</p>
      ) : resolvedCertifications.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-text-muted">
          No certifications added yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {resolvedCertifications.map((cert) => (
            <li
              key={cert.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{cert.title}</p>
                <p className="text-sm text-text-muted">{cert.issuing_organization}</p>
                <p className="mt-1 text-xs text-text-muted">
                  Issued {cert.issued_on}
                  {cert.expires_on ? ` · Expires ${cert.expires_on}` : ""}
                </p>
                {cert.attachment_url ? (
                  <a
                    href={cert.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary"
                  >
                    <FileText className="size-4" />
                    {cert.attachment_filename ?? "View file"}
                  </a>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="sm" className="size-8 p-0" onClick={() => openEdit(cert)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm" className="size-8 p-0"
                    onClick={() => deleteMutation.mutate(cert.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
