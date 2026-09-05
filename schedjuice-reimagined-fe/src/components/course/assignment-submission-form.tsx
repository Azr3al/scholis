import {
  assignmentType,
  submissionCreateSchema,
  submissionType,
} from "@/types/assignment";
import { Textarea } from "@/components/primitives";
import FileDragAndDrop, { extendedFileType } from "../form/file-drag-and-drop";
import { useEffect, useState } from "react";
import { Field } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  fetchEntities,
  fetchEntity,
  makePostRequest,
  searchEntities,
} from "@/app/client-api/utils";
import { prepareFiles, uploadToJuiceBox } from "@/helpers/file";
import { useToast } from "@/components/primitives";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { getDefaultValues, getObjectFormSchema } from "@/components/auto-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import AttachmentUploader from "../attachment-uploader/attachment-uploader";
import { attachmentType } from "@/types/attachment";
import { queryClient } from "@/lib/query";
import { useParams } from "next/navigation";
import { formatDateTime } from "@/helpers/date";

interface IAssignmentSubmissionFormProps {
  assignment: Partial<assignmentType>;
  onCancel: () => void;
}

const AssignmentSubmissionForm: React.FC<IAssignmentSubmissionFormProps> = ({
  onCancel,
  assignment,
}) => {
  const [files, setFiles] = useState<(attachmentType | File)[]>([]);
  const { id: courseId } = useParams<{ id: string }>();
  const { user } = useUser();

  const toast = useToast();

  const objectFormSchema = getObjectFormSchema(submissionCreateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(submissionCreateSchema),
    defaultValues: getDefaultValues(submissionCreateSchema),
  });

  const getAttempts = useQuery({
    queryKey: ["submission-attempts", assignment?.id, user?.id],
    queryFn: () =>
      searchEntities(
        "submissions",
        { size: 1, sorts: ["-attempt_count"] },
        {
          filter_params: [
            {
              operator: operatorEnum.exact,
              field_name: "created_by",
              value: String(user!.id),
            },
            {
              operator: operatorEnum.exact,
              field_name: "assignment",
              value: String(assignment!.id),
            },
          ],
        }
      ),
    enabled: !!user?.id && !!assignment?.id,
  });

  const submissionCreateMutation = useMutation({
    mutationKey: ["submissionCreate"],
    mutationFn: (data: Partial<submissionType>) =>
      makePostRequest("submissions", data),
    onSuccess: async (data: any) => {
      try {
        const newFiles = files.filter((f): f is File => f instanceof File);
        if (newFiles.length > 0) {
          await uploadToJuiceBox({
            files: newFiles,
            tableName: "submission",
            foreignKey: String(data.data.data.id),
            purge: false,
          });
        }
        toast.add({ description: "Assignment submission successful" });

        queryClient.invalidateQueries({ queryKey: ["assignment", assignment?.id] });
        queryClient.invalidateQueries({
          queryKey: ["submission-attempts", assignment?.id],
        });
        queryClient.invalidateQueries({
          queryKey: [
            "juicebox-attachments",
            "submission",
            String(data.data.data.id),
          ],
        });
        if (courseId) {
          queryClient.invalidateQueries({
            queryKey: ["courseAssessments", Number(courseId)],
          });
        }
        
        onCancel();
      } catch (error) {
        console.error("Upload error:", error);
        toast.add({
          description: "Submission created but file upload failed" 
        });
      }
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.message || "Failed to submit assignment";
      toast.add({
        description: errorMessage 
      });
    },
  });

  const now = new Date();
  const availableDate = assignment?.available_datetime
    ? new Date(assignment.available_datetime)
    : null;
  const dueDate = assignment?.due_datetime
    ? new Date(assignment.due_datetime)
    : null;
  const isLocked = availableDate ? now < availableDate : false;
  const isOverdue = dueDate ? now > dueDate : false;
  const isSubmissionDisabled = isLocked || isOverdue;

  const latestAttemptCount =
    getAttempts.data?.data.data[0]?.attempt_count ?? 0;
  const nextAttemptCount = latestAttemptCount + 1;
  const maxAttempts = assignment?.max_attempts ?? 10;
  const hasAttemptsRemaining = latestAttemptCount < maxAttempts;

  const onSubmitHandler = (data: any) => {
    if (!data.description) {
      form.setError("description", { message: "This field is required." });
      scheduleScrollToFirstFormError(form);
      return;
    }
    if (files.length === 0) {
      toast.add({
        description: "Please upload one or more files.",
      });
      return;
    }
    submissionCreateMutation.mutate({
      description: data.description,
      assignment: assignment?.id,
    });
  };



  return (
    <>
      <div className="space-y-3">
        {hasAttemptsRemaining && (
          <div>
            <h4 className="text-lg">
              Attempts ({nextAttemptCount}/{maxAttempts})
            </h4>
            <p className="text-xs text-muted-foreground">
              Only your latest attempt will be accounted for.
            </p>
          </div>
        )}
        {!hasAttemptsRemaining ? (
          <>
            <p className=" text-destructive">
              Maximum attempts exceeded. You cannot create submissions anymore.
            </p>
            <Button
              type="button"
              variant={"secondary"}
              onClick={() => onCancel()}
            >
              Close
            </Button>
          </>
        ) : (
          <>
            {isSubmissionDisabled && (
              <div className="p-3 rounded-md border mb-4 text-sm">
                {isLocked && availableDate && (
                  <p className="text-amber-700 dark:text-amber-300">
                    This assignment is locked. Submissions open on{" "}
                    {formatDateTime(availableDate.toISOString())}.
                  </p>
                )}
                {isOverdue && !isLocked && dueDate && (
                  <p className="text-destructive">
                    The due date has passed ({formatDateTime(dueDate.toISOString())}).
                    Submissions are no longer accepted.
                  </p>
                )}
              </div>
            )}
            <form>
              <Field.Root
                className="space-y-2"
                data-field-name="description"
                invalid={Boolean(form.formState.errors.description)}
              >
                <Field.Label htmlFor="assignment-submission-description">
                  Write a description for your submission.{" "}
                  <span className=" text-destructive">*</span>
                </Field.Label>
                <Textarea
                  id="assignment-submission-description"
                  required
                  {...form.register("description")}
                  disabled={isSubmissionDisabled}
                ></Textarea>
                <p className=" text-destructive mt-2">
                  {/* @ts-ignore */}
                  {form.formState.errors.description?.message}
                </p>
              </Field.Root>

              <div className="my-3">
                <AttachmentUploader
                  entityName="submission"
                  maxFiles={10}
                  attachments={files}
                  setAttachments={setFiles}
                />
              </div>
              <div className="space-x-3">
                <Button
                  onClick={() => {
                    onSubmitHandler({
                      description: form.getValues("description"),
                    });
                  }}
                  type="button"
                  isLoading={submissionCreateMutation.isLoading}
                  disabled={isSubmissionDisabled}
                >
                  Submit
                </Button>
                <Button
                  isLoading={submissionCreateMutation.isLoading}
                  type="button"
                  onClick={() => onCancel()}
                  variant={"secondary"}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
};

export default AssignmentSubmissionForm;
