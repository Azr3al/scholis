"use client";
import { useToast } from "@/components/primitives";

import { updateEntity } from "@/app/client-api/utils";
import { GroupSection } from "@/components/custom-fields/group-section";
import { AutosaveProvider } from "@/components/form/autosave-context";
import { prepareUserFormPayload } from "@/components/users/user-form-utils";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { collectGroupPayload } from "@/lib/custom-fields/completion";
import type { FormActor } from "@/lib/custom-fields/field-policy";
import { useTenant } from "@/hooks/useTenant";
import type { FormConfigGroup } from "@/types/form-config";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";
import { useForm } from "react-hook-form";

export function CompletionGroupForm({
  userId,
  group,
  actor,
  onSaved,
}: {
  userId: number;
  group: FormConfigGroup;
  actor: FormActor;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { tenant } = useTenant();
  const form = useForm({ defaultValues: { custom_data: {} } });

  const autosave = useAutosaveForm({
    form,
    queryKey: ["getUser", userId],
    buildPayload: () => {
      const values = form.getValues();
      const normalized = prepareUserFormPayload(
        values as Record<string, unknown>,
        { mode: "edit", tenant, fields: group.fields },
      );
      return collectGroupPayload(group.fields, normalized);
    },
    save: async (payload) => {
      try {
        const res = await updateEntity("users", userId, payload);
        onSaved();
        return res;
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        toast.add({ type: "error", description: "Could not save." });
        throw e; // let the hook roll back the cache and flag error
      }
    },
  });

  return (
    <AutosaveProvider value={autosave} showGlobalStatus={false}>
      <div {...form}>
        <div
          onBlurCapture={(e) => {
            const el = e.target as HTMLElement;
            const name =
              el.getAttribute("name") ??
              el.closest("[data-field-name]")?.getAttribute("data-field-name");
            if (name) autosave.bindField(name).onBlur();
          }}
          className="space-y-4 border-t pt-4"
        >
          <h3 className="text-sm font-semibold">{group.name}</h3>
          <GroupSection
            form={form}
            group={group}
            surface="edit"
            actor={actor}
            commitField={autosave.commitField}
            entityType={CUSTOM_FIELD_ENTITY_USER}
          />
        </div>
      </div>
    </AutosaveProvider>
  );
}
