import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import type { EntityComboboxCreateNewConfig } from "@/components/form/entity-combobox";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { operatorEnum } from "@/types/api";

export async function createCategoryByName(name: string): Promise<number> {
  const res = await makePostRequest("categories", { name: name.trim() });
  const id = res?.data?.data?.id;
  if (id == null) {
    throw new Error("Missing id in response");
  }
  return id;
}

export function isDuplicateCategoryNameError(err: unknown): boolean {
  const message = parseSchedjuiceApiError(err, "").toLowerCase();
  return message.includes("already exist");
}

export async function findCategoryIdByName(
  name: string,
): Promise<number | undefined> {
  const res = await searchEntities(
    "categories",
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

/** Create a category, or return the existing tenant category when the name is taken. */
export async function createOrResolveCategoryByName(
  name: string,
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Category name is required.");
  }
  try {
    return await createCategoryByName(trimmed);
  } catch (err) {
    if (!isDuplicateCategoryNameError(err)) throw err;
    const existingId = await findCategoryIdByName(trimmed);
    if (existingId == null) throw err;
    return existingId;
  }
}

/** Shared inline-create UX for category comboboxes (intake wizard, course forms). */
export const categoryCreateConfig: EntityComboboxCreateNewConfig = {
  buttonLabel: "New category",
  dialogTitle: "Create category",
  inputLabel: "Name",
  inputPlaceholder: "e.g. ACCA",
  create: createOrResolveCategoryByName,
};
