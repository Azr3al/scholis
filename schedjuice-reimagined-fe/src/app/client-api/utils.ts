import { queryParamDefault } from "@/config/defaults";
import { axiosClient } from "@/lib/api";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { filterParamsBody, queryParamOptions } from "@/types/api";
import { AxiosRequestConfig, default as axios } from "axios";

export function encodeArrayToBase64(array: Array<string>) {
  return Buffer.from(JSON.stringify(array)).toString("base64");
}
export function encodeQueryData(data: any) {
  const ret = [];
  for (let d in data) {
    const v = data[d];
    if (v === undefined || v === null) continue;
    ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(v));
  }
  return "?" + ret.join("&");
}

export const makeSearchParams = (queryParams: queryParamOptions) => {
  const data: any = {
    page: String(queryParams.page || queryParamDefault.page),
    size: String(queryParams.size || queryParamDefault.size),
    sorts: encodeArrayToBase64(queryParams.sorts || []),
    expand: encodeArrayToBase64(queryParams.expand || []),
    csv: String(queryParams.csv || queryParamDefault.csv),
    group_by: queryParams.group_by || queryParamDefault.group_by,
    range: queryParams.range || undefined,
    range_group_by:
      queryParams.range_group_by || queryParamDefault.range_group_by,
  };
  if (queryParams.onlyFree) {
    data.onlyFree = queryParams.onlyFree;
  }
  if (queryParams.assigned_as_role_id != null) {
    data.assigned_as_role_id = String(queryParams.assigned_as_role_id);
  }
  if (queryParams.q) {
    data.q = queryParams.q;
  }
  if (queryParams.all) {
    data.all = queryParams.all;
  }
  if (queryParams?.fields?.length) {
    data.fields = encodeArrayToBase64(queryParams.fields || []);
  }
  if (queryParams.include_inactive) {
    data.include_inactive = "true";
  }
  if (queryParams.include_alumni) {
    data.include_alumni = "true";
  }
  if (queryParams.teacher_roster_order) {
    data.teacher_roster_order = "true";
  }
  if (queryParams.student_roster_order) {
    data.student_roster_order = "true";
  }
  return encodeQueryData(data);
};

export const fetchEntity = async (
  entity: string,
  entityId: number | string,
  expandParams: string[] = [],
) => {
  return await axiosClient.get(
    `${entity}/${entityId}?expand=${encodeArrayToBase64(expandParams)}`,
  );
};

export const fetchEntities = async (
  entity: string,
  queryParams: queryParamOptions = queryParamDefault,
) => {
  return await axiosClient.get(entity + makeSearchParams(queryParams));
};

export const searchEntities = async (
  entity: string,
  queryParams: queryParamOptions = queryParamDefault,
  filterParams: filterParamsBody = {},
  options: AxiosRequestConfig = {},
) => {
  return await axiosClient.post(
    `${entity}/search${makeSearchParams(queryParams)}`,
    filterParams,
    options,
  );
};

export const makePostRequest = async (
  url: string,
  data: Object,
  queryParamOptions: queryParamOptions | any = queryParamDefault,
  headers: any = {},
  options: AxiosRequestConfig = {},
) => {
  return await axiosClient.post(
    `${url}${makeSearchParams(queryParamOptions)}`,
    data,
    { headers: headers, ...options },
  );
};
export const makeGetRequest = async (
  url: string,
  queryParamOptions = queryParamDefault,
) => {
  return await axiosClient.get(`${url}${makeSearchParams(queryParamOptions)}`);
};

export const updateEntities = async (entity: string, data: Object) => {
  return await axiosClient.put(`${entity}`, data);
};

export const updateEntity = async (
  entity: string,
  entityId: number | string,
  data: Object,
  headers: any = {},
) => {
  return await axiosClient.put(`${entity}/${entityId}`, data, {
    headers: headers,
  });
};

export const updateEntityWithFormData = async (
  entity: string,
  entityId: number | string,
  data: FormData,
) => {
  return await axiosClient.put(`${entity}/${entityId}`, data);
};

export const deleteEntity = async (
  entity: string,
  entityId: number | string,
) => {
  return await axiosClient.delete(`${entity}/${entityId}`);
};

/** GET users/available-for-timeslot — teachers free in a month/weekday/timeslot grid (tenant timezone). */
export const fetchAvailableTeachersForTimeslot = async (params: {
  yearMonth: string;
  timeFrom: string;
  timeTo: string;
  weekdays: string;
  dayParity?: "all" | "even" | "odd";
  page?: number;
  size?: number;
}) => {
  const sp = new URLSearchParams({
    year_month: params.yearMonth,
    time_from: params.timeFrom,
    time_to: params.timeTo,
    weekdays: params.weekdays,
  });
  if (params.dayParity && params.dayParity !== "all") {
    sp.set("day_parity", params.dayParity);
  }
  if (params.page != null) {
    sp.set("page", String(params.page));
  }
  if (params.size != null) {
    sp.set("size", String(params.size));
  }
  return axiosClient.get(`users/available-for-timeslot?${sp.toString()}`);
};

export async function setupProgramStructure(
  programId: string,
  levels: { name: string; sort_order: number; sections: { name: string; sort_order: number }[] }[],
) {
  try {
    const res = await axiosClient.post(`programs/${programId}/setup-structure`, {
      levels,
    });
    const body = res.data as { isError?: boolean; details?: unknown; message?: unknown };
    if (body?.isError) {
      throw new Error(
        parseSchedjuiceApiError(
          { response: { data: body } },
          "Could not save program structure.",
        ),
      );
    }
    return res;
  } catch (err) {
    if (err instanceof Error && !axios.isAxiosError(err)) {
      throw err;
    }
    throw new Error(
      parseSchedjuiceApiError(err, "Could not save program structure."),
    );
  }
}

export type AddSubjectsResult = {
  created_subjects: number;
  linked: number;
  skipped_already_linked: number;
  results: { name: string; subject_id: number; status: string }[];
};

export async function addSubjectsToProgram(
  programId: string,
  names: string[],
): Promise<AddSubjectsResult> {
  try {
    const res = await axiosClient.post(`programs/${programId}/add-subjects`, {
      names,
    });
    const body = res.data as { isError?: boolean } & AddSubjectsResult;
    if (body?.isError) {
      throw new Error(
        parseSchedjuiceApiError(
          { response: { data: body } },
          "Could not add subjects.",
        ),
      );
    }
    return body;
  } catch (err) {
    if (err instanceof Error && !axios.isAxiosError(err)) {
      throw err;
    }
    throw new Error(parseSchedjuiceApiError(err, "Could not add subjects."));
  }
}

export async function setupProgramCurriculum(
  programId: string,
  assignments: { level: number; subject: number; sort_order: number }[],
) {
  try {
    const res = await axiosClient.post(`programs/${programId}/setup-curriculum`, {
      assignments,
    });
    const body = res.data as { isError?: boolean; details?: unknown; message?: unknown };
    if (body?.isError) {
      throw new Error(
        parseSchedjuiceApiError(
          { response: { data: body } },
          "Could not save curriculum.",
        ),
      );
    }
    return res;
  } catch (err) {
    if (err instanceof Error && !axios.isAxiosError(err)) {
      throw err;
    }
    throw new Error(parseSchedjuiceApiError(err, "Could not save curriculum."));
  }
}
