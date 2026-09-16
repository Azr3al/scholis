"use client";
import { Button, Dialog, Input, useToast } from "@/components/primitives";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AttachmentUploader from "@/components/attachment-uploader/attachment-uploader";
import { uploadToJuiceBox } from "@/helpers/file";
import { fetchReportTypes, createUserLog } from "@/lib/user-logs-api";
import { reportTypesForSubject } from "@/lib/user-logs/applies-to";
import type { ReportType } from "@/types/user-log";
import { LogEntryFieldRenderer } from "./log-entry-field-renderer";
import { RichBodyEditor } from "./rich-body-editor";

export function NewLogDialog({
  userId,
  subjectRoles,
  open,
  onOpenChange,
  onCreated,
}: {
  userId: number;
  subjectRoles: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const { data: types = [] } = useQuery({
    queryKey: ["report-types"],
    queryFn: fetchReportTypes,
  });
  const available = useMemo(
    () => reportTypesForSubject(types, subjectRoles),
    [types, subjectRoles],
  );

  const [selected, setSelected] = useState<ReportType | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setSelected(null);
    setTitle("");
    setBody("");
    setFieldValues({});
    setFiles([]);
  }

  async function submit() {
    if (!selected || !title.trim()) {
      toast.add({
        title: "Title and report type are required.",
      });
      return;
    }
    setSaving(true);
    try {
      const entry = await createUserLog(userId, {
        report_type: selected.id,
        title: title.trim(),
        body,
        field_values: fieldValues,
      });
      if (files.length) {
        await uploadToJuiceBox({
          files,
          tableName: "app_userlog_logentry",
          foreignKey: String(entry.id),
        });
      }
      toast.add({ title: "Log created." });
      reset();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.add({ title: "Failed to create log." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <Dialog.Title>{selected ? selected.name : "New log"}</Dialog.Title>
        {!selected ? (
          <div className="grid grid-cols-2 gap-2">
            {available.map((t) => (
              <Button
                key={t.id}
                variant="secondary"
                className="justify-start"
                onClick={() => setSelected(t)}
              >
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
              </Button>
            ))}
            {available.length === 0 && (
              <p className="col-span-2 text-sm text-muted-foreground">
                No report types available for this person.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label>Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <RichBodyEditor value={body} onChange={setBody} />
            {selected.fields && selected.fields.length > 0 && (
              <LogEntryFieldRenderer
                fields={selected.fields}
                values={fieldValues}
                onChange={(k, v) =>
                  setFieldValues((p) => ({ ...p, [k]: v }))
                }
              />
            )}
            <AttachmentUploader
              entityName="user-log"
              maxFiles={10}
              attachments={files}
              setAttachments={(a) => setFiles(a.filter((f): f is File => f instanceof File))}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Back
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? "Saving…" : "Create log"}
              </Button>
            </div>
          </div>
        )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
