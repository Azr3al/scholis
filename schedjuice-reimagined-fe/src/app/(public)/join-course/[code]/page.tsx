"use client";

import {
  makeGetRequest,
  makePostRequest,
} from "@/app/client-api/utils";
import { Loader } from "@/components/form/loader";
import { Button, buttonVariants } from "@/components/primitives";
import { PageContainer } from "@/components/layout/page-container";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(public)/join-course/[code]"),
);
import { Card, CardContent, CardHeader, CardTitle } from "@/components/public/elevated-card";
import { useToast } from "@/components/primitives";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useUser } from "@/hooks/useUser";
import {
  courseJoinRequestStatus,
  courseJoinRequestType,
  joinCourseLookupResponse,
} from "@/types/course";
import { role } from "@/types/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useEffect, useState } from "react";

const JoinCourseWithLinkPage = () => {
  const [joinRequest, setJoinRequest] = useState<courseJoinRequestType | null>(
    null
  );
  const { code } = useParams<{ code: string }>();
  const { user, isLoading: isUserLoading } = useUser(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const getCourse = useQuery({
    queryKey: ["getCourseByJoinCode", code],
    queryFn: async () => {
      const response = await makeGetRequest(`courses/join/${code}`);
      return response.data.data as joinCourseLookupResponse;
    },
  });
  const createJoinRequestMutation = useMutation({
    mutationKey: ["createJoinRequest", code],
    mutationFn: () => makePostRequest(`courses/join/${code}/request`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["getCourseByJoinCode", code] });
      router.push(`/profile`);
      toast.add({
        description: "Your request to join the course has been sent",
      });
    },
    onError: (error) => {
      toast.add({
        description: parseSchedjuiceApiError(
          error,
          "Failed to submit join request."
        ),
      });
    },
  });

  const courseData = getCourse.data;
  const expired = courseData?.is_join_code_expired;
  const disabled = courseData?.is_join_code_disabled;
  const alreadyJoined = courseData?.is_already_joined;
  const isRejected =
    joinRequest?.status === courseJoinRequestStatus.rejected;
  const canRequestJoin =
    !expired &&
    !disabled &&
    !alreadyJoined &&
    (!joinRequest ||
      joinRequest.status === courseJoinRequestStatus.rejected);

  useEffect(() => {
    if (getCourse.isSuccess && courseData) {
      // Only send anonymous users to register. Wait for client session load so
      // we don't bounce logged-in students when the API has not yet resolved them.
      if (!courseData.has_user && !user && !isUserLoading) {
        router.push(
          `/register?courseId=${courseData.id}&next=${encodeURIComponent(`/join-course/${code}`)}`
        );
      }
      setJoinRequest(courseData.previous_join_request ?? null);
    }
  }, [getCourse.isSuccess, courseData, code, router, user, isUserLoading]);

  useEffect(() => {
    if (
      joinRequest &&
      joinRequest.status === courseJoinRequestStatus.approved
    ) {
      router.push(`/courses/${joinRequest.course}`);
    }
  }, [joinRequest, router]);

  return (
    <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
      <Card>
        <CardHeader>
          <CardTitle>Join Course</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getCourse.isLoading && (
              <div className="flex items-center gap-2">
                <Loader></Loader>
                <p>Loading...</p>
              </div>
            )}
            {getCourse.isError && (
              <div className="space-y-3">
                <p>This join code is invalid or the link could not be loaded.</p>
                <Button variant="secondary" onClick={() => getCourse.refetch()}>
                  Try again
                </Button>
              </div>
            )}
            {user && !user?.roles?.includes(role.student) ? (
              <div className="space-y-3">
                <p>
                  You are <span className="font-bold">not authorized</span> to
                  access this page. Only students can join courses with a link.
                </p>
                <Link
                  href={`/`}
                  className={buttonVariants({ variant: "secondary"  })}
                >
                  Go back
                </Link>
              </div>
            ) : (
              getCourse.isSuccess && (
                <>
                  {disabled && (
                    <p>Joining this course with a code is not available.</p>
                  )}
                  {expired && (
                    <p>Your invite link is invalid or expired.</p>
                  )}
                  {alreadyJoined && (
                    <p>You are already enrolled in this course.</p>
                  )}
                  {joinRequest && (
                    <div className="space-y-3">
                      {joinRequest.status ===
                        courseJoinRequestStatus.rejected && (
                        <p>Your request to join the course has been rejected.</p>
                      )}
                      {joinRequest.status === courseJoinRequestStatus.pending && (
                        <div className="space-y-3">
                          <p>
                            Your request to join the course is under review. We
                            will notify you once it is approved.
                          </p>
                          <Link
                            href={`${window.location.origin}/`}
                            className={buttonVariants({ variant: "secondary"  })}
                          >
                            Go back
                          </Link>
                        </div>
                      )}
                    </div>
                  )}

                  {canRequestJoin && (
                    <div className="space-y-3">
                      <p className="text-xl font-bold">{courseData?.title}</p>
                      <Button
                        onClick={() => createJoinRequestMutation.mutate()}
                        isLoading={createJoinRequestMutation.isPending}
                      >
                        {isRejected ? "Request again" : "Request to join"}
                      </Button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default JoinCourseWithLinkPage;
