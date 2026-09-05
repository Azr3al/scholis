import { makeGetRequest, makePostRequest, searchEntities } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import { attachmentType } from "@/types/attachment";
import { operatorEnum } from "@/types/api";
import { getCookie, getCookies } from "cookies-next";

/** Presigned GET URL for a quiz-scoped private attachment (24h on backend). */
export async function fetchQuizAttachmentPresignedUrl(
  attachmentId: number,
  quizId: number,
): Promise<string | null> {
  const res = await searchEntities(
    "attachments",
    { ...queryParamDefault, page: 1, size: 10 },
    {
      filter_params: [
        {
          field_name: "id",
          operator: operatorEnum.exact,
          value: String(attachmentId),
        },
        {
          field_name: "quiz",
          operator: operatorEnum.exact,
          value: String(quizId),
        },
      ],
    },
  );
  const envelope = res?.data as {
    data?: Array<{ data?: string | null }>;
  };
  const row = envelope?.data?.[0];
  const url = row?.data;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/** Presigned GET URL for a user qualifications inline image attachment. */
export async function fetchUserQualificationAttachmentPresignedUrl(
  attachmentId: number,
  userId: number,
): Promise<string | null> {
  const res = await searchEntities(
    "attachments",
    { ...queryParamDefault, page: 1, size: 10 },
    {
      filter_params: [
        {
          field_name: "id",
          operator: operatorEnum.exact,
          value: String(attachmentId),
        },
        {
          field_name: "table_name",
          operator: operatorEnum.exact,
          value: "user_qualifications",
        },
        {
          field_name: "foreign_key",
          operator: operatorEnum.exact,
          value: String(userId),
        },
      ],
    },
  );
  const envelope = res?.data as {
    data?: Array<{ data?: string | null }>;
  };
  const row = envelope?.data?.[0];
  const url = row?.data;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export const getAttachments = async (
  tableName?: string,
  foreignKey?: number,
) => {
    const body: any = {};
    if(tableName){
        body.table_name = tableName;
    }
    if(foreignKey){
        body.foreign_key = foreignKey;
    }
  return await makePostRequest(
    "attachments/search",
    body,
    { size: -1 }
  );
};
