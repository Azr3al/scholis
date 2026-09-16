"use client";

import { PageContainer } from "@/components/layout/page-container";
import { searchEntities } from "@/app/client-api/utils";
import BackButton from "@/components/misc/back-button";
import { Skeleton } from "@/components/primitives";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

const UserEmailIndexPage = () => {
  const { templateId, id } = useParams<{id: string, templateId: string}>();
  const router = useRouter();
  const getUserEmails = useQuery({
    queryKey: ["getUserEmailPreview", templateId],
    queryFn: () => {
      return searchEntities(
        "user-emails",
        {
          size: -1,
          fields: ["id", "user.id", "user.name"],
          sorts: ["-created_at"],
          expand: ["user"],
        },
        {
          filter_params: [
            {
              field_name: "email_template",
              value: templateId,
              operator: operatorEnum.exact,
            },
          ],
        }
      );
    },
  });
  useEffect(() => {
    if (getUserEmails.isSuccess && getUserEmails.data) {
      console.log(getUserEmails.data.data.data);
      if (getUserEmails.data.data.data.length > 0) {
        router.push(
          `/courses/${id}/email-templates/${templateId}/user-emails/${getUserEmails.data.data.data[0].id}`
        );
      }
    }
  }, [getUserEmails.data, getUserEmails.isSuccess]);

  return  (
<PageContainer width="default" className="space-y-3">
      <BackButton
        href={`/courses/${id}/email-templates/${templateId}`}
      ></BackButton>
      <h1 className=" text-3xl font-bold">Student Emails</h1>
      {(getUserEmails.isLoading || getUserEmails.isFetching) && (
        <Skeleton className="w-full h-40"></Skeleton>
      )}
      {getUserEmails.isSuccess && getUserEmails.data.data.length === 0 && (
        <div>
          <p>This template has no user attached</p>
        </div>
      )}
      {(getUserEmails.isLoading || getUserEmails.isFetching) && (
        <Skeleton className="w-full h-40"></Skeleton>
      )}
    </PageContainer>
);
};

export default UserEmailIndexPage;
