"use client";

import { PageContainer } from "@/components/layout/page-container";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import TextEditor from "@/components/editor/editor";
import { useEditor } from "@tiptap/react";
import { Button, Input } from "@/components/primitives";
import { useState } from "react";
import { getDefaultEditorOptions } from "@/components/editor/config";
import { attachmentType } from "@/types/attachment";
import AttachmentUploader from "@/components/attachment-uploader/attachment-uploader";
import { useMutation } from "@tanstack/react-query";
import { makePostRequest } from "@/app/client-api/utils";
import { uploadAttachments } from "@/helpers/file";
import { useToast } from "@/components/primitives";
import { useRouter } from "next/navigation";

export default function CreateBlogPage() {
  const editor = useEditor(getDefaultEditorOptions());
  const [title, setTitle] = useState("");
  const [attachments, setAttachments] = useState<(attachmentType | File)[]>([]);

  const toast = useToast();
  const router = useRouter();
  const blogCreateMutation = useMutation({
    mutationKey: ["createNews"],
    mutationFn: (data: any) => makePostRequest("news", data),
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
          description: "Blog created successfully",
        });
        router.push("/news");
      } else {
        toast.add({
          description: "Blog created successfully",
        });
        router.push("/news");
      }
    },
  });
  const onSubmit = () => {
    if (!editor) return;
    const data = editor.getJSON();

    blogCreateMutation.mutate({
      title,
      data,
    });
  };

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/news"></BackButton>
      <TypographyH1>Create Blog</TypographyH1>
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
      <Button isLoading={blogCreateMutation.isLoading} onClick={onSubmit}>
        Submit
      </Button>
    </PageContainer>
  );
}
