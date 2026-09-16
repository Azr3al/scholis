"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  PlatformDocsArticleForm,
  type PlatformDocsArticleFormHandle,
  type PlatformDocsArticleFormValues,
} from "@/components/product-docs/platform-docs-article-form";
import { useToast } from "@/components/primitives";
import {
  getNonFieldErrorMessage,
  scheduleScrollToFirstFormError,
  setFormErrrors,
} from "@/helpers/form";
import { invalidateHelpDocsQueries } from "@/lib/product-docs/invalidate-help-queries";
import {
  deleteAdminArticle,
  fetchAdminArticle,
  fetchAdminCategories,
  publishAdminArticle,
  unpublishAdminArticle,
  updateAdminArticle,
} from "@/lib/product-docs-api";

export default function PlatformDocsEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const articleId = Number(params.id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const formHandleRef = useRef<PlatformDocsArticleFormHandle>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["platform-docs-categories"],
    queryFn: fetchAdminCategories,
  });

  const { data: article, isLoading } = useQuery({
    queryKey: ["platform-docs-article", articleId],
    queryFn: () => fetchAdminArticle(articleId),
    enabled: Number.isFinite(articleId),
  });

  const updateMutation = useMutation({
    mutationFn: (values: PlatformDocsArticleFormValues) =>
      updateAdminArticle(articleId, {
        title: values.title,
        slug: values.slug,
        markdown_body: values.markdown_body,
        category: values.category,
        audiences: values.audiences,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-articles"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-article", articleId] });
      invalidateHelpDocsQueries(queryClient);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e) => {
      const form = formHandleRef.current?.form;
      if (form) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
      }
      toast.add({
        description: getNonFieldErrorMessage(e) ?? "Could not save article.",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishAdminArticle(articleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-articles"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-article", articleId] });
      invalidateHelpDocsQueries(queryClient);
      toast.add({ description: "Article published" });
    },
    onError: (e) => {
      toast.add({
        description: getNonFieldErrorMessage(e) ?? "Publish failed",
      });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: () => unpublishAdminArticle(articleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-articles"] });
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-article", articleId] });
      invalidateHelpDocsQueries(queryClient);
      toast.add({ description: "Article unpublished" });
    },
    onError: (e) => {
      toast.add({
        description: getNonFieldErrorMessage(e) ?? "Unpublish failed",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminArticle(articleId),
    onSuccess: () => {
      invalidateHelpDocsQueries(queryClient);
      router.push("/platform/docs");
    },
    onError: (e) => {
      toast.add({
        description: getNonFieldErrorMessage(e) ?? "Delete failed",
      });
    },
  });

  if (isLoading || !article) {
    return <p className="p-6 text-text-secondary lg:p-8">Loading…</p>;
  }

  return (
    <PlatformDocsArticleForm
      formRef={formHandleRef}
      categories={categories}
      initial={article}
      articleId={articleId}
      saveSuccess={saveSuccess}
      saving={
        updateMutation.isPending ||
        publishMutation.isPending ||
        unpublishMutation.isPending ||
        deleteMutation.isPending
      }
      onSubmit={(values) => updateMutation.mutate(values)}
      onPublish={() => publishMutation.mutate()}
      onUnpublish={() => unpublishMutation.mutate()}
      onDelete={() => {
        if (window.confirm("Delete this article?")) {
          deleteMutation.mutate();
        }
      }}
    />
  );
}
