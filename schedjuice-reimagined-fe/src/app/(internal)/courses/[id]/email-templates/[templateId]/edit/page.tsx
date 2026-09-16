"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, searchEntities } from "@/app/client-api/utils";
import EmailTemplateForm from "@/components/email-templates/template-form";
import EmailTemplateHelpDialog from "@/components/help-dialogs/email-template-help";
import BackButton from "@/components/misc/back-button";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect } from "react";

const EmailTemplateEditPage = () => {
  const { templateId, id } = useParams<{id: string, templateId: string}>();
  const getEmailTemplate = useQuery({
    enabled: false,
    queryKey: ["getEmailTemplate", templateId],
    queryFn: () => {
      return fetchEntity("email-templates", templateId, ["created_by"]);
    },
  });

  const getValidEmails = useQuery({
    enabled: false,
    queryKey: ["getUserCourses", id],
    queryFn: () => {
      return searchEntities(
        "user-courses",
        {
          expand: ["user"],
          size: -1,
          fields: ["user.email", "user.id"],
        },
        {
          filter_params: [
            {
              field_name: "course_id",
              value: id,
              operator: operatorEnum.exact,
            },
          ],
        }
      );
    },
  });
  useEffect(() => {
    getEmailTemplate.refetch();
    getValidEmails.refetch();
  }, []);
  return  (
<PageContainer width="narrow" className="space-y-3">
      <div className="flex justify-between items-center">
        <BackButton
          href={`/courses/${id}/email-templates/${templateId}`}
        ></BackButton>
        <EmailTemplateHelpDialog></EmailTemplateHelpDialog>
      </div>

      {getValidEmails.isSuccess && getValidEmails.data && (
        <EmailTemplateForm
          courseId={id}
          emailTemplate={getEmailTemplate.data?.data.data}
          userEmailPairs={getValidEmails.data?.data.data.map((d: any) => {
            return { email: d.user.email, id: d.user.id };
          })}
        ></EmailTemplateForm>
      )}
    </PageContainer>
);
};

export default EmailTemplateEditPage;
