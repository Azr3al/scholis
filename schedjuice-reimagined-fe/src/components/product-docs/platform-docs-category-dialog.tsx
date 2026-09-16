"use client";
import { Button, Dialog, Input, Select, buttonVariants, inputClassName } from "@/components/primitives";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";

import { FormErrorBanner } from "@/components/product-docs/form-error-banner";
import { scheduleScrollToFirstFormError, setFormErrrors } from "@/helpers/form";
import { createAdminCategory } from "@/lib/product-docs-api";
import { slugifyTitle } from "@/lib/product-docs/slugify";
import {
  platformDocsCategorySchema,
  type PlatformDocsCategoryValues,
} from "@/lib/product-docs/schemas";

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Administrators" },
  { value: "teacher", label: "Teachers" },
  { value: "student", label: "Students" },
] as const;

export function PlatformDocsCategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const slugTouched = useRef(false);

  const form = useForm<PlatformDocsCategoryValues>({
    resolver: zodResolver(platformDocsCategorySchema),
    defaultValues: {
      title: "",
      slug: "",
      sort_order: 0,
      default_audience: "all",
    },
  });

  const title = form.watch("title");

  useEffect(() => {
    if (!slugTouched.current && title) {
      form.setValue("slug", slugifyTitle(title), { shouldValidate: true });
    }
  }, [title, form]);

  useEffect(() => {
    if (!open) {
      form.reset();
      slugTouched.current = false;
    }
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: createAdminCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-docs-categories"] });
      onOpenChange(false);
    },
    onError: (e) => {
      const applied = setFormErrrors(e, form);
      if (applied) scheduleScrollToFirstFormError(form);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Add category</Dialog.Title>
        </div>
        <div {...form}>
          <form
            onSubmit={form.handleSubmit(
              (values) => mutation.mutate(values),
              () => scheduleScrollToFirstFormError(form),
            )}
            className="space-y-4"
          >
            <FormErrorBanner message={form.formState.errors.root?.message} />

            <fieldset
              disabled={mutation.isPending}
              className="min-w-0 space-y-4 border-0 p-0 m-0"
            >
            <Controller
              control={form.control}
              name="title"
              render={({ field }) => (
                <div>
                  <label>Title</label>
                  <div>
                    <Input {...field} />
                  </div>
                  <p />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="slug"
              render={({ field }) => (
                <div>
                  <label>Slug</label>
                  <div>
                    <Input
                      {...field}
                      onChange={(e) => {
                        slugTouched.current = true;
                        field.onChange(e);
                      }}
                    />
                  </div>
                  <p />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="default_audience"
              render={({ field }) => (
                <div>
                  <label>Default audience</label>
                  <Select value={field.value} onValueChange={field.onChange} items={AUDIENCE_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))} />
                  <p />
                </div>
              )}
            />

            </fieldset>
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending}>
                Create category
              </Button>
            </div>
          </form>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
