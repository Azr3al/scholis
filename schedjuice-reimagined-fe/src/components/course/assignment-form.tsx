import {
  assignmentCreateSchema,
  assignmentCreateType,
  assignmentUpdateType,
} from "@/types/assignment";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";

import { useForm } from "react-hook-form";

import { z } from "zod";
import AutoForm, {
  getObjectFormSchema,
  getDefaultValues,
  type AutoFormGroup,
  type AutoFormInputComponentProps,
} from "@/components/auto-form";
import { Button, buttonVariants } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { useMutation } from "@tanstack/react-query";
import { makePostRequest, updateEntity } from "@/app/client-api/utils";
import { useToast } from "@/components/primitives";
import { uploadToJuiceBox } from "@/helpers/file";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useEditor } from "@tiptap/react";
import { getDefaultEditorOptions } from "../editor/config";
import TextEditor from "../editor/editor";
import AttachmentUploader from "../attachment-uploader/attachment-uploader";
import { attachmentType } from "@/types/attachment";
import { queryClient } from "@/lib/query";

function EmptyInstructionsField(_props: AutoFormInputComponentProps) {
  return null;
}

const ASSIGNMENT_FORM_GROUPS: AutoFormGroup[] = [
  {
    id: "details",
    title: "Assignment details",
    description: "Title, schedule, and scoring for this assignment.",
    fields: [
      "title",
      "available_datetime",
      "due_datetime",
      "available_score",
      "max_attempts",
      "results_release_date",
    ],
  },
];

type editFormType = {
  isEdit: true;
  onCancel: () => void;
  cancelHref?: string;
  courseId: number;
  assignment: assignmentUpdateType & { id: number };
  files: attachmentType[];
  refetch: () => void;
};

type createFormType = {
  isEdit: false;
  onCancel: () => void;
  cancelHref?: string;
  courseId: number;
  refetch: () => void;
};

type AssignmentFormProps = editFormType | createFormType;

const AssignmentForm: React.FC<AssignmentFormProps> = ({
  onCancel,
  cancelHref,
  courseId,
  ...props
}) => {
  const toast = useToast();
  const [attachments, setAttachments] = useState<(attachmentType | File)[]>([]);
  // const { items } = useUploadQueueStore();

  const editor = useEditor(getDefaultEditorOptions());
  const objectFormSchema = getObjectFormSchema(assignmentCreateSchema);

  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(assignmentCreateSchema),
    defaultValues: getDefaultValues(assignmentCreateSchema),
  });

  form.watch(["due_datetime", "available_datetime"]);

  const assignmentCreateUpdateMutation = useMutation({
    mutationKey: ["assignmentCreateUpdate"],
    mutationFn: (data: any) =>
      props.isEdit
        ? updateEntity("assignments", props.assignment.id, {
            ...props.assignment,
            ...data,
          })
        : makePostRequest("assignments", data),
    onSuccess: async (data) => {
      const assignmentId = props.isEdit
        ? String(props.assignment.id)
        : String(data.data.data.id);
      const newFiles = attachments.filter((f): f is File => f instanceof File);

      try {
        if (newFiles.length > 0) {
          await uploadToJuiceBox({
            files: newFiles,
            tableName: "assignment",
            foreignKey: assignmentId,
            purge: false,
          });
        }

        queryClient.invalidateQueries({
          queryKey: ["courseAssessments", Number(courseId)],
        });
        if (props.isEdit) {
          queryClient.invalidateQueries({ queryKey: ["assignment", assignmentId] });
          queryClient.invalidateQueries({
            queryKey: ["juicebox-attachments", "assignment", assignmentId],
          });
        }

        toast.add({
          description: props.isEdit
            ? "Assignment updated successfully"
            : "Assignment created successfully",
        });
        onCancel();
      } catch (e) {
        console.error(e);
        toast.add({
          description: "Assignment saved but file upload failed",
        });
      }
    },
    onError: (e) => {
      console.log(e);
      toast.add({
        title: "Error",
        description: "Failed to save assignment. Please try again.",
      });
    },
  });

  const onSumitHandler = (data: assignmentCreateType | Record<string, unknown>) => {
    const payload = data as assignmentCreateType;
    if (payload.due_datetime.getTime() < payload.available_datetime.getTime()) {
      form.setError("due_datetime", {
        message: "Due date cannot be less than or equal to available date",
      });
      return;
    }

    form.clearErrors();

    payload.available_datetime = new Date(
      payload.available_datetime.getFullYear(),
      payload.available_datetime.getMonth(),
      payload.available_datetime.getDate(),
      payload.available_datetime.getHours(),
      payload.available_datetime.getMinutes(),
      payload.available_datetime.getSeconds()
    );
    payload.due_datetime = new Date(
      payload.due_datetime.getFullYear(),
      payload.due_datetime.getMonth(),
      payload.due_datetime.getDate(),
      payload.due_datetime.getHours(),
      payload.due_datetime.getMinutes(),
      payload.due_datetime.getSeconds()
    );
    // @ts-ignore
    payload.instructions = editor?.getJSON();

    assignmentCreateUpdateMutation.mutate({ ...payload, course: courseId });
  };

  useEffect(() => {
    if (props.isEdit) {
      Object.keys(props.assignment).map((k: any) => {
        // @ts-ignore
        form.setValue(k, props.assignment[k]);
        if (k === "due_datetime" || k === "available_datetime") {
          // @ts-ignore
          form.setValue(k, new Date(props.assignment[k]));
        }
      });
      if (editor && props.assignment.instructions) {
        editor.commands.setContent(props.assignment.instructions);
      }
      if (props.files?.length) {
        setAttachments(props.files);
      }
    }
  }, [props.isEdit, editor, props.isEdit ? (props as editFormType).assignment : null, props.isEdit ? (props as editFormType).files : null]);

  return (
    <div className="space-y-3">
      <AutoForm
        onSubmit={onSumitHandler}
        schema={assignmentCreateSchema}
        saveMode="create"
        groups={ASSIGNMENT_FORM_GROUPS}
        form={form}
        stickyFooter={false}
        isSubmitting={assignmentCreateUpdateMutation.isLoading}
        fieldConfig={{
          instructions: {
            fieldType: EmptyInstructionsField,
          },
        }}
      >
        <div className="space-y-3 mt-3">
          {editor && (
            <Field.Root>
              <Field.Label>
                Instructions <span className="text-destructive">*</span>
              </Field.Label>
              <TextEditor editor={editor}></TextEditor>
            </Field.Root>
          )}
          <AttachmentUploader
            entityName="assignment"
            attachments={attachments}
            setAttachments={setAttachments}
            maxFiles={10}
          ></AttachmentUploader>

          <div className="space-x-3">
            <Button
              type="submit"
              isLoading={assignmentCreateUpdateMutation.isLoading}
            >
              Submit
            </Button>
            {cancelHref ? (
              <Link
                href={cancelHref}
                aria-disabled={assignmentCreateUpdateMutation.isLoading}
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  assignmentCreateUpdateMutation.isLoading &&
                    "pointer-events-none opacity-50",
                )}
              >
                Cancel
              </Link>
            ) : (
              <Button
                isLoading={assignmentCreateUpdateMutation.isLoading}
                type="button"
                variant={"secondary"}
                onClick={() => onCancel()}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </AutoForm>
    </div>
  );
};

export default AssignmentForm;
