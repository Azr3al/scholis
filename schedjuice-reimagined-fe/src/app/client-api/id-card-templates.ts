import { axiosClient } from "@/lib/api";
import type {
  IdCardTemplate,
  IdCardTemplateAudience,
  IdCardTemplateSlot,
} from "@/types/id-card-template";

type ApiEnvelope<T> = { data: T };

export async function fetchIdCardTemplates(
  orgId: number,
  audience?: IdCardTemplateAudience,
): Promise<IdCardTemplate[]> {
  const params = audience ? { audience } : undefined;
  const res = await axiosClient.get<ApiEnvelope<IdCardTemplate[]>>(
    `organizations/${orgId}/id-card-templates`,
    { params },
  );
  return res.data.data;
}

export async function fetchIdCardTemplate(
  orgId: number,
  templateId: number,
): Promise<IdCardTemplate> {
  const res = await axiosClient.get<ApiEnvelope<IdCardTemplate>>(
    `organizations/${orgId}/id-card-templates/${templateId}`,
  );
  return res.data.data;
}

export async function createIdCardTemplate(
  orgId: number,
  payload: FormData,
): Promise<IdCardTemplate> {
  const res = await axiosClient.post<ApiEnvelope<IdCardTemplate>>(
    `organizations/${orgId}/id-card-templates`,
    payload,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.data;
}

export type UpdateIdCardTemplatePayload = {
  name?: string;
  width_in?: number;
  height_in?: number;
  slots?: IdCardTemplateSlot[];
  back_slots?: IdCardTemplateSlot[];
  academic_year?: string | null;
  expires_on?: string | null;
  background?: File;
  back_background?: File;
  background_transform?: {
    front: { offsetX: number; offsetY: number; scale: number };
    back: { offsetX: number; offsetY: number; scale: number };
  };
};

export async function updateIdCardTemplate(
  orgId: number,
  templateId: number,
  payload: UpdateIdCardTemplatePayload | FormData,
): Promise<IdCardTemplate> {
  const body =
    payload instanceof FormData
      ? payload
      : (() => {
          const fd = new FormData();
          if (payload.name != null) fd.append("name", payload.name);
          if (payload.width_in != null) fd.append("width_in", String(payload.width_in));
          if (payload.height_in != null) fd.append("height_in", String(payload.height_in));
          if (payload.slots != null) fd.append("slots", JSON.stringify(payload.slots));
          if (payload.back_slots != null) {
            fd.append("back_slots", JSON.stringify(payload.back_slots));
          }
          if (payload.academic_year !== undefined) {
            fd.append("academic_year", payload.academic_year ?? "");
          }
          if (payload.expires_on !== undefined) {
            fd.append("expires_on", payload.expires_on ?? "");
          }
          if (payload.background) fd.append("background", payload.background);
          if (payload.back_background) {
            fd.append("back_background", payload.back_background);
          }
          if (payload.background_transform != null) {
            fd.append(
              "background_transform",
              JSON.stringify(payload.background_transform),
            );
          }
          return fd;
        })();

  const res = await axiosClient.patch<ApiEnvelope<IdCardTemplate>>(
    `organizations/${orgId}/id-card-templates/${templateId}`,
    body,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.data;
}

export async function deleteIdCardTemplate(
  orgId: number,
  templateId: number,
): Promise<void> {
  await axiosClient.delete(`organizations/${orgId}/id-card-templates/${templateId}`);
}

export async function activateIdCardTemplate(
  orgId: number,
  templateId: number,
): Promise<IdCardTemplate> {
  const res = await axiosClient.post<ApiEnvelope<IdCardTemplate>>(
    `organizations/${orgId}/id-card-templates/${templateId}/activate`,
  );
  return res.data.data;
}
