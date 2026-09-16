"use client";
import { Button, Input, Skeleton } from "@/components/primitives";
import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import UploadPreview from "@/components/attachment-uploader/upload-preview";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/courses/ui/card";
import { useToast } from "@/components/primitives";
import { formatDateTime } from "@/helpers/date";
import { formatUserScore } from "@/helpers/formatters";
import { useJuiceBoxAttachments } from "@/lib/juicebox/use-juicebox-attachments";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { usePageHeader } from "@/components/shell/use-page-header";

const SubmissionDetailsPage: React.FC = () => {
  const [isScoreEditMode, setIsScoreEditMode] = useState(false);
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["getSubmission", id],
    queryFn: () =>
      fetchEntity("submissions", id, ["assignment", "created_by"]),
  });

  const { data: submissionAttachments = [] } = useJuiceBoxAttachments({
    resource: "submission",
    foreignKey: String(id ?? ""),
    enabled: Boolean(id),
  });
  const form = useForm({
    defaultValues: {
      user_score: data?.data.data.user_score || 0,
    },
  });

  const scoreUpdateMutation = useMutation({
    mutationKey: ["scoreUpdate"],
    mutationFn: (data: any) => updateEntity("submissions", id, data),
    onSuccess: () => {
      toast.add({ description: "Student's score successfully updated." });
      refetch();
      setIsScoreEditMode(false);
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to update student's score.",
      });
    },
  });

  const submitHandler = (formData: { user_score: number }) => {
    if (formData.user_score > data?.data.data.assignment.available_score) {
      form.setError("user_score", {
        message:
          "User score must not be greater than the assignment's available score.",
      });
      return;
    }
    scoreUpdateMutation.mutate(formData);
  };

  const submission = data?.data.data;
  const pageHeaderConfig = useMemo(
    () => ({
      breadcrumb: (
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm"
        >
          {submission?.assignment?.id ? (
            <Link
              href={`/assignments/${submission.assignment.id}`}
              className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
            >
              {submission.assignment.title ?? "Assignment"}
            </Link>
          ) : (
            <span className="shrink-0 text-text-muted">Assignment</span>
          )}
          {submission?.created_by?.name ? (
            <>
              <span className="shrink-0 text-text-muted" aria-hidden>
                /
              </span>
              <span className="truncate font-serif text-lg text-text-primary">
                {submission.created_by.name}&apos;s submission
              </span>
            </>
          ) : null}
        </nav>
      ),
    }),
    [submission],
  );
  usePageHeader(pageHeaderConfig);

  return  (
<PageContainer width="default">
<div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="w-full h-20"></Skeleton>{" "}
            <Skeleton className="w-full h-52"></Skeleton>
          </>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardDescription className="flex flex-col">
                  <span>
                    Submitted at: {formatDateTime(data?.data.data.created_at)}
                  </span>
                  <span>
                    Attempt: {data?.data.data.attempt_count}/
                    {data?.data.data.assignment.max_attempts}
                  </span>
                </CardDescription>
                <div className="flex items-center gap-3">
                  {isScoreEditMode ? (
                    <>
                      <div className="space-y-3">
                        <form
                          onSubmit={form.handleSubmit(submitHandler)}
                          className="flex items-center gap-3"
                        >
                          <div className="relative">
                            <Input
                              {...form.register("user_score")}
                              type="number"
                              className="pr-14"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                              /{data?.data.data.assignment.available_score}
                            </span>
                          </div>

                          <Button type="submit" isLoading={scoreUpdateMutation.isLoading}>
                            Save
                          </Button>
                          <Button
                            type="button"
                            onClick={() => setIsScoreEditMode(false)}
                            variant={"secondary"}
                          >
                            Cancel
                          </Button>
                        </form>
                        <p className=" text-destructive">
                          {/* @ts-ignore */}
                          {form.formState.errors &&
                            form.formState.errors.user_score?.message}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        Score:{" "}
                        {formatUserScore(
                          data?.data.data.assignment.available_score,
                          data?.data.data.user_score
                        )}
                      </p>{" "}
                      <Button onClick={() => setIsScoreEditMode(true)}>
                        Edit
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p>{data?.data.data.description}</p>
                <UploadPreview
                  files={submissionAttachments}
                  canDelete={false}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
</PageContainer>
);
};

export default SubmissionDetailsPage;
