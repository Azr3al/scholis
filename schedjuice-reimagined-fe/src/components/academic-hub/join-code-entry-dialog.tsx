"use client";

import { Button, Dialog, Field, Input } from "@/components/primitives";
import { parseJoinCodeFromUserInput } from "@/helpers/parse-join-code-input";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import {
  type StudentJoinRequestOutcome,
  StudentJoinRequestError,
  studentJoinConfirmationCopy,
  submitStudentJoinCourseRequest,
} from "@/helpers/student-join-course-request";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type DialogPhase = "entry" | "confirm";

export function JoinCodeEntryDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [phase, setPhase] = useState<DialogPhase>("entry");
  const [outcome, setOutcome] = useState<StudentJoinRequestOutcome | null>(null);

  const resetState = useCallback(() => {
    setValue("");
    setFieldError(null);
    setPhase("entry");
    setOutcome(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const submitMutation = useMutation({
    mutationFn: (joinCode: string) => submitStudentJoinCourseRequest(joinCode),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["academic-hub-list"] });
      setOutcome(result);
      setPhase("confirm");
    },
    onError: (error) => {
      if (error instanceof StudentJoinRequestError) {
        setFieldError(error.message);
        return;
      }
      setFieldError(
        parseSchedjuiceApiError(error, "Failed to submit join request."),
      );
    },
  });

  const submit = useCallback(() => {
    const code = parseJoinCodeFromUserInput(value);
    if (code === null) {
      setFieldError(
        "Enter a join code or paste the invite link from your teacher.",
      );
      return;
    }
    setFieldError(null);
    submitMutation.mutate(code);
  }, [value, submitMutation]);

  const confirmation = outcome ? studentJoinConfirmationCopy(outcome) : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && submitMutation.isPending) return;
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-md">
          {phase === "entry" ? (
            <>
              <div>
                <Dialog.Title>Join a class</Dialog.Title>
                <Dialog.Description>
                  Paste the join code or invite link your teacher shared.
                </Dialog.Description>
              </div>
              <Field.Root invalid={Boolean(fieldError)}>
                <Field.Label htmlFor="join-code-input">Join code</Field.Label>
                <Input
                  id="join-code-input"
                  autoFocus
                  value={value}
                  disabled={submitMutation.isPending}
                  onChange={(event) => {
                    setValue(event.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="ABC123 or invite link"
                  aria-invalid={Boolean(fieldError)}
                />
                {fieldError ? (
                  <Field.Error match>{fieldError}</Field.Error>
                ) : null}
              </Field.Root>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitMutation.isPending}
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  isLoading={submitMutation.isPending}
                  onClick={submit}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <Dialog.Title>{confirmation?.title}</Dialog.Title>
                <Dialog.Description>{confirmation?.description}</Dialog.Description>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => onOpenChange(false)}>
                  OK
                </Button>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
