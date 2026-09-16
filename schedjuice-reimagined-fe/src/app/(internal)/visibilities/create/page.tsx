"use client";

import { PageContainer } from "@/components/layout/page-container";
import {
  visibilityCreateSchema,
  visibilitySchema,
} from "@/types/visibility";
import { accountVisibilitySchema } from "@/types/user";
import { useMemo, useState } from "react";
import SchemaAccordion from "@/components/visibility/schema-accordion";
import { Button, Field, Select, Separator } from "@/components/primitives";
import BackButton from "@/components/misc/back-button";
import AutoForm, {
  type AutoFormGroup,
  type AutoFormInputComponentProps,
  getDefaultValues,
  getObjectFormSchema,
} from "@/components/auto-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/components/primitives";
import { useRouter } from "next/navigation";
import { makePostRequest } from "@/app/client-api/utils";
import { setFormErrrors } from "@/helpers/form";
import { TypographyH1 } from "@/components/typography/h1";
import { getMutableRoleOfUser } from "@/helpers/role";

const VISIBILITY_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "basics",
    title: "Visibility setting",
    description: "Name and role this setting applies to.",
    fields: ["name", "role"],
  },
];

function VisibilityRoleFieldType({
  field,
  label,
  isRequired,
  error,
}: AutoFormInputComponentProps) {
  const { user } = useUser();
  const { tenant } = useTenant();
  const roleItems = useMemo(
    () =>
      getMutableRoleOfUser(user?.roles, tenant ?? undefined).map((r) => ({
        value: r,
        label: r,
      })),
    [user?.roles, tenant],
  );

  return (
    <Field.Root
      className="w-full max-w-xl"
      name={field.name}
      invalid={Boolean(error)}
    >
      <Field.Label>
        {label}
        {isRequired ? <span className="text-danger"> *</span> : null}
      </Field.Label>
      <Select
        items={roleItems}
        placeholder="Select a role"
        value={field.value ?? null}
        onValueChange={(v) => {
          field.onChange(v);
          field.onBlur();
        }}
        onOpenChange={(open) => {
          if (!open) field.onBlur();
        }}
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

const VISIBILITY_CREATE_FIELD_CONFIG = {
  name: {
    description:
      "Choose a name you can easily identify this visibility setting with.",
  },
  role: {
    fieldType: VisibilityRoleFieldType,
  },
};

const VisibilityCreatePage = () => {
  const [userSelectedColumns, setUserSelectedColumns] = useState<string[]>([]);
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();

  const objectFormSchema = getObjectFormSchema(visibilityCreateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(visibilityCreateSchema),
    defaultValues: { ...getDefaultValues(visibilitySchema) },
  });

  const visibilityCreateMutation = useMutation({
    mutationKey: ["createVisibility"],
    mutationFn: (data: any) => makePostRequest("visibilities", data),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Visibility created successfully.",
      });
      router.push("/visibilities");
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({
        title: "Error",
        description: "Failed to create visibility.",
      });
    },
  });

  const onSubmit = (data: any) => {
    visibilityCreateMutation.mutate({
      ...data,
      settings: {
        user: userSelectedColumns,
      },
    });
  };

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/visibilities"></BackButton>
      <TypographyH1>Create a new visibility setting</TypographyH1>

      <div className="space-y-3">
        {user && (
          <AutoForm
            schema={visibilityCreateSchema}
            saveMode="create"
            groups={VISIBILITY_CREATE_GROUPS}
            form={form}
            stickyFooter={false}
            onSubmit={(data) => onSubmit(data)}
            isSubmitting={visibilityCreateMutation.isLoading}
            fieldConfig={VISIBILITY_CREATE_FIELD_CONFIG}
          >
            <Separator></Separator>

            <p className="">
              For each entity, you can choose which columns to display.
            </p>

            <div className="space-y-3">
              <SchemaAccordion
                selectedColumns={userSelectedColumns}
                setSelectedColumns={setUserSelectedColumns}
                schema={accountVisibilitySchema}
                label="User"
              ></SchemaAccordion>
            </div>

            <Button
              isLoading={visibilityCreateMutation.isLoading}
              type="submit"
              className="mt-3"
            >
              Submit
            </Button>
          </AutoForm>
        )}
      </div>
    </PageContainer>
  );
};

export default VisibilityCreatePage;
