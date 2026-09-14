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

export type AdmissionsMainTeacher = {
  id: number;
  name: string;
  phone_number?: string | null;
};

export type AdmissionsAttendingClass = {
  course_id: number;
  title: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  current_unit?: number | null;
  current_unit_updated_at?: string | null;
  main_teachers: AdmissionsMainTeacher[];
  latest_payment: AdmissionsLatestPayment | null;
};

export type AdmissionsAttendingPayload = AdmissionsPersonRow & {
  is_attending: boolean;
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
