"use client";
import { Button, Checkbox, Field, Input, Select, Separator, buttonVariants } from "@/components/primitives";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useImperativeHandle, useRef } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { DocsMarkdownEditor } from "@/components/product-docs/docs-markdown-editor";
import { FormErrorBanner } from "@/components/product-docs/form-error-banner";
import { FormSaveTick } from "@/components/product-docs/form-save-tick";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { slugifyTitle } from "@/lib/product-docs/slugify";
import {
  platformDocsArticleSchema,
  type PlatformDocsArticleValues,
} from "@/lib/product-docs/schemas";
import { cn } from "@/lib/utils";
import type { DocArticleAdmin, DocAudience, DocCategory } from "@/types/product-docs";

const AUDIENCE_OPTIONS: { value: DocAudience; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Administrators" },
  { value: "teacher", label: "Teachers" },
  { value: "student", label: "Students" },
];

export type PlatformDocsArticleFormValues = PlatformDocsArticleValues;

export type PlatformDocsArticleFormHandle = {
  form: UseFormReturn<PlatformDocsArticleValues>;
};

type PlatformDocsArticleFormProps = {
  categories: DocCategory[];
  initial?: DocArticleAdmin;
  articleId?: number;
  saving?: boolean;
  saveSuccess?: boolean;
  formRef?: React.Ref<PlatformDocsArticleFormHandle>;
  onSubmit: (values: PlatformDocsArticleFormValues) => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onDelete?: () => void;
};

function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ArticleToolbarActions({
  initial,
  saving,
  onPublish,
  onUnpublish,
}: {
  initial?: DocArticleAdmin;
  saving?: boolean;
  onPublish?: () => void;
  onUnpublish?: () => void;
}) {
  const showPreview = Boolean(initial?.slug);
  const showPublish = initial?.status === "draft" && onPublish;
  const showUnpublish = initial?.status === "published" && onUnpublish;

  if (!showPreview && !showPublish && !showUnpublish) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {showPreview &&
        (initial!.status === "published" ? (
          <Button
            type="button"
            variant="secondary" size="sm"
            onClick={() => {
              // Two-arg window.open opens a tab; a features string forces a popup window.
              window.open(`/help/${initial!.slug}`, "_blank");
            }}
          >
            See in action
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary" size="sm"
            disabled
            title="Publish the article to preview it on Help"
          >
            See in action
          </Button>
        ))}
      {showPublish ? (
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onPublish}>
          Publish
        </Button>
      ) : null}
      {showUnpublish ? (
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onUnpublish}>
          Unpublish
        </Button>
      ) : null}
    </div>
  );
}

export function PlatformDocsArticleForm({
  categories,
  initial,
  articleId,
  saving,
  saveSuccess,
  formRef,
  onSubmit,
  onPublish,
  onUnpublish,
  onDelete,
}: PlatformDocsArticleFormProps) {
  const slugTouched = useRef(Boolean(initial?.slug));

  const form = useForm<PlatformDocsArticleValues>({
    resolver: zodResolver(platformDocsArticleSchema),
    defaultValues: {
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
      markdown_body: initial?.markdown_body ?? "",
      category: initial?.category ?? undefined,
      audiences: initial?.audiences ?? ["all"],
    },
  });

  useImperativeHandle(formRef, () => ({ form }), [form]);

  const title = form.watch("title");
  const isNew = !initial;

  useEffect(() => {
    if (!slugTouched.current && title) {
      form.setValue("slug", slugifyTitle(title), { shouldValidate: true });
    }
  }, [title, form]);

  function toggleAudience(
    current: DocAudience[],
    value: DocAudience,
    checked: boolean,
  ): DocAudience[] {
    if (checked) return Array.from(new Set([...current, value]));
    return current.filter((a) => a !== value);
  }

  return (
      <form
        onSubmit={form.handleSubmit(onSubmit, () => scheduleScrollToFirstFormError(form))}
        className="flex h-full min-h-0 flex-col"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4 lg:px-8">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-text-primary">
                {isNew ? "New article" : initial.title || "Untitled article"}
              </h1>
              {!isNew && initial.status ? (
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium",
                    initial.status === "published"
                      ? "border-accent/30 bg-surface-active text-text-primary"
                      : "border-border bg-surface text-text-secondary",
                  )}
                >
                  {initial.status === "published" ? "Published" : "Draft"}
                </span>
              ) : null}
            </div>
            {!isNew && initial.slug ? (
              <p className="text-sm text-text-muted">/help/{initial.slug}</p>
            ) : (
              <p className="text-sm text-text-muted">
                Fill in the details below, then save to add it to the sidebar.
              </p>
            )}
          </div>
          <ArticleToolbarActions
            initial={initial}
            saving={saving}
            onPublish={onPublish}
            onUnpublish={onUnpublish}
          />
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
          <FormErrorBanner message={form.formState.errors.root?.message} />

          <div className="space-y-8">
            <FormSection
              title="Details"
              description="Title, URL slug, category, and who can read this article."
            >
              <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="title"
                    render={({ field, fieldState }) => (
                      <Field.Root name="title" invalid={Boolean(fieldState.error)}>
                        <Field.Label>Title</Field.Label>
                        
                          <Input {...field} placeholder="Getting started with attendance" />
                        
                        {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                      </Field.Root>)}
                  />
                  <Controller
                    control={form.control}
                    name="slug"
                    render={({ field, fieldState }) => (
                      <Field.Root name="slug" invalid={Boolean(fieldState.error)}>
                        <Field.Label>Slug</Field.Label>
                        
                          <Input
                            {...field}
                            placeholder="getting-started-attendance"
                            onChange={(e) => {
                              slugTouched.current = true;
                              field.onChange(e);
                            }}
                          />
                        
                        <p>Used in the /help URL.</p>
                        {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                      </Field.Root>)}
                  />
                </div>

                <Separator className="my-5" />

                <div className="grid gap-5 sm:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="category"
                    render={({ field, fieldState }) => (
                      <Field.Root name="category" invalid={Boolean(fieldState.error)}>
                        <Field.Label>Category</Field.Label>
                        
                          <Select
                            value={field.value ? String(field.value) : undefined}
                            onValueChange={(value) => field.onChange(Number(value))}
                            placeholder="Select category"
                            items={categories.map((cat) => ({
                              value: String(cat.id),
                              label: cat.title,
                            }))}
                          />
                        
                        {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                      </Field.Root>)}
                  />

                  <Controller
                    control={form.control}
                    name="audiences"
                    render={({ field, fieldState }) => (
                      <Field.Root name="audiences" invalid={Boolean(fieldState.error)}>
                        <Field.Label>Audiences</Field.Label>
                        <div className="grid grid-cols-2 gap-2">
                          {AUDIENCE_OPTIONS.map((option) => {
                            const selected = field.value.includes(option.value);
                            return (
                              <label
                                key={option.value}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)]",
                                  selected
                                    ? "border-accent bg-surface-active font-medium text-text-primary"
                                    : "border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                                )}
                              >
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={(checked) =>
                                    field.onChange(
                                      toggleAudience(field.value, option.value, checked === true),
                                    )
                                  }
                                />
                                {option.label}
                              </label>
                            );
                          })}
                        </div>
                        {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                      </Field.Root>)}
                  />
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Content"
              description="Write in Markdown. Drag or paste images and videos inline."
            >
              <Controller
                control={form.control}
                name="markdown_body"
                render={({ field, fieldState }) => (
                  <Field.Root name="markdown_body" invalid={Boolean(fieldState.error)}>
                    <DocsMarkdownEditor
                      value={field.value ?? ""}
                      onChange={(next) => field.onChange(next)}
                      articleId={articleId}
                    />
                    {fieldState.error?.message ? (
                      <Field.Error>{fieldState.error.message}</Field.Error>
                    ) : null}
                  </Field.Root>)}
              />
            </FormSection>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-6 py-4 lg:px-8">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <FormSaveTick visible={Boolean(saveSuccess)} />
          {onDelete ? (
            <Button
              type="button"
              variant="danger" disabled={saving}
              onClick={onDelete}
              className="ml-auto"
            >
              Delete
            </Button>
          ) : null}
        </footer>
      </form>
  );
}
