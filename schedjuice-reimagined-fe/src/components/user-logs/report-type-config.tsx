"use client";
import { Button, Input, Select, Switch, useToast } from "@/components/primitives";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReportType,
  deleteReportType,
  fetchReportTypes,
  replaceReportTypeFields,
  updateReportType,
} from "@/lib/user-logs-api";
import {
  findFirstInvalidDraftField,
  type DraftReportTypeField,
} from "@/lib/user-logs/report-type-field-validation";
import type { AppliesTo, ReportType } from "@/types/user-log";
import {
  ReportTypeFieldList,
  type ReportTypeFieldListHandle,
} from "./report-type-field-list";
import { useUser } from "@/hooks/useUser";
import { canManageActiveStatus } from "@/lib/form/field-visibility";

export function ReportTypeConfig() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useUser();
  const canManageActive = canManageActiveStatus(user);
  const fieldListRef = useRef<ReportTypeFieldListHandle>(null);
  const { data: types = [], isLoading } = useQuery({
    queryKey: ["report-types"],
    queryFn: fetchReportTypes,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = types.find((t) => t.id === selectedId) ?? null;

  const [newName, setNewName] = useState("");
  const [draftFields, setDraftFields] = useState<DraftReportTypeField[]>([]);

  const saveFields = useMutation({
    mutationFn: () => replaceReportTypeFields(selectedId!, draftFields),
    onSuccess: () => {
      toast.add({ title: "Fields saved." });
      void qc.invalidateQueries({ queryKey: ["report-types"] });
    },
  });

  function selectType(t: ReportType) {
    setSelectedId(t.id);
    setDraftFields(
      (t.fields ?? []).map((f) => ({
        field_key: f.field_key,
        field_label: f.field_label,
        field_type: f.field_type,
        is_required: f.is_required,
        choices: f.choices,
        sort_order: f.sort_order,
      })),
    );
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const created = await createReportType({
      name: newName.trim(),
      applies_to: "BOTH",
    });
    setNewName("");
    void qc.invalidateQueries({ queryKey: ["report-types"] });
    selectType(created);
  }

  function handleSaveFields() {
    const invalid = findFirstInvalidDraftField(draftFields);
    if (!invalid.ok) {
      toast.add({
        title: "Fix field errors before saving",
        description: invalid.message});
      if (invalid.index != null) {
        fieldListRef.current?.openFieldAtIndex(invalid.index);
      }
      return;
    }
    saveFields.mutate();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Report types</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {types.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 ${
                    selectedId === t.id ? "bg-muted/60" : ""
                  }`}
                  onClick={() => selectType(t)}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="New report type name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button onClick={handleCreate}>Add</Button>
        </div>
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">
                Applies to: {selected.applies_to}
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await deleteReportType(selected.id);
                setSelectedId(null);
                void qc.invalidateQueries({ queryKey: ["report-types"] });
              }}
            >
              Delete
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label>Name</label>
              <Input
                defaultValue={selected.name}
                onBlur={async (e) => {
                  await updateReportType(selected.id, { name: e.target.value });
                  void qc.invalidateQueries({ queryKey: ["report-types"] });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label>Applies to</label>
              <Select
                defaultValue={selected.applies_to}
                onValueChange={async (v) => {
                  await updateReportType(selected.id, { applies_to: v as AppliesTo });
                  void qc.invalidateQueries({ queryKey: ["report-types"] });
                }}
                items={[
                  { value: "STUDENT", label: "Student" },
                  { value: "STAFF", label: "Staff" },
                  { value: "BOTH", label: "Both" },
                ]}
              />
            </div>
            {canManageActive ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={selected.is_active}
                  onCheckedChange={async (checked) => {
                    await updateReportType(selected.id, { is_active: checked });
                    void qc.invalidateQueries({ queryKey: ["report-types"] });
                  }}
                />
                <label>Active</label>
              </div>
            ) : null}
          </div>

          <fieldset
            disabled={saveFields.isPending}
            className="min-w-0 border-0 p-0 m-0"
          >
          <ReportTypeFieldList
            ref={fieldListRef}
            value={draftFields}
            onChange={setDraftFields}
          />
          </fieldset>
          <Button onClick={handleSaveFields} isLoading={saveFields.isPending}>
            Save fields
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a report type to edit its fields.
        </p>
      )}
    </div>
  );
}
