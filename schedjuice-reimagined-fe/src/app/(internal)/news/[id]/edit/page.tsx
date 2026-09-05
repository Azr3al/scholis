"use client";

import { PageContainer } from "@/components/layout/page-container";
import {
  deleteEntity,
  makeGetRequest,
  updateEntity,
} from "@/app/client-api/utils";
import AttachmentUploader from "@/components/attachment-uploader/attachment-uploader";
import { getDefaultEditorOptions } from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import { Button, Input, Skeleton } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { uploadAttachments } from "@/helpers/file";
import { queryClient } from "@/lib/query";
import { attachmentType } from "@/types/attachment";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NewsUpdatePage = () => {
  const [title, setTitle] = useState("");
  const [attachments, setAttachments] = useState<(attachmentType | File)[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const { id } = useParams<{ id: string }>();
  const editor = useEditor(getDefaultEditorOptions());
  const toast = useToast();
  const router = useRouter();
  const { data, isLoading, isSuccess } = useQuery({
    queryKey: ["getNews", id],
    queryFn: async () => {
      const res = await makeGetRequest(`news/${id}`, {
        expand: ["attachments"],
      });
      return res.data;
    },
  });
  const blogEditMutation = useMutation({
    mutationKey: ["editNews"],
    mutationFn: (data: any) => updateEntity("news", id, data),
    onSuccess: async (data) => {
      if (attachments.length > 0) {
        await uploadAttachments(
          attachments,
          "news",
          data.data.data.id,
          false,
          true,
        );
        toast.add({
          description: "Blog updated successfully",
        });
        router.push(`/news/${id}`);
        queryClient.refetchQueries({ queryKey: ["getNews", id] });
      } else {
        toast.add({
          description: "Blog updated successfully",
        });
        router.push(`/news/${id}`);
        queryClient.refetchQueries({ queryKey: ["getNews", id] });
      }
    },
  });
  const blogDeleteMutation = useMutation({
    mutationKey: ["deleteNews"],
    mutationFn: () => deleteEntity("news", id),
    onSuccess: () => {
      toast.add({
        description: "Blog deleted successfully",
      });
      router.push("/news");
    },
  });
  const onSubmit = () => {
    if (!editor) return;
    const data = editor.getJSON();

    blogEditMutation.mutate({
      title,
      data,
    });
  };

  useEffect(() => {
    setAttachmentUrls(
      attachments.map((a) =>
        a instanceof File ? URL.createObjectURL(a) : a.data,
      ),
    );
  }, [attachments]);

  useEffect(() => {
    if (isSuccess && data.data.attachments) {
      editor?.commands.setContent(data.data.data);
      setTitle(data.data.title);
      setAttachments(data.data.attachments);
      setAttachmentUrls(
        data.data.attachments.map((a: attachmentType) => a.data),
      );
    }
  }, [data?.data, isSuccess]);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/news"></BackButton>
      <TypographyH1>Edit Blog</TypographyH1>
      {isLoading ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Loading news editor"
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      ) : (
        <>
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {editor && <TextEditor editor={editor}></TextEditor>}
          <AttachmentUploader
            entityName="news"
            attachments={attachments}
            setAttachments={setAttachments}
            maxFiles={10}
            isImageOnly={true}
          ></AttachmentUploader>
          <div className="flex gap-3">
            <Button
              isLoading={
                blogEditMutation.isLoading || blogDeleteMutation.isLoading
              }
              onClick={onSubmit}
            >
              Submit
            </Button>
            <Button
              isLoading={
                blogDeleteMutation.isLoading || blogEditMutation.isLoading
              }
              variant="danger"
              onClick={() => blogDeleteMutation.mutate()}
            >
              Delete
            </Button>
          </div>
        </>
      )}
    </PageContainer>
  );
};

export default NewsUpdatePage;
