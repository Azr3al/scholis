import axios from "axios";
import { axiosClient } from "@/lib/api";
import type { UserFieldChangeRow } from "@/lib/users/field-history";

type ApiEnvelope<T> = { data: T };

export async function listUserFieldChanges(
  userId: number,
  page = 1,
): Promise<{ items: UserFieldChangeRow[]; count: number } | { unavailable: true }> {
  try {
    const res = await axiosClient.get<
      ApiEnvelope<{ items: UserFieldChangeRow[]; count: number }>
    >(`users/${userId}/field-changes`, {
      params: { page, size: 50 },
    });
    const data = res.data.data;
    return { items: data.items ?? [], count: data.count ?? 0 };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      return { unavailable: true };
    }
    throw error;
  }
}
