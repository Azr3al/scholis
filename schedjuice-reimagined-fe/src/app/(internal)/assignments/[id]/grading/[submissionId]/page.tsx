"use client";
import { Button, buttonVariants, Field, Input, Textarea, Skeleton } from "@/components/primitives";
import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/courses/ui/card";
import { useToast } from "@/components/primitives";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import UploadPreview from "@/components/attachment-uploader/upload-preview";
import { formatDateTime } from "@/helpers/date";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { isStudent } from "@/helpers/authorization";
import { submissionType, submissionGradingSchema, submissionGradingType } from "@/types/assignment";
import { cn } from "@/lib/utils";
import { useJuiceBoxAttachments } from "@/lib/juicebox/use-juicebox-attachments";

const GradingPage = () => {
  const { id: assignmentId, submissionId } = useParams();
  const router = useRouter();
  const toast = useToast();
  const { user } = useUser();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user && isStudent(user)) {
      toast.add({
        description: "Only teachers can grade submissions.",
      });
      router.push(`/assignments/${assignmentId}`);
    }
  }, [user, router, assignmentId, toast]);

  const { data, isLoading } = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: () =>
      fetchEntity("submissions", submissionId as string, [
        "assignment",
        "created_by",
      ]),
    enabled: !!submissionId,
  });

  const { data: submissionAttachments = [] } = useJuiceBoxAttachments({
    resource: "submission",
    foreignKey: String(submissionId ?? ""),
    enabled: Boolean(submissionId),
  });

  const submission = data?.data?.data as submissionType | undefined;
  const assignment = typeof submission?.assignment === 'object' ? submission.assignment : undefined;
  const maxScore = assignment?.available_score;

  const form = useForm<submissionGradingType>({
    resolver: zodResolver(submissionGradingSchema),
    defaultValues: {
      user_score: 0,
      feedback: "",
    },
  });

  useEffect(() => {
    if (submission) {
      form.reset({
        user_score: submission.user_score || 0,
        feedback: submission.feedback || "",
      });
    }
  }, [submission, form]);

  const gradeMutation = useMutation({
    mutationFn: (formData: submissionGradingType) =>
      updateEntity("submissions", submissionId as string, {
        ...formData,
        is_graded: true,
      }),
    onSuccess: () => {
      toast.add({ description: "Submission graded successfully!" });
      queryClient.invalidateQueries({ queryKey: ["submission", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["assignment"] });
      router.push(`/assignments/${assignmentId}`);
    },
    onError: () => {
      toast.add({
        description: "Failed to grade submission",
      });
    },
  });

  const onSubmit = (formData: submissionGradingType) => {
    if (maxScore && formData.user_score > maxScore) {
      form.setError("user_score", {
        message: `Score cannot exceed maximum points (${maxScore})`,
      });
      return;
    }
    gradeMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="space-y-4 p-4">
        <Link
          href={`/assignments/${assignmentId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-text-secondary">Submission not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return  (
<PageContainer width="default" className="space-y-4 p-4">
      <Link
          href={`/assignments/${assignmentId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            Grading {submission.created_by?.name}&apos;s Submission
          </CardTitle>
          <div className="text-sm text-text-secondary space-y-1">
            <p>Submitted: {formatDateTime(submission.created_at as any)}</p>
            <p>
              Attempt: {submission.attempt_count}/{assignment?.max_attempts}
            </p>
            <p>Assignment: {assignment?.title}</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <h4 className="font-medium mb-2">Student&apos;s Work:</h4>
              <div className="p-3 bg-surface-hover rounded-md">
                <p className="text-sm whitespace-pre-wrap">
                  {submission.description || "No description provided"}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Attachments:</h4>
              {submissionAttachments.length > 0 ? (
                <UploadPreview
                  files={submissionAttachments}
                  canDelete={false}
                />
              ) : (
                <p className="text-sm text-text-secondary">No attachments</p>
              )}
            </div>

            <div className="border-t pt-6">
              <h4 className="font-medium mb-4">Grade Submission</h4>
              <FormProvider {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <Controller
                    control={form.control}
                    name="user_score"
                    render={({ field, fieldState }) => (
                      <Field.Root
                        className="w-full"
                        name={field.name}
                        invalid={Boolean(fieldState.error)}
                      >
                        <Field.Label>Score (Max: {maxScore})</Field.Label>
                        <Input
                          type="number"
                          placeholder="Enter score"
                          {...field}
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
                    name="feedback"
                    render={({ field, fieldState }) => (
                      <Field.Root
                        className="w-full"
                        name={field.name}
                        invalid={Boolean(fieldState.error)}
                      >
                        <Field.Label>Feedback (Optional)</Field.Label>
                        <Textarea
                          {...field}
                          placeholder="Provide feedback to the student..."
                          rows={5}
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

                  <div className="flex gap-2 pt-4">
                    <Button type="submit" isLoading={gradeMutation.isPending}>
                      Save Grade
                    </Button>
                    <Link
                      href={`/assignments/${assignmentId}`}
                      className={cn(buttonVariants({ variant: "secondary"  }))}
                    >
                      Cancel
                    </Link>
                  </div>
                </form>
              </FormProvider>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
);
};

export default GradingPage;
