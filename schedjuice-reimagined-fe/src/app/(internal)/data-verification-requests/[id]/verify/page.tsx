"use client";
import { PageContainer } from "@/components/layout/page-container";
import { useParams, useRouter } from "next/navigation";
import BackButton from "@/components/misc/back-button";
import { searchEntities, updateEntity } from "@/app/client-api/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AutoFormFieldsSkeleton } from "@/components/form/auto-form-fields-skeleton";
import { Skeleton } from "@/components/primitives";
import { DataVerificationRequestStatus } from "@/types/dvr";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { useEffect } from "react";
import { DvrVerifyForm } from "@/components/dvr/dvr-verify-form";
import { invalidatePendingUserDvrs } from "@/helpers/invalidate-pending-user-dvrs";

const DVRVerifyPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { data, isLoading, refetch } = useQuery({
    enabled: false,
    queryKey: ["get-dvr", id],
    queryFn: () =>
      searchEntities(
        "user-data-verification-requests",
        { expand: ["data_verification_request"] },
        {
          filter_params: [
            {
              field_name: "data_verification_request_id",
              operator: operatorEnum.exact,
              value: id,
            },
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: user!.id.toString(),
            },
          ],
        },
      ),
  });
  const dvrUpdateMutation = useMutation({
    mutationKey: ["update-dvr", id],
    mutationFn: (d: any) =>
      updateEntity("user-data-verification-requests", data?.data.data[0].id, d),
  });
  useEffect(() => {
    if (user) {
      refetch();
    }
  }, [user, refetch]);

  const rowStatus = data?.data?.data?.[0]?.status;
  useEffect(() => {
    if (!user?.id) return;
    if (rowStatus !== DataVerificationRequestStatus.VERIFIED) return;
    void invalidatePendingUserDvrs(queryClient, user.id);
  }, [queryClient, rowStatus, user?.id]);

  const requestName =
    data?.data?.data?.[0]?.data_verification_request?.name?.trim() ||
    "Data Verification Request";

  return (
    <PageContainer width="narrow" className="space-y-4">
      <BackButton href={`/profile`} label="Back to profile"></BackButton>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{requestName}</h1>
        <p className="text-sm text-text-secondary">
          Please verify your data. Update your information if needed.
        </p>
      </div>

      {isLoading && (
        <div
          className="space-y-6 pb-24 lg:pb-8"
          aria-busy="true"
          aria-label="Loading verification form"
        >
          <AutoFormFieldsSkeleton rows={5} />
          <Skeleton className="h-10 w-28" />
        </div>
      )}
      {data && user && (
        <div>
          {data.data.data.length === 0 && (
            <p className="font-semibold text-text-primary">
              Data verification request not found
            </p>
          )}
          {data.data.data.length > 0 && (
            <div>
              {data.data.data[0].status ===
                DataVerificationRequestStatus.VERIFIED && (
                <p className="font-semibold text-text-primary">
                  Data verification request already verified
                </p>
              )}
              {data.data.data[0].status ===
                DataVerificationRequestStatus.PENDING &&
                data.data.data[0].data_verification_request &&
                data.data.data[0].data_verification_request.fields &&
                user && (
                  <DvrVerifyForm
                    mode="verify"
                    user={user}
                    dvrId={Number(id)}
                    rawFields={
                      data.data.data[0].data_verification_request.fields
                    }
                    isVerifying={dvrUpdateMutation.isPending}
                    onVerified={() => {
                      dvrUpdateMutation.mutate(
                        { status: DataVerificationRequestStatus.VERIFIED },
                        {
                          onSuccess: () => {
                            void invalidatePendingUserDvrs(queryClient, user.id);
                            router.push("/profile");
                          },
                        },
                      );
                    }}
                  />
                )}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
};
export default DVRVerifyPage;
