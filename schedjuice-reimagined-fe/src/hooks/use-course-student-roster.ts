"use client";
import { useToast } from "@/components/primitives";

import { useMutation } from "@tanstack/react-query";

import { makePostRequest } from "@/app/client-api/utils";
import { courseStudentActionErrorMessage } from "@/helpers/course-student-roster-errors";
import { axiosClient } from "@/lib/api";
import { invalidateCourseSummaryCaches } from "@/lib/course-cache";
import { queryClient } from "@/lib/query";
import { userCoursesKeys } from "@/sdk/keys/user-courses";

export function invalidateCourseStudentRosterQueries(courseId: number) {
  void queryClient.invalidateQueries({
    queryKey: userCoursesKeys.all,
  });
  void queryClient.invalidateQueries({
    queryKey: ["courseMembershipHistory", String(courseId)],
  });
  void queryClient.invalidateQueries({
    queryKey: ["fetchStudents", courseId],
  });
  void invalidateCourseSummaryCaches(queryClient, courseId);
}

export function useCourseStudentRoster(courseId: number | undefined) {
  const toast = useToast();

  const addStudent = useMutation({
    mutationKey: ["addCourseStudent", courseId],
    mutationFn: async (userId: number) => {
      if (courseId == null) {
        throw new Error("Missing class.");
      }
      await makePostRequest(`courses/${courseId}/students`, {
        user_id: userId,
      });
    },
    onSuccess: () => {
      if (courseId != null) {
        invalidateCourseStudentRosterQueries(courseId);
      }
    },
    onError: (err: unknown) => {
      toast.add({
        type: "error",
        description: courseStudentActionErrorMessage(
          err,
          "Could not add student to this class.",
        ),
      });
    },
  });

  const removeStudent = useMutation({
    mutationKey: ["removeCourseStudent", courseId],
    mutationFn: async (userId: number) => {
      if (courseId == null) {
        throw new Error("Missing class.");
      }
      await axiosClient.delete(`courses/${courseId}/students/${userId}`);
    },
    onSuccess: () => {
      if (courseId != null) {
        invalidateCourseStudentRosterQueries(courseId);
      }
    },
    onError: (err: unknown) => {
      toast.add({
        type: "error",
        description: courseStudentActionErrorMessage(
          err,
          "Could not remove student from class.",
        ),
      });
    },
  });

  const bulkAddStudents = useMutation({
    mutationKey: ["bulkAddCourseStudents", courseId],
    mutationFn: async (userIds: number[]) => {
      if (courseId == null) {
        throw new Error("Missing class.");
      }
      if (userIds.length === 0) {
        return;
      }
      const payload = userIds.map((userId) => ({
        user: userId,
        course: courseId,
        assigned_as: "student",
      }));
      await makePostRequest("user-courses/management", payload);
    },
    onSuccess: () => {
      if (courseId != null) {
        invalidateCourseStudentRosterQueries(courseId);
      }
    },
    onError: (err: unknown) => {
      toast.add({
        type: "error",
        description: courseStudentActionErrorMessage(
          err,
          "Could not add students to this class.",
        ),
      });
    },
  });

  const bulkRemoveStudents = useMutation({
    mutationKey: ["bulkRemoveCourseStudents", courseId],
    mutationFn: async (userIds: number[]) => {
      if (courseId == null) {
        throw new Error("Missing class.");
      }
      if (userIds.length === 0) {
        return;
      }
      const payload = userIds.map((userId) => ({
        user: userId,
        course: courseId,
        isRemoved: true,
      }));
      await makePostRequest("user-courses/management", payload);
    },
    onSuccess: () => {
      if (courseId != null) {
        invalidateCourseStudentRosterQueries(courseId);
      }
    },
    onError: (err: unknown) => {
      toast.add({
        type: "error",
        description: courseStudentActionErrorMessage(
          err,
          "Could not remove students from this class.",
        ),
      });
    },
  });

  const isPending =
    addStudent.isPending ||
    removeStudent.isPending ||
    bulkAddStudents.isPending ||
    bulkRemoveStudents.isPending;

  return {
    addStudent,
    removeStudent,
    reEnrollStudent: addStudent,
    bulkAddStudents,
    bulkRemoveStudents,
    isPending,
  };
}
