"use client";
import { Button, Skeleton, buttonVariants, useToast } from "@/components/primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/misc/toggle-group";

import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { useFieldGroups } from "@/hooks/use-field-groups";
import { useFieldPolicyMutations } from "@/hooks/use-field-policy-mutations";
import { buildDesignerStructure } from "@/lib/custom-fields/group-structure";
import {
  reindexGroupFields,
  reindexGroups,
} from "@/lib/custom-fields/reorder-ops";
import {
  CUSTOM_FIELD_ENTITY_COURSE,
  CUSTOM_FIELD_ENTITY_USER,
  type CustomFieldDefinitionDto,
} from "@/types/custom-fields";
import { role } from "@/types/user";
import { useMemo, useState } from "react";
import { DesignerPreview } from "./designer-preview";
import { DesignerStructure } from "./designer-structure";
import { FieldEditorSheet, type FieldEditorSubmit } from "./field-editor-sheet";

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ROLE_OPTIONS = Object.values(role).map((r) => ({
  value: r,
  label: titleCase(r),
}));

function newGroupId(res: unknown): number {
  const data = (res as { data?: { data?: { id?: unknown } } })?.data?.data;
  const id = data?.id;
  if (typeof id === "number") return id;
  throw new Error("Group create did not return an id.");
}

export function FormDesigner() {
  const toast = useToast();
  const [entityType, setEntityType] = useState<string>(CUSTOM_FIELD_ENTITY_USER);
  const [editing, setEditing] = useState<CustomFieldDefinitionDto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const definitions = useFieldDefinitions(entityType);
  const groups = useFieldGroups(entityType);
  const m = useFieldPolicyMutations(entityType);

  const structure = useMemo(
    () => buildDesignerStructure(definitions.data ?? [], groups.data ?? []),
    [definitions.data, groups.data]
  );

  const roleOptions = entityType === CUSTOM_FIELD_ENTITY_USER ? ROLE_OPTIONS : [];

  const isLoading = definitions.isLoading || groups.isLoading;
  const isError = definitions.isError || groups.isError;

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (f: CustomFieldDefinitionDto) => {
    setEditing(f);
    setSheetOpen(true);
  };

  const handleSubmit = async ({ body, id }: FieldEditorSubmit) => {
    try {
      if (id == null) await m.createDefinition.mutateAsync(body);
      else await m.updateDefinition.mutateAsync({ id, body });
      setSheetOpen(false);
      toast.add({ description: id == null ? "Field added." : "Field updated." });
    } catch (err) {
      const details = (err as { response?: { data?: { details?: unknown } } })
        ?.response?.data?.details;
      // Field editor maps field_label / field_key onto the form; skip generic toast.
      const hasFieldDetails =
        details != null &&
        typeof details === "object" &&
        !Array.isArray(details) &&
        ("field_label" in details || "field_key" in details);
      if (!hasFieldDetails) {
        toast.add({ type: "error", description: "Could not save the field." });
      }
      throw err;
    }
  };

  const handleCreateGroup = async (name: string): Promise<number> => {
    const res = await m.createGroup.mutateAsync({
      entity_type: entityType,
      name,
      sort_order: groups.data?.length ?? 0,
    });
    return newGroupId(res);
  };

  const handleReorderGroups = async (ids: number[]) => {
    try {
      await m.reorderGroups.mutateAsync(reindexGroups(ids));
      toast.add({ description: "Group order saved." });
    } catch {
      toast.add({ type: "error", description: "Could not save group order." });
      void groups.refetch();
    }
  };

  const handleReorderFields = async (groupId: number, ids: number[]) => {
    try {
      await m.reorderDefinitions.mutateAsync(reindexGroupFields(groupId, ids));
      toast.add({ description: "Field order saved." });
    } catch {
      toast.add({ type: "error", description: "Could not save field order." });
      void definitions.refetch();
    }
  };

  return (
    <div className="space-y-6">
      <ToggleGroup
        type="single"
        variant="secondary"
        value={entityType}
        onValueChange={(v) => v && setEntityType(v)}
        className="justify-start"
      >
        <ToggleGroupItem value={CUSTOM_FIELD_ENTITY_USER}>Users</ToggleGroupItem>
        <ToggleGroupItem value={CUSTOM_FIELD_ENTITY_COURSE}>Courses</ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/40 p-6 text-sm">
              <p className="text-destructive">Could not load fields.</p>
              <Button
                type="button"
                variant="secondary" size="sm"
                className="mt-3"
                onClick={() => {
                  void definitions.refetch();
                  void groups.refetch();
                }}
              >
                Retry
              </Button>
            </div>
          ) : structure.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No fields yet. Add your first field to start designing the form.
              </p>
              <Button type="button" className="mt-4" onClick={openCreate}>
                Add field
              </Button>
            </div>
          ) : (
            <DesignerStructure
              structure={structure}
              onEditField={openEdit}
              onDeactivateField={(f) => m.deleteDefinition.mutate(f.id)}
              onAddField={openCreate}
              onReorderFields={handleReorderFields}
              onReorderGroups={handleReorderGroups}
              onRenameGroup={(id, name) =>
                m.updateGroup.mutate({ id, body: { name } })
              }
              onAddGroup={(name) =>
                m.createGroup.mutate({
                  entity_type: entityType,
                  name,
                  sort_order: groups.data?.length ?? 0,
                })
              }
            />
          )}
        </div>

        <DesignerPreview entityType={entityType} roleOptions={roleOptions} />
      </div>

      <FieldEditorSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entityType={entityType}
        groups={groups.data ?? []}
        existingDefinitions={definitions.data ?? []}
        roleOptions={roleOptions}
        editing={editing}
        onCreateGroup={handleCreateGroup}
        onSubmit={handleSubmit}
        isSaving={m.createDefinition.isPending || m.updateDefinition.isPending}
      />
    </div>
  );
}
