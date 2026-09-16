import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import type { EntityComboboxCreateNewConfig } from "@/components/form/entity-combobox";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { operatorEnum } from "@/types/api";

export async function createSubjectByName(name: string): Promise<number> {
  const res = await makePostRequest("subjects", { name: name.trim() });
  const id = res?.data?.data?.id;
  if (id == null) {
    throw new Error("Missing id in response");
  }
  return id;
}

export function isDuplicateSubjectNameError(err: unknown): boolean {
  const message = parseSchedjuiceApiError(err, "").toLowerCase();
  return message.includes("already exist");
}

export async function findSubjectIdByName(name: string): Promise<number | undefined> {
  const res = await searchEntities(
    "subjects",
    { fields: ["id", "name"], page: 1, size: 1 },
    {
      filter_params: [
        {
          field_name: "name",
          operator: operatorEnum.exact,
          value: name.trim(),
        },
      ],
    },
  );
  const row = (res?.data?.data ?? [])[0] as { id?: number } | undefined;
  return row?.id;
}

/** Create a subject, or return the existing tenant subject when the name is taken. */
export async function createOrResolveSubjectByName(name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Subject name is required.");
  }
  try {
    return await createSubjectByName(trimmed);
  } catch (err) {
    if (!isDuplicateSubjectNameError(err)) throw err;
    const existingId = await findSubjectIdByName(trimmed);
    if (existingId == null) throw err;
    return existingId;
  }
}

/** Shared inline-create UX for subject comboboxes (intake wizard, course forms). */
export const subjectCreateConfig: EntityComboboxCreateNewConfig = {
  buttonLabel: "New subject",
  dialogTitle: "Create subject",
  inputLabel: "Name",
  inputPlaceholder: "e.g. Mathematics",
  create: createOrResolveSubjectByName,
};
