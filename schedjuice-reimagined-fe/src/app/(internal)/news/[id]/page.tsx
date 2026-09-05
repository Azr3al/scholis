"use client";
import { buttonVariants, Skeleton } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { makeGetRequest } from "@/app/client-api/utils";
import UploadPreview from "@/components/attachment-uploader/upload-preview";
import { getDefaultEditorOptions } from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import AuditDisplay from "@/components/misc/audit-display";
import { usePageHeader } from "@/components/shell/use-page-header";
import { attachmentType } from "@/types/attachment";
import { useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const NewsDetailsPage = () => {
  const [attachments, setAttachments] = useState<(File | attachmentType)[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const { id } = useParams();
  const editor = useEditor(getDefaultEditorOptions());

  const { data, isLoading, isSuccess } = useQuery({
    queryKey: ["getNews", id],
    queryFn: async () => {
      const res = await makeGetRequest(`news/${id}`, {
        expand: ["attachments", "created_by"],
      });
      return res.data;
    },
  });

  useEffect(() => {
    if (isSuccess && data.data.attachments) {
      editor?.commands.setContent(data.data.data);
      setAttachments(data.data.attachments);
      setUrls(
        data.data.attachments.map(
          (attachment: attachmentType) => attachment.data,
        ),
      );
    }
  }, [data?.data, isSuccess, editor]);

  const title = data?.data?.title;

  const pageHeaderConfig = useMemo(
    () => ({
      breadcrumb: (
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm"
        >
          <Link
            href="/news"
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          >
            Blogs
          </Link>
          {title ? (
            <>
              <span className="shrink-0 text-text-muted" aria-hidden>
                /
              </span>
              <span className="truncate font-serif text-lg text-text-primary">
                {title}
              </span>
            </>
          ) : null}
        </nav>
      ),
      actions: (
        <Link
          href={`/news/${id}/edit`}
          className={buttonVariants({ variant: "primary" })}
        >
          Edit
        </Link>
      ),
    }),
    [id, title],
  );
  usePageHeader(pageHeaderConfig);

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface py-6 text-text-primary shadow-sm">
        <div className="px-6">
          <h2 className="font-semibold leading-none">
            {isLoading ? (
              <Skeleton className="h-8 w-64" aria-busy="true" />
            ) : (
              (title ?? "News")
            )}
          </h2>
        </div>
        <div className="px-6">
          <AuditDisplay
            isLoading={isLoading}
            created_at={data?.data?.created_at}
            updated_at={data?.data?.updated_at}
            created_by={data?.data?.created_by}
          />
        </div>
      </div>
      {editor && (
        <TextEditor
          editor={editor}
          editable={false}
          hideMenu={true}
        ></TextEditor>
      )}
      <UploadPreview
        canDelete={false}
        files={attachments}
        setFiles={setAttachments}
        isPublicData={true}
      ></UploadPreview>
    </PageContainer>
  );
};

export default NewsDetailsPage;
