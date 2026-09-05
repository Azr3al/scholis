import { Button, Input, Skeleton, buttonVariants, inputClassName, useToast } from "@/components/primitives";
import {
  announcementCreateSchema,
  announcementType,
  announcementUpdateSchema,
} from "@/types/announcement";
import { getDefaultValues } from "@/components/auto-form";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  deleteEntity,
  makePostRequest,
  updateEntity,
} from "@/app/client-api/utils";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import { useEditor } from "@tiptap/react";
import { getAnnouncementEditorOptions } from "../editor/config";
import { useCallback, useEffect, useState } from "react";
import { queryClient } from "@/lib/query";
import { useUser } from "@/hooks/useUser";
import { attachmentType } from "@/types/attachment";
import { uploadToJuiceBox } from "@/helpers/file";
import { useJuiceBoxAttachments } from "@/lib/juicebox/use-juicebox-attachments";
import TextEditor from "../editor/editor";
import AttachmentUploader from "../attachment-uploader/attachment-uploader";
import {
  createTipTapImagePasteHandler,
  useAttachmentDropzone,
} from "../attachment-uploader/use-attachment-dropzone";
import { ALLOWED_ACCEPT_INPUT } from "@/helpers/file";
import Link from "next/link";
import { cn } from "@/lib/utils";

export enum FormMode {
  CREATE = "create",
  EDIT = "edit",
}

type BaseAnnouncementFormProps = {
  courseId?: number;
  refetch?: () => void;
  onCancel: () => void;
  cancelHref?: string;
};

export type EditAnnouncementFormProps = BaseAnnouncementFormProps & {
  announcementId?: string | number;
  announcement?: announcementType & {
    json_data: any;
  };
  formMode: FormMode.EDIT;
};

type CreateAnnouncementFormProps = BaseAnnouncementFormProps & {
  formMode: FormMode.CREATE;
};

function AnnouncementForm(
  announcementFormProps: CreateAnnouncementFormProps | EditAnnouncementFormProps
) {
  const { user } = useUser();
  const toast = useToast();
  const [attachments, setAttachments] = useState<(attachmentType | File)[]>([]);
  const [toDeletedAttachmentId, setToDeletedAttachmentId] = useState<number[]>(
    []
  );

  const deleteMutation = useMutation({
    mutationKey: ["deleteAttachment"],
    mutationFn: (data: any) => deleteEntity(`attachments`, data.id),
  });

  const onDelete = (toDeleteId: number) => {
    deleteMutation.mutate({ id: toDeleteId });
    return;
  };

  const isEdit = announcementFormProps.formMode === FormMode.EDIT;
  const activeSchema = isEdit
    ? announcementUpdateSchema
    : announcementCreateSchema;
  const editor = useEditor(getAnnouncementEditorOptions({ teamsSafe: false }));
  const form = useForm<z.infer<typeof activeSchema>>({
    resolver: zodResolver(activeSchema),
    defaultValues: getDefaultValues(activeSchema),
  });

  const dropzone = useAttachmentDropzone({
    attachments,
    setAttachments,
    maxFiles: 10,
    isImageOnly: !isEdit,
  });

  const handleEditorPaste = useCallback(
    createTipTapImagePasteHandler(dropzone.onPaste),
    [dropzone.onPaste],
  );

  useEffect(() => {
    if (!editor) return;
    const existingDomEvents = editor.options.editorProps?.handleDOMEvents ?? {};
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleDOMEvents: {
          ...existingDomEvents,
          paste: handleEditorPaste,
        },
      },
    });
  }, [editor, handleEditorPaste]);

  const { data: attachmentImages, isLoading: isAttachmentsLoading } =
    useJuiceBoxAttachments({
      resource: "announcement",
      foreignKey: isEdit ? String(announcementFormProps.announcementId ?? "") : "",
      enabled: isEdit && !!announcementFormProps.announcementId,
    });

  const announcementCreateMutation = useMutation({
    mutationKey: ["createAnnouncement"],
    mutationFn: (formData: FormData) =>
      makePostRequest("announcements", formData, {}, {}),
    onSuccess: () => {
      toast.add({ description: "Announcement created successfully" });
      if (announcementFormProps.courseId) {
        queryClient.invalidateQueries({
          queryKey: ["announcementList", announcementFormProps.courseId],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["announcementList"],
      });
      announcementFormProps.onCancel();
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({
        type: "error",
        title: "Error",
        description: "Could not create announcement.",
      });
    },
  });

  const announcementId = isEdit
    ? announcementFormProps.announcementId
    : undefined;

  const announcementUpdateMutation = useMutation({
    mutationKey: ["updateAnnouncement"],
    mutationFn: async (data: any) => {
      if (!announcementId) {
        throw new Error("Attempted to update an announcement without an id");
      }
      return updateEntity("announcements", String(announcementId), data);
    },
    onSuccess: async (data) => {
      const announcementForeignKey = String(
        isEdit ? announcementId : data.data.data.id
      );
      const newFiles = attachments.filter((f): f is File => f instanceof File);

      try {
        if (newFiles.length > 0) {
          await uploadToJuiceBox({
            files: newFiles,
            tableName: "announcement",
            foreignKey: announcementForeignKey,
            purge: false,
          });
        }

        toast.add({ description: "Announcement updated successfully" });
        if (announcementFormProps.courseId) {
          queryClient.invalidateQueries({
            queryKey: ["announcementList", announcementFormProps.courseId],
          });
        }
        queryClient.invalidateQueries({
          queryKey: ["announcementList"],
        });
        queryClient.invalidateQueries({
          queryKey: [
            "juicebox-attachments",
            "announcement",
            announcementForeignKey,
          ],
        });
        announcementFormProps.onCancel();
      } catch (e) {
        console.error(e);
        toast.add({
          type: "error",
          description: "Announcement updated but file upload failed",
        });
      }
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({
        type: "error",
        title: "Error",
        description: "Could not update announcement.",
      });
    },
  });

  const onSubmitHandler = (data: any) => {
    if (!isEdit) {
      const formData = new FormData();
      formData.append("title", data.title);
      const htmlContent = editor?.getHTML();
      if (htmlContent) formData.append("data", htmlContent);
      if (announcementFormProps.courseId) {
        formData.append("course", String(announcementFormProps.courseId));
      }
      if (user?.id) formData.append("created_by", String(user.id));
      const filesToUpload = attachments.filter((a): a is File => a instanceof File);
      filesToUpload.forEach((f) => formData.append("files", f));
      announcementCreateMutation.mutate(formData);
    } else {
      const updateData = {
        ...data,
        data: editor?.getHTML(),
      };
      if (announcementFormProps.courseId) {
        updateData.course = announcementFormProps.courseId;
      }
      toDeletedAttachmentId.forEach((id) => onDelete(id));
      announcementUpdateMutation.mutate(updateData);
    }
  };

  useEffect(() => {
    if (isEdit && attachmentImages?.length) {
      setAttachments(attachmentImages);
    }
  }, [attachmentImages, isEdit]);

  useEffect(() => {
    if (!isEdit) return;

    form.reset({
      title: announcementFormProps.announcement?.title,
    });

    if (editor && announcementFormProps.announcement) {
      const content =
        announcementFormProps.announcement.data ??
        announcementFormProps.announcement.json_data;
      if (content) editor.commands.setContent(content);
    }
    //@ts-ignore
  }, [announcementFormProps.announcement, editor, form]);

  const isSaving =
    announcementCreateMutation.isPending ||
    announcementUpdateMutation.isPending;

  return (
    <div className="p-6">
      <div {...form}>
        <form
          {...dropzone.getRootProps({
            className: cn(
              dropzone.isDragActive && "rounded-lg ring-2 ring-primary/30 bg-muted/20",
            ),
            onSubmit: form.handleSubmit(onSubmitHandler, () =>
              scheduleScrollToFirstFormError(form),
            ),
            onPaste: (e) => dropzone.onPaste(e.nativeEvent),
          })}
        >
          <input
            {...dropzone.getInputProps()}
            accept={!isEdit ? "image/*" : ALLOWED_ACCEPT_INPUT}
            className="sr-only"
          />
          <h2>{isEdit ? "Edit an announcement" : "Create an announcement"}</h2>
          <fieldset
            disabled={isSaving}
            className="min-w-0 border-0 p-0 m-0"
          >
          <Controller
            control={form.control}
            name="title"
            render={({ field }) => (
              <div className="mt-4">
                <div>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    required
                    placeholder="Announcement Title"
                    className="border-none bg-transparent shadow-none focus:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none text-xl"
                  />
                </div>
                <p />
                <p />
              </div>
            )}
          />
          {editor && (
            <div>
              <TextEditor
                editor={editor}
                isViewOnly={false}
                menuProps={{ teamsSafe: false, variant: "full" }}
              />
            </div>
          )}
          {announcementFormProps.formMode === FormMode.EDIT &&
            announcementFormProps.announcementId &&
            isAttachmentsLoading && (
              <div className="flex gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-30 flex-1 rounded-md" />
                ))}
              </div>
            )}
          <div className="relative mt-4">
            <AttachmentUploader
              isAnnouncement
              entityName="announcement"
              attachments={attachments}
              setAttachments={setAttachments}
              maxFiles={10}
              isImageOnly={!isEdit}
              setToDeletedAttachmentId={setToDeletedAttachmentId}
              dropzone={dropzone}
            ></AttachmentUploader>
          </div>
          </fieldset>
          <div className="mt-4 flex justify-end items-center gap-4">
              {announcementFormProps.cancelHref ? (
                <Link
                  href={announcementFormProps.cancelHref}
                  aria-disabled={isSaving}
                  className={cn(
                    buttonVariants({ variant: "secondary" }),
                    isSaving && "pointer-events-none opacity-50",
                  )}
                >
                  Cancel
                </Link>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={announcementFormProps.onCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                isLoading={isSaving}
              >
                {isEdit ? "Update Announcement" : "Create Announcement"}
              </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AnnouncementForm;
