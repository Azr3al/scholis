import axios from "axios";

import { makePostRequest } from "@/app/client-api/utils";

export type PaymentEnrollmentResult = {
  course_id: number;
  user_course_id: number;
};

export type EnsureStudentEnrollmentsResponse = {
  enrollments: PaymentEnrollmentResult[];
  errors?: Record<string, string>;
};

export type EnsureStudentEnrollmentsError = Error & {
  courseErrors?: Record<string, string>;
  partialEnrollments?: PaymentEnrollmentResult[];
};

function parseEnsureEnrollmentsBody(body: unknown): EnsureStudentEnrollmentsResponse {
  const payload = body as {
    data?: EnsureStudentEnrollmentsResponse;
    enrollments?: PaymentEnrollmentResult[];
    errors?: Record<string, string>;
  };
  if (payload.data?.enrollments) {
    return payload.data;
  }
  return {
    enrollments: payload.enrollments ?? [],
    errors: payload.errors,
  };
}

export async function ensureStudentEnrollments(
  userId: number,
  courseIds: number[],
): Promise<EnsureStudentEnrollmentsResponse> {
  try {
    const res = await makePostRequest("user-payments/ensure-enrollments", {
      user_id: userId,
      course_ids: courseIds,
    });
    return parseEnsureEnrollmentsBody(res.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const body = error.response.data as {
        errors?: Record<string, string>;
        enrollments?: PaymentEnrollmentResult[];
      };
      if (body.errors) {
        const err = new Error("Enrollment failed") as EnsureStudentEnrollmentsError;
        err.courseErrors = body.errors;
        err.partialEnrollments = body.enrollments ?? [];
        throw err;
      }
    }
    throw error;
  }
}
