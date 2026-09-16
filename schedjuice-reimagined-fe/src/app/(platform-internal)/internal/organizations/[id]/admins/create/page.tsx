"use client";

import { PageContainer } from "@/components/layout/page-container";
import { makePostRequest } from "@/app/client-api/utils";
import EntityChooserCheckbox from "@/components/auth/entity-chooser-checkbox";
import AutoForm, {
  type AutoFormGroup,
  type AutoFormInputComponentProps,
  getObjectFormSchema,
} from "@/components/auto-form";
import CountrySelect from "@/components/form/country-select";
import { Button, Field } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { setFormErrrors } from "@/helpers/form";
import { useUser } from "@/hooks/useUser";
import { orgSectionHref } from "@/lib/org/org-section-href";
import { accountCreateSchema, role } from "@/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useFormContext } from "react-hook-form";
import * as z from "zod";
import { getDateISOString } from "@/helpers/date";
import { TypographyH1 } from "@/components/typography/h1";

const ADMIN_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Identity",
    description: "Name and contact details for the organization admin.",
    fields: [
      "name",
      "alternative_name",
      "email",
      "code",
      "communication_email",
      "gender",
      "date_of_birth",
      "phone_number",
    ],
  },
  {
    id: "address",
    title: "Address",
    description: "Optional location details.",
    fields: [
      "facebook_account_link",
      "house_number",
      "street",
      "country",
      "region",
      "city",
      "township",
    ],
    collapsible: true,
  },
  {
    id: "roles",
    title: "Roles",
    description: "Organization admin role assignment.",
    fields: ["roles"],
  },
];

function AdminRolesFieldType(props: AutoFormInputComponentProps) {
  const { user } = useUser();
  const form = useFormContext();

  return (
    <EntityChooserCheckbox
      userRoles={user?.roles ?? []}
      disabled={true}
      setRoles={(r, c) => {
        if (c) {
          form.setValue("roles", [
            ...form
              .getValues()
              ["roles"].filter((existing: role) => existing === r),
            r,
          ]);
        } else {
          form.setValue("roles", [
            ...form
              .getValues()
              ["roles"].filter((existing: role) => r !== existing),
          ]);
        }
      }}
      roles={form.getValues()["roles"]}
      {...props}
      isRequired
    />
  );
}

function AdminCountryFieldType({
  fieldProps,
  field,
  isRequired,
  fieldConfigItem,
  error,
}: AutoFormInputComponentProps) {
  const form = useFormContext();

  return (
    <Field.Root
      className="w-full max-w-xl"
      name={field.name}
      invalid={Boolean(error)}
    >
      <CountrySelect
        {...fieldProps}
        value={field.value}
        onChange={(v: string) => form.setValue("country", v)}
        isRequired={isRequired}
        formDescription={
          typeof fieldConfigItem.description === "string"
            ? fieldConfigItem.description
            : undefined
        }
      />
      <div className="min-h-5">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Field.Root>
  );
}

const ADMIN_CREATE_FIELD_CONFIG = {
  roles: {
    fieldType: AdminRolesFieldType,
  },
  country: {
    fieldType: AdminCountryFieldType,
  },
};

const AdminCreatePage = () => {
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const userCreateMutation = useMutation({
    mutationKey: ["createUser"],
    mutationFn: (data: any) =>
      makePostRequest(`/organizations/${id}/admins`, data),
    onSuccess: () => {
      toast.add({ description: "Organization admin created." });
      router.push(orgSectionHref("platform", id, "admins"));
    },
    onError: (e) => {
      setFormErrrors(e, form, (errorMsg: string) =>
        toast.add({
          title: "Error!",
          description: errorMsg,
        }),
      );
    },
  });

  const objectFormSchema = getObjectFormSchema(accountCreateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(accountCreateSchema),
    defaultValues: { roles: [] },
  });
  const onSubmit = (data: z.infer<typeof accountCreateSchema>) => {
    if (!data.roles || data.roles.length === 0) {
      form.setError("roles", { message: "Choose at least one role" });
    } else {
      data = {
        ...data,
        ...(data.date_of_birth
          ? { date_of_birth: getDateISOString(data.date_of_birth) }
          : {}),
        password: "Password123$",
      };
      userCreateMutation.mutate(data);
    }
  };
  useEffect(() => {
    form.setValue("roles", [role.superadmin]);
  }, [form]);

  return (
    <PageContainer width="narrow">
      <div className="space-y-3">
        <TypographyH1>Create Organization Admin</TypographyH1>
        {user ? (
          <AutoForm
            schema={accountCreateSchema}
            saveMode="create"
            groups={ADMIN_CREATE_GROUPS}
            form={form}
            stickyFooter={false}
            onSubmit={onSubmit}
            isSubmitting={userCreateMutation.isLoading}
            fieldConfig={ADMIN_CREATE_FIELD_CONFIG}
          >
            <Button isLoading={userCreateMutation.isLoading} type="submit">
              Submit
            </Button>
          </AutoForm>
        ) : null}
      </div>
    </PageContainer>
  );
};

export default AdminCreatePage;
