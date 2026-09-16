"use client";

import { PageContainer } from "@/components/layout/page-container";
import { makePostRequest } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import { Button, Field, Input } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { FormFieldErrorSlot } from "@/components/form/field-error-slot";
import { RequiredMark } from "@/components/form/required-mark";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { QuizStatus, quizCreateSchema } from "@/types/quiz-v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { useEffect } from "react";
import * as z from "zod";

export default function QuizzesV3CreatePage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<z.infer<typeof quizCreateSchema>>({
    resolver: zodResolver(quizCreateSchema),
    defaultValues: {
      title: "",
      status: QuizStatus.Draft,
      can_show_answers_afterwards: false,
      can_navigate_questions: false,
      max_retakes: 3,
      allowed_minutes: 60,
      activation_date: null,
      expiry_date: null,
      category: undefined,
      course: null,
    },
  });

  useEffect(() => {
    const raw = searchParams.get("course");
    if (!raw) return;
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id < 1) return;
    form.setValue("course", id);
  }, [searchParams, form]);

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof quizCreateSchema>) =>
      makePostRequest("quizzes", {
        ...data,
        version: 1,
      }),
    onSuccess: (res: { data?: { data?: { id?: number } } }) => {
      toast.add({ description: "Quiz created." });
      const id = res?.data?.data?.id;
      if (id) router.push(`/quizzes-v3/${id}/edit`);
    },
  });

  return (
    <PageContainer width="narrow" className="mx-auto max-w-lg space-y-4">
      <Link
        href="/quizzes-v3"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Quizzes
      </Link>
      <h1 className="text-xl font-semibold text-text-primary">Create quiz</h1>
      <FormProvider {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(
            (data) => createMutation.mutate(data),
            () => scheduleScrollToFirstFormError(form),
          )}
        >
          <Controller
            control={form.control}
            name="title"
            render={({ field, fieldState }) => (
              <Field.Root
                className="w-full"
                name={field.name}
                invalid={Boolean(fieldState.error)}
              >
                <Field.Label>
                  Title
                  <RequiredMark />
                </Field.Label>
                <Input {...field} />
                <FormFieldErrorSlot message={fieldState.error?.message} />
              </Field.Root>
            )}
          />
          <Controller
            control={form.control}
            name="max_retakes"
            render={({ field, fieldState }) => (
              <Field.Root
                className="w-full"
                name={field.name}
                invalid={Boolean(fieldState.error)}
              >
                <Field.Label>Max attempts</Field.Label>
                <Input
                  type="number"
                  min={1}
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
              </Field.Root>
            )}
          />
          <Controller
            control={form.control}
            name="allowed_minutes"
            render={({ field, fieldState }) => (
              <Field.Root
                className="w-full"
                name={field.name}
                invalid={Boolean(fieldState.error)}
              >
                <Field.Label>Time limit (minutes)</Field.Label>
                <Input
                  type="number"
                  min={1}
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
              </Field.Root>
            )}
          />
          <Controller
            control={form.control}
            name="category"
            render={({ field, fieldState }) => (
              <Field.Root
                className="w-full"
                name={field.name}
                invalid={Boolean(fieldState.error)}
              >
                <Field.Label>Category</Field.Label>
                <EntityCombobox
                  entity="quiz-categories"
                  queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
                  displayFunction={(c) => c.title}
                  value={
                    field.value != null ? String(field.value) : ""
                  }
                  onChange={(v) =>
                    field.onChange(v === "" ? undefined : Number(v))
                  }
                  label=""
                  comboboxPlaceholder="Select category"
                  allowDeselect={false}
                  onCreateNew={{
                    buttonLabel: "New category",
                    dialogTitle: "New quiz category",
                    inputLabel: "Title",
                    inputPlaceholder: "e.g. Unit 1 review",
                    create: async (title) => {
                      const res = await makePostRequest(
                        "quiz-categories",
                        { title, description: null },
                      );
                      const id = res?.data?.data?.id;
                      if (id == null) {
                        throw new Error("Missing id in response");
                      }
                      return id;
                    },
                  }}
                />
                <div className="min-h-5">
                  {fieldState.error?.message ? (
                    <p className="text-sm text-danger" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
              </Field.Root>
            )}
          />
          <Button type="submit" isLoading={createMutation.isPending}>
            Create
          </Button>
        </form>
      </FormProvider>
    </PageContainer>
  );
}
