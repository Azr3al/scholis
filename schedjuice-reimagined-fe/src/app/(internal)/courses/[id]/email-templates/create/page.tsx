"use client";

import { PageContainer } from "@/components/layout/page-container";
import { searchEntities } from "@/app/client-api/utils";
import CourseSelect from "@/components/course/course-select";
import {
  defaultEditorOptions,
  getEmailEditorOptions,
} from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import EmailTemplateForm from "@/components/email-templates/template-form";
import EmailTemplateHelpDialog from "@/components/help-dialogs/email-template-help";
import BackButton from "@/components/misc/back-button";

import { useToast } from "@/components/primitives";

import { operatorEnum } from "@/types/api";
import { emailTemplateCreateSchema } from "@/types/email-template";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import { useParams } from "next/navigation";

import * as z from "zod";

const EmailTemplateCreatePage = () => {
  const { id } = useParams<{id: string}>();
  const toast = useToast();

  const getValidEmails = useQuery({
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

  return  (
<PageContainer width="narrow" className="space-y-3">
      <div className="flex justify-between items-center">
        <BackButton href={`/courses/${id}/email-templates`}></BackButton>
        <EmailTemplateHelpDialog></EmailTemplateHelpDialog>
      </div>

      {getValidEmails.isSuccess && getValidEmails.data && (
        <EmailTemplateForm
          courseId={id}
          userEmailPairs={getValidEmails.data?.data.data.map((d: any) => {
            return { email: d.user.email, id: d.user.id };
          })}
        ></EmailTemplateForm>
      )}
    </PageContainer>
);
};

export default EmailTemplateCreatePage;
