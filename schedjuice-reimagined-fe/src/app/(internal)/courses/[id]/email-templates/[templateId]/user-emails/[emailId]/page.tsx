"use client";
import { Button, Dialog, Input, Separator, Skeleton, buttonVariants } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import {
  fetchEntity,
  makeGetRequest,
  makePostRequest,
  searchEntities,
  updateEntity,
} from "@/app/client-api/utils";
import {
  defaultEditorOptions,
  getDefaultEditorOptions,
  getEmailEditorOptions,
} from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import FileDragAndDrop, {
  extendedFileType,
} from "@/components/form/file-drag-and-drop";
import BackButton from "@/components/misc/back-button";
import { Badge } from "@/components/courses/ui/badge";
import { Label } from "@/components/courses/ui/label";
import { useToast } from "@/components/primitives";
import { getHTMLContent } from "@/helpers/email-template";
import {
  prepareFiles,
  requestDataToExtendedFileTypeArray,
} from "@/helpers/file";
import { cn } from "@/lib/utils";
import { operatorEnum } from "@/types/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import { NavArrowLeft, NavArrowRight, SendDiagonal } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

const UserEmailDetailPage = () => {
  const [subject, setSubject] = useState("");
  const [files, setFiles] = useState<extendedFileType[]>([]);
  const [isEdit, setIsEdit] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [emailIndex, setEmailIndex] = useQueryState(
    "emailIndex",
    parseAsInteger.withDefault(0)
  );
  const toast = useToast();

  const { templateId, id, emailId } = useParams<{id: string, emailId: string, templateId: string}>();

  const editor = useEditor(getEmailEditorOptions());

  const getUserEmailList = useQuery({
    enabled: false,
    queryKey: ["getUserEmailPreview", templateId],
    queryFn: () => {
      return searchEntities(
        "user-emails",
        {
          size: -1,
          fields: ["id", "user.id", "user.name"],
          sorts: ["-created_at"],
          expand: ["user"],
        },
        {
          filter_params: [
            {
              field_name: "email_template",
              value: templateId,
              operator: operatorEnum.exact,
            },
          ],
        }
      );
    },
  });
  const getUserEmail = useQuery({
    enabled: false,
    queryKey: ["getUserEmail", emailId],
    queryFn: () => {
      return makeGetRequest(`user-emails/${emailId}`, {
        expand: ["created_by", "user"],
        fields: [
          "id",
          "subject",
          "json_body",
          "created_by.name",
          "created_by.email",
          "user.email",
          "user.name",
          "user.id",
          "is_sent",
        ],
      });
    },
  });

  const getEmailAttachments = useQuery({
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: false,
    queryKey: ["getEmailAttachments", templateId, emailIndex],
    queryFn: () => {
      return fetchEntity("attachments/email", getUserEmail.data?.data.data.id);
    },
  });

  const sendEmailMutation = useMutation({
    mutationKey: ["sendEmail", emailId],
    mutationFn: () => {
      return makeGetRequest(`user-emails/${emailId}/send`);
    },
    onSuccess: () => {
      toast.add({ description: "Email sent successfully" });
      getUserEmail.refetch();
      setIsOpen(false);
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to send email.",
      });
    },
  });

  const emailUpdateMutation = useMutation({
    mutationKey: ["emailUpdate"],
    mutationFn: (data: any) => {
      return updateEntity("user-emails", getUserEmail.data?.data.data.id, data);
    },
    onSuccess: () => {
      toast.add({ description: "Email updated successfully" });

      if (files.length > 0) {
        const preparedFiles = prepareFiles(files);
        preparedFiles.created.map((f) => {
          attachmentCreateUpdateMutation.mutate({
            emailId: getUserEmail.data?.data.data.id,
            file: f,
          });
        });
        preparedFiles.deleted.map((f) => {
          attachmentCreateUpdateMutation.mutate({
            emailId: getUserEmail.data?.data.data.id,
            file: { ...f, isDelete: true },
          });
        });
      } else {
        getUserEmail.refetch();
      }
    },
  });

  const attachmentCreateUpdateMutation = useMutation({
    mutationKey: ["attachmentCreateUpdate"],
    mutationFn: (data: any) =>
      makePostRequest(
        `attachments/email/${data.emailId}`,
        data.file,
        {},
        { "content-type": "multipart/form-data" }
      ),
    onSuccess: () => {
      toast.add({ description: "Email updated successfully" });
    },
  });

  useEffect(() => {
    if (getUserEmailList.isSuccess && getUserEmailList.data) {
      getUserEmail.refetch();
    }
  }, [getUserEmailList.data]);

  useEffect(() => {
    if (getUserEmail.isSuccess && getUserEmail.data) {
      editor?.commands.setContent(getUserEmail.data?.data.data.json_body);
      setSubject(getUserEmail.data?.data.data.subject);
      getEmailAttachments.refetch();
    }
  }, [getUserEmail.isSuccess, getUserEmail.data]);

  useEffect(() => {
    if (getEmailAttachments.data && getEmailAttachments.isSuccess) {
      setFiles(requestDataToExtendedFileTypeArray(getEmailAttachments.data));
    }
  }, [getEmailAttachments.data, getEmailAttachments.isSuccess]);

  useEffect(() => {
    getUserEmailList.refetch();
  }, []);

  return  (
<PageContainer width="default" className="space-y-3">
      <BackButton
        href={`/courses/${id}/email-templates/${templateId}`}
      ></BackButton>
      {getUserEmail.isLoading ? (
        <Skeleton className="w-full h-40"></Skeleton>
      ) : (
        <>
          <div className="space-y-3">
            <Dialog.Root onOpenChange={setIsOpen} open={isOpen}>
              <Dialog.Portal>
                <Dialog.Backdrop />
                <Dialog.Popup>
                  <Dialog.Title>Confirmation</Dialog.Title>
                  <p>
                    Are you sure you want to send the email to the user{" "}
                    <strong className=" font-extrabold">again</strong>?
                  </p>
                  <div className="space-x-3">
                    <Button
                      isLoading={sendEmailMutation.isLoading}
                      onClick={() => {
                        sendEmailMutation.mutate();
                      }}
                    >
                      Confrim
                    </Button>
                    <Button
                      onClick={() => setIsOpen(false)}
                      variant={"secondary"}
                      isLoading={sendEmailMutation.isLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>

            <div className="flex justify-between items-center">
              <div>
                {emailIndex === 0 ? (
                  <Button className="space-x-2" variant={"ghost"} disabled>
                    <NavArrowLeft></NavArrowLeft>
                    <span>Previous</span>
                  </Button>
                ) : (
                  <>
                    <Link
            href={`/courses/${id}/email-templates/${templateId}/user-emails/${
                        getUserEmailList.data?.data.data[emailIndex - 1].id
                      }?emailIndex=${emailIndex - 1}`}
            className={cn(buttonVariants({ variant: "ghost", size: "md"  }))}
          >
            <NavArrowLeft></NavArrowLeft>
                        <span>Previous</span>
          </Link>
                  </>
                )}
              </div>
              <div>
                {emailIndex === getUserEmailList.data?.data.data.length - 1 ? (
                  <Button className="space-x-2" variant={"ghost"} disabled>
                    <span>Next</span>
                    <NavArrowRight></NavArrowRight>
                  </Button>
                ) : (
                  <>
                    <Link
            href={`/courses/${id}/email-templates/${templateId}/user-emails/${
                        getUserEmailList.data?.data.data[emailIndex + 1].id
                      }?emailIndex=${emailIndex + 1}`}
            className={cn(buttonVariants({ variant: "ghost", size: "md"  }))}
          >
            <span>Next</span>
                        <NavArrowRight></NavArrowRight>
          </Link>
                  </>
                )}
              </div>
            </div>
            <Separator></Separator>
            <div className="flex justify-between items-center">
              <div className="flex gap-3 items-center">
                <p>
                  <span className="font-bold">To:</span>{" "}
                  {getUserEmail.data?.data.data.user?.email}
                </p>
                <Badge
                  className={cn({
                    "border-success/30 bg-success text-success-foreground":
                      getUserEmail.data?.data.data.is_sent,
                    "bg-surface-hover text-text-secondary":
                      !getUserEmail.data?.data.data.is_sent,
                  })}
                >
                  {getUserEmail.data?.data.data.is_sent ? "Sent" : "Not Sent"}
                </Badge>
                <Button
                  isLoading={sendEmailMutation.isLoading}
                  onClick={() => {
                    if (getUserEmail.data?.data.data.is_sent) {
                      setIsOpen(true);
                    } else {
                      sendEmailMutation.mutate();
                    }
                  }}
                  variant="secondary"
                  className="space-x-2"
                >
                  <span>
                    {sendEmailMutation.isLoading ? "Sending" : "Send"}
                  </span>
                  <SendDiagonal></SendDiagonal>
                </Button>
              </div>

              <Button
                onClick={() => {
                  setIsEdit(!isEdit);
                }}
                variant={isEdit ? "secondary" : "primary"}
              >
                {isEdit ? "Cancel" : "Edit"}
              </Button>
            </div>
            <div className="max-w-sm space-y-2">
              <Label>Subject</Label>
              <Input
                disabled={!isEdit}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              ></Input>
            </div>
            {editor && (
              <TextEditor
                editable={isEdit}
                hideMenu={!isEdit}
                editor={editor}
              ></TextEditor>
            )}
            <FileDragAndDrop
              isReadOnly={!isEdit}
              files={files}
              setFiles={setFiles}
            ></FileDragAndDrop>
            {isEdit && (
              <Button
                isLoading={
                  emailUpdateMutation.isLoading ||
                  attachmentCreateUpdateMutation.isLoading
                }
                onClick={() => {
                  if (editor?.isEmpty || !subject) {
                    toast.add({
                      description: "Subject and body are required",
                    });
                    return;
                  }
                  emailUpdateMutation.mutate({
                    subject,
                    html_body: getHTMLContent(editor?.getJSON().content!),
                    json_body: editor?.getJSON(),
                  });
                }}
              >
                Submit
              </Button>
            )}
          </div>
        </>
      )}
    </PageContainer>
);
};

export default UserEmailDetailPage;
