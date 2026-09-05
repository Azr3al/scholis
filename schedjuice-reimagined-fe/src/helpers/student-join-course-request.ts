import axios from "axios";
import { makeGetRequest, makePostRequest } from "@/app/client-api/utils";
import {
  courseJoinRequestStatus,
  type joinCourseLookupResponse,
} from "@/types/course";

export type StudentJoinRequestOutcome =
  | { kind: "request_sent"; courseTitle: string }
  | { kind: "already_pending"; courseTitle: string }
  | { kind: "already_enrolled"; courseTitle: string };

export class StudentJoinRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentJoinRequestError";
  }
}

export function studentJoinConfirmationCopy(
  outcome: StudentJoinRequestOutcome,
): { title: string; description: string } {
  switch (outcome.kind) {
    case "request_sent":
      return {
        title: "Request sent",
        description: `Your request to join ${outcome.courseTitle} has been sent. We'll notify you once it's approved.`,
      };
    case "already_pending":
      return {
        title: "Request pending",
        description: `Your request to join ${outcome.courseTitle} is already under review. We'll notify you once it's approved.`,
      };
    case "already_enrolled":
      return {
        title: "Already enrolled",
        description: `You're already enrolled in ${outcome.courseTitle}.`,
      };
  }
}

export async function submitStudentJoinCourseRequest(
  joinCode: string,
): Promise<StudentJoinRequestOutcome> {
  let courseTitle = "this class";
  let previousStatus: string | undefined;

  try {
    const lookup = await makeGetRequest(`courses/join/${joinCode}`);
    const lookupData = lookup.data.data as joinCourseLookupResponse;
    courseTitle = lookupData.title;
    previousStatus = lookupData.previous_join_request?.status;

    if (lookupData.is_join_code_disabled) {
      throw new StudentJoinRequestError(
        "Joining this course with a code is not available.",
      );
    }
    if (lookupData.is_join_code_expired) {
      throw new StudentJoinRequestError(
        "This invite link is invalid or expired.",
      );
    }
  } catch (error) {
    if (error instanceof StudentJoinRequestError) throw error;
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new StudentJoinRequestError("This join code is invalid.");
    }
    throw error;
  }

  const response = await makePostRequest(
    `courses/join/${joinCode}/request`,
    {},
  );
  const message = response.data?.message as string | undefined;

  if (message === "already_enrolled") {
    return { kind: "already_enrolled", courseTitle };
  }
  if (response.status === 201) {
    return { kind: "request_sent", courseTitle };
  }
  if (previousStatus === courseJoinRequestStatus.rejected) {
    return { kind: "request_sent", courseTitle };
  }
  if (previousStatus === courseJoinRequestStatus.pending) {
    return { kind: "already_pending", courseTitle };
  }
  return { kind: "request_sent", courseTitle };
}
