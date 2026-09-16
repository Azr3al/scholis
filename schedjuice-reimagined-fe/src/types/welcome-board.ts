import type { attachmentType } from "@/types/attachment";

export enum WelcomeBoardAudience {
  staff = "staff",
  student = "student",
}

export type WelcomeBoardPayload = {
  id: number;
  audience: WelcomeBoardAudience;
  body_html: string | null;
  body_plain: string | null;
  updated_at: string;
  updated_by: number | null;
  attachments: attachmentType[];
  is_effectively_empty: boolean;
  can_edit: boolean;
  resolved_audience?: WelcomeBoardAudience | null;
};
