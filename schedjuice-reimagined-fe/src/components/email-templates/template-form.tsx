"use client";
import { Button, Input, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import * as z from "zod";
import { useEffect, useState } from "react";
import AutoForm, {
  getObjectFormSchema,
  type AutoFormGroup,
} from "@/components/auto-form";
import {
  emailTemplateCreateSchema,
  emailTemplateSchema,
} from "@/types/email-template";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEditor } from "@tiptap/react";
import { getEmailEditorOptions } from "../editor/config";
import TextEditor from "../editor/editor";
import { parseCsv } from "@/helpers/csv";
import {
  getPopulatedEmailTemplate,
  validateContent,
} from "@/helpers/email-template";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  makePostRequest,
  searchEntities,
  updateEntity,
} from "@/app/client-api/utils";
import { parseTemplate } from "@/helpers/template_parser";
import { operatorEnum } from "@/types/api";
import { useRouter } from "next/navigation";

const EMAIL_TEMPLATE_GROUPS: AutoFormGroup[] = [
  {
    id: "template",
    title: "Template details",
    description: "Internal name and email subject line.",
    fields: ["name", "subject"],
  },
];

interface TemplateFormProps {
  emailTemplate?: z.infer<typeof emailTemplateSchema>;
  courseId?: string;
  userEmailPairs?: {
    id: string;
    email: string;
  }[];
}

const EmailTemplateForm: React.FC<TemplateFormProps> = ({
  emailTemplate,
  courseId,
  userEmailPairs,
}) => {
  const toast = useToast();
  const router = useRouter();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [availableVariables, setAvailableVariables] = useState<string[]>([]);
  const objectFormSchema = getObjectFormSchema(emailTemplateCreateSchema);

  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(emailTemplateCreateSchema),
  });
  const editor = useEditor(getEmailEditorOptions());

  const getExistingUserEmails = useQuery({
    enabled: false,
    queryKey: ["getUserEmails", emailTemplate?.id],
    queryFn: () => {
      return searchEntities(
        "user-emails",
        {
          size: -1,
          fields: ["user.email", "id"],
          expand: ["user"],
        },
        {
          filter_params: [
            {
              field_name: "email_template",
              value: String(emailTemplate!.id),
              operator: operatorEnum.exact,
            },
          ],
        }
      );
    },
  });

  const userEmailBulkEditMutation = useMutation({
    mutationKey: ["editUserEmail"],
    mutationFn: (data: any) => {
      return makePostRequest(`user-emails/bulk-update`, data);
    },
    onSuccess: () => {
      const valid_variables: any = {};
      availableVariables.map((v) => {
        valid_variables[v] = "value";
      });
      emailTemplateEditMutation.mutate({
        body: editor?.getJSON(),
        valid_variables: valid_variables,
      });
    },
  });

  const emailTemplateEditMutation = useMutation({
    mutationKey: ["editEmailTemplate"],
    mutationFn: (data: any) => {
      return updateEntity(`email-templates`, emailTemplate!.id, data);
    },
    onSuccess: () => {
      toast.add({ description: "Email template saved successfully" });
    },
  });

  const userEmailCreateMutation = useMutation({
    mutationKey: ["createUserEmail"],
    mutationFn: (data: any) => {
      return makePostRequest("user-emails?bulk=true", data);
    },
    onSuccess: () => {
      toast.add({ description: "Emails queued successfully" });
      router.push(`/courses/${courseId}/email-templates`);
    },
  });

  const emailTemplateCreateMutation = useMutation({
    mutationKey: ["createEmailTemplate"],
    mutationFn: (data: any) => {
      return makePostRequest("email-templates", data);
    },
    onSuccess: (res) => {
      if (csvFile) {
        parseCsv(
          csvFile,
          (csvData) => {
            const objectValues: any[] = [];
            csvData.map((r) => {
              const { html: html_body, json: json_body } =
                getPopulatedEmailTemplate(editor!, r);
              const d: any = {
                email_template: res.data.data.id,
                is_bound: true,
                html_body,
                json_body,
                subject: parseTemplate(res.data.data.subject, r),
              };
              if (userEmailPairs) {
                const pair = userEmailPairs.find(
                  (pair) => pair.email === r.email
                );
                if (pair) {
                  d.user = pair.id;
                }
              }
              objectValues.push(d);
            });
            userEmailCreateMutation.mutate({ objects: objectValues });
          },
          (message) => {
            toast.add({
              type: "error",
              description: message,
            });
          }
        );
      }
    },
  });

  const validateCsvAndProceed = (
    data: any,
    onValid: (data: any, csvData: Record<string, string>[]) => void
  ) => {
    if (!csvFile) {
      toast.add({
        type: "error",
        description: "Upload a valid CSV file first",
      });
      return;
    }
    parseCsv(
      csvFile,
      (csvData) => {
        if (editor && editor?.getJSON()?.content?.length === 0) {
          toast.add({
            type: "error",
            description: "Please enter some content",
          });
          return;
        }
        if (csvData.length === 0 || Object.keys(csvData[0]).length === 0) {
          toast.add({
            type: "error",
            description: "CSV file is empty",
          });
          return;
        }
        if (!Object.keys(csvData[0]).includes("email")) {
          toast.add({
            type: "error",
            description:
              "CSV file must contain at least one column named 'email'",
          });
          return;
        }
        const missingKeys = validateContent(
          editor?.getJSON()?.content!,
          csvData[0]
        );
        if (missingKeys.length > 0) {
          toast.add({
            type: "error",
            description: `Missing variables: ${missingKeys.join(", ")}`,
          });
          return;
        }
        if (userEmailPairs) {
          const invalidEmails = csvData.filter(
            (row) =>
              !userEmailPairs.map((pair) => pair.email).includes(row.email)
          );
          if (invalidEmails.length > 0) {
            toast.add({
              type: "error",
              description: `These emails do not belong in this course: ${invalidEmails
                .map((row) => row.email)
                .join(", ")}`,
            });
            return;
          }
        }
        data.valid_variables = csvData[0];
        if (courseId) {
          data.course = parseInt(courseId);
        }
        data.body = editor?.getJSON();
        onValid(data, csvData);
      },
      (message) => {
        toast.add({
          type: "error",
          description: message,
        });
      }
    );
  };

  const onSubmit = (data: any) => {
    // meaning we are creating a new template
    if (!emailTemplate) {
      validateCsvAndProceed(data, (data, csvData) =>
        emailTemplateCreateMutation.mutate(data)
      );
    } else {
      // we are updating an existing template
      if (courseId) {
        data.course = parseInt(courseId);
      }

      const missingKeys = validateContent(
        editor?.getJSON().content!,
        emailTemplate.valid_variables
      );
      if (missingKeys.length > 0) {
        toast.add({
          type: "error",
          description: `Missing variables: ${missingKeys.join(", ")}`,
        });
        return;
      }
      data.body = editor?.getJSON();
      emailTemplateEditMutation.mutate(data);
    }
  };

  const onRegenerate = () => {
    validateCsvAndProceed(form.getValues(), (data, csvData) => {
      const objectValues: any[] = [];
      csvData.map((r) => {
        const { html: html_body, json: json_body } = getPopulatedEmailTemplate(
          editor!,
          r
        );
        const d: any = {
          html_body,
          json_body,
          subject: parseTemplate(emailTemplate!.subject, r),
          id: getExistingUserEmails.data?.data.data.find(
            (d: any) => d.user.email === r.email
          ).id,
        };
        objectValues.push(d);
      });

      userEmailBulkEditMutation.mutate({ objects: objectValues });
    });
  };

  useEffect(() => {
    if (emailTemplate) {
      editor?.commands.setContent(emailTemplate.body);
    }
  }, [editor]);

  useEffect(() => {
    form.setValue("name", emailTemplate?.name);
    form.setValue("subject", emailTemplate?.subject);
    setAvailableVariables(Object.keys(emailTemplate?.valid_variables || {}));
  }, [emailTemplate]);

  useEffect(() => {
    if (csvFile) {
      parseCsv(
        csvFile,
        (csvData) => {
          if (csvData.length > 0) {
            setAvailableVariables(Object.keys(csvData[0]));
          }
        },
        (message) => {
          toast.add({
            type: "error",
            description: message,
          });
        }
      );
    }
  }, [csvFile]);

  useEffect(() => {
    getExistingUserEmails.refetch();
  }, []);

  return (
    <div className="space-y-3">
      <div className="max-w-sm space-y-2">
        <label>
          Upload student list CSV <span className=" text-destructive">*</span>
        </label>
        <Input
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setCsvFile(file);
            }
          }}
          type="file"
        ></Input>
      </div>
      <AutoForm
        schema={emailTemplateCreateSchema}
        saveMode="create"
        groups={EMAIL_TEMPLATE_GROUPS}
        form={form}
        stickyFooter={false}
        fieldConfig={{
          name: {
            description: "Name of the email template (for internal use only)",
          },
          subject: {
            description: "Subject of the email (can contain variables)",
          },
        }}
      ></AutoForm>
      {availableVariables.length > 0 && (
        <p className="font-bold">Available variables</p>
      )}
      <div>
        {availableVariables.map((variable) => {
          return <li key={variable}>{variable}</li>;
        })}
      </div>
      {editor && (
        <div className="space-y-2">
          <label>
            Content <span className=" text-destructive">*</span>
          </label>
          <TextEditor editor={editor}></TextEditor>
        </div>
      )}
      <div className="space-x-3">
        <Button
          isLoading={
            emailTemplateEditMutation.isLoading ||
            emailTemplateCreateMutation.isLoading
          }
          type="button"
          onClick={() => form.handleSubmit(onSubmit)()}
        >
          Submit
        </Button>
        {emailTemplate && (
          <Button
            onClick={onRegenerate}
            isLoading={
              userEmailBulkEditMutation.isLoading ||
              emailTemplateEditMutation.isLoading
            }
            type="button"
            variant={"secondary"}
          >
            Regenerate
          </Button>
        )}
      </div>
    </div>
  );
};

export default EmailTemplateForm;
