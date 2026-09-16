"use client";

import { makePostRequest } from "@/app/client-api/utils";
import CopyInput from "../misc/copy-input";
import { Button } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import {
  Dialog,
} from "@/components/primitives";
import { useMutation } from "@tanstack/react-query";
import { courseType } from "@/types/course";
import { UserPlus } from "iconoir-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  course: courseType;
  onChanged?: () => void;
};

function isJoinCodeActive(course: courseType): boolean {
  if (!course.join_code) return false;
  if (!course.join_code_expiry_date) return true;
  return new Date() < new Date(course.join_code_expiry_date);
}

const CourseJoinCode: React.FC<Props> = ({ course, onChanged }) => {
  const toast = useToast();
  const [displayJoinCode, setDisplayJoinCode] = useState(course.join_code ?? "");
  const [displayExpiryDate, setDisplayExpiryDate] = useState(
    course.join_code_expiry_date ?? null
  );

  useEffect(() => {
    setDisplayJoinCode(course.join_code ?? "");
    setDisplayExpiryDate(course.join_code_expiry_date ?? null);
  }, [course.join_code, course.join_code_expiry_date]);

  const activeCourse = useMemo(
    () => ({
      ...course,
      join_code: displayJoinCode,
      join_code_expiry_date: displayExpiryDate,
    }),
    [course, displayJoinCode, displayExpiryDate]
  );

  const mutation = useMutation({
    mutationKey: ["generateJoinCode", `${course.id}`],
    mutationFn: () =>
      makePostRequest(`courses/${course.id}/generate-join-code`, {}),
    onSuccess: (data) => {
      const newCode = data?.data?.data?.join_code as string | undefined;
      if (newCode) {
        setDisplayJoinCode(newCode);
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);
        setDisplayExpiryDate(expiry.toISOString());
      }
      onChanged?.();
      toast.add({
        description: "Join code generated successfully",
      });
    },
    onError: (error) => {
      toast.add({
        description: parseSchedjuiceApiError(
          error,
          "Failed to generate join code."
        ),
      });
    },
  });

  const inviteLink =
    displayJoinCode && typeof window !== "undefined"
      ? `${window.location.origin}/join-course/${displayJoinCode}`
      : "";

  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button variant="secondary" />}>
          <UserPlus></UserPlus>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Invite students</Dialog.Title>
        <div className="space-y-5">
          {!course.is_join_code_enabled ? (
            <p>Join codes are disabled for this course.</p>
          ) : isJoinCodeActive(activeCourse) ? (
            <div className="space-y-2">
              <CopyInput
                isLoading={mutation.isPending}
                className="w-32"
                text={displayJoinCode}
                label="Join code"
              />
              <div>
                <CopyInput
                  isLoading={mutation.isPending}
                  text={inviteLink}
                  label="Invite link"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  {displayExpiryDate
                    ? "The join code and link will be valid for 7 days."
                    : "Share this join code or link with students."}
                </p>
              </div>
            </div>
          ) : (
            <p>
              The previous join code has expired. Please regenerate a new one.
            </p>
          )}
          <Button
            isLoading={mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
          >
            Regenerate
          </Button>
        </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
export default CourseJoinCode;
