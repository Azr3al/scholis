"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { makeGetRequest } from "@/app/client-api/utils";
import type { AdmissionsPersonRow } from "./use-admissions-people";

export type AdmissionsLatestPayment = {
  payment_date: string | null;
  amount: string | number | null;
  receipt_number: number | string | null;
  covered_months?: { year: number; month_index: number }[];
  status: string;
  created_by: { id: number; name: string } | null;
  remarks: string | null;
  screenshot: string | null;
};

export type AdmissionsAttendingClass = {
  course_id: number;
  title: string;
  latest_payment: AdmissionsLatestPayment | null;
};

export type AdmissionsAttendingPayload = AdmissionsPersonRow & {
  classes: AdmissionsAttendingClass[];
};

export function useAdmissionsAttending(personId: number | null) {
  return useQuery({
    queryKey: ["admissions-attending", personId],
    enabled: personId != null,
    queryFn: async (): Promise<AdmissionsAttendingPayload> => {
      const res = await makeGetRequest(
        `admissions/people/${personId}/attending`,
      );
      return res.data.data as AdmissionsAttendingPayload;
    },
  });
}

export function isAttendingNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}
