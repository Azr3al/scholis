"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import DeleteZone from "@/components/form/delete-zone";
import AutoForm, {
  AutoFormSkeleton,
  type AutoFormGroup,
  type AutoFormInputComponentProps,
  getDefaultValues,
  getObjectFormSchema,
} from "@/components/auto-form";
import BackButton from "@/components/misc/back-button";
import { Button, Field, Select, Separator, Skeleton } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import SchemaAccordion from "@/components/visibility/schema-accordion";
import { setFormErrrors } from "@/helpers/form";
import { getMutableRoleOfUser } from "@/helpers/role";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { accountVisibilitySchema } from "@/types/user";
import { visibilityCreateSchema, visibilitySchema } from "@/types/visibility";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const VISIBILITY_EDIT_GROUPS: AutoFormGroup[] = [
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

const VISIBILITY_EDIT_FIELD_CONFIG = {
  name: {
    description:
      "Choose a name you can easily identify this visibility setting with.",
  },
  role: {
    fieldType: VisibilityRoleFieldType,
  },
};

const VisibilityEditPage = () => {
  const [userSelectedColumns, setUserSelectedColumns] = useState<string[]>([]);

  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isFetching, refetch, isSuccess } = useQuery({
    queryKey: ["getVisibility", id],
    queryFn: () => fetchEntity("visibilities", id, ["created_by"]),
    enabled: false,
  });

  const objectFormSchema = getObjectFormSchema(visibilityCreateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(visibilityCreateSchema),
    defaultValues: { ...getDefaultValues(visibilitySchema) },
  });

  const visibilityUpdateMutation = useMutation({
    mutationKey: ["UpdateVisibility"],
    mutationFn: (data: any) => updateEntity("visibilities", id, data),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Visibility updated successfully.",
      });
      router.push("/visibilities");
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({
        title: "Error",
        description: "Failed to update visibility.",
      });
    },
  });
  const onSubmit = (data: any) => {
    visibilityUpdateMutation.mutate({
      ...data,
      settings: {
        user: userSelectedColumns,
      },
    });
  };

  useEffect(() => {
    if (isSuccess && data) {
      Object.keys(data.data.data).forEach((key) => {
        if (["name", "role"].includes(key)) {
          form.setValue(key, data.data.data[key]);
        }
      });
      setUserSelectedColumns(data.data.data.settings.user);
    }
  }, [data, isSuccess]);
  useEffect(() => {
    refetch();
  }, []);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/visibilities"></BackButton>
      {isLoading || isFetching ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-9 w-32" />
          <AutoFormSkeleton groups={VISIBILITY_EDIT_GROUPS} saveMode="create" />
          <Separator />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <h1 className=" text-3xl font-bold">Update</h1>
          <div className="space-y-3">
            {user && (
              <AutoForm
                schema={visibilityCreateSchema}
                saveMode="create"
                groups={VISIBILITY_EDIT_GROUPS}
                form={form}
                stickyFooter={false}
                onSubmit={(data) => onSubmit(data)}
                isSubmitting={visibilityUpdateMutation.isLoading}
                fieldConfig={VISIBILITY_EDIT_FIELD_CONFIG}
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
                  isLoading={visibilityUpdateMutation.isLoading}
                  type="submit"
                >
                  Submit
                </Button>
              </AutoForm>
            )}
            <DeleteZone
              entityName={"Visibility Setting"}
              entityId={id}
              deleteApiUrl="visibilities"
              validate_input={data?.data.data.name}
            ></DeleteZone>
          </div>
        </>
      )}
    </PageContainer>
  );
};

export default VisibilityEditPage;
