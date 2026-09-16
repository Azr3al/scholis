import { axiosClient } from "@/lib/api";
import type {
  PointTransaction,
  PointType,
  StaffPointsSheetResponse,
  UserPointsResponse,
} from "@/types/points";

type Envelope<T> = { isError: boolean; message: string; data: T };

export async function fetchPointTypes(): Promise<PointType[]> {
  const res = await axiosClient.get<Envelope<PointType[]>>(
    "point-types?size=500",
  );
  return res.data.data;
}

export async function createPointType(
  input: Partial<PointType>,
): Promise<PointType> {
  const res = await axiosClient.post<Envelope<PointType>>("point-types", input);
  return res.data.data;
}

export async function updatePointType(
  id: number,
  input: Partial<PointType>,
): Promise<PointType> {
  const res = await axiosClient.patch<Envelope<PointType>>(
    `point-types/${id}`,
    input,
  );
  return res.data.data;
}

export async function fetchStaffPointsSheet(
  q?: string,
): Promise<StaffPointsSheetResponse> {
  const params = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await axiosClient.get<Envelope<StaffPointsSheetResponse>>(
    `points/staff-sheet${params}`,
  );
  return res.data.data;
}

export async function fetchUserPoints(
  userId: number,
): Promise<UserPointsResponse> {
  const res = await axiosClient.get<Envelope<UserPointsResponse>>(
    `users/${userId}/points`,
  );
  return res.data.data;
}

export async function postPointTransaction(
  userId: number,
  input: { point_type_id: number; delta: number; note: string },
): Promise<{ transaction: PointTransaction; balances: Record<string, number> }> {
  const res = await axiosClient.post<
    Envelope<{ transaction: PointTransaction; balances: Record<string, number> }>
  >(`users/${userId}/points/transactions`, input);
  return res.data.data;
}
