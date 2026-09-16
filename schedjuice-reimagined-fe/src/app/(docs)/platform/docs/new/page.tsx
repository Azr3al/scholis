"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useRouter } from "next/navigation";

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
import { createAdminArticle, fetchAdminCategories } from "@/lib/product-docs-api";

export default function PlatformDocsNewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const formHandleRef = useRef<PlatformDocsArticleFormHandle>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["platform-docs-categories"],
    queryFn: fetchAdminCategories,
  });

  const createMutation = useMutation({
    mutationFn: createAdminArticle,
    onSuccess: (article) => {
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-articles"] });
      router.push(`/platform/docs/${article.id}`);
    },
    onError: (e) => {
      const form = formHandleRef.current?.form;
      if (form) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
      }
      toast.add({
        description: getNonFieldErrorMessage(e) ?? "Could not create article.",
      });
    },
  });

  return (
    <PlatformDocsArticleForm
      formRef={formHandleRef}
      categories={categories}
      saving={createMutation.isPending}
      onSubmit={(values: PlatformDocsArticleFormValues) => {
        createMutation.mutate({
          title: values.title,
          slug: values.slug,
          markdown_body: values.markdown_body,
          category: values.category,
          audiences: values.audiences,
        });
      }}
    />
  );
}
