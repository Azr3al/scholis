"use client";

import { PageContainer } from "@/components/layout/page-container";
import { makePostRequest } from "@/app/client-api/utils";
import AutoForm, {
  getDefaultValues,
  getObjectFormSchema,
  type AutoFormGroup,
} from "@/components/auto-form";
import { buttonVariants } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { setFormErrrors } from "@/helpers/form";
import { cn } from "@/lib/utils";
import { organizationCreateSchema } from "@/types/organization";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import * as z from "zod";

const ORGANIZATION_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "basics",
    title: "Organization basics",
    description: "Name, branding, and public copy for this tenant.",
    fields: ["name", "logo", "description", "tagline"],
  },
  {
    id: "domain",
    title: "Domain",
    description: "Primary domain used to reach this organization.",
    fields: ["domain_url"],
  },
  {
    id: "microsoft",
    title: "Microsoft sign-in",
    description: "Optional Azure AD settings for Microsoft login.",
    fields: ["is_microsoft_on", "authority", "app_id"],
    collapsible: true,
  },
];

const OrganizationCreatePage: React.FC = () => {
  const toast = useToast();
  const router = useRouter();
  const objectFormSchema = getObjectFormSchema(organizationCreateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(organizationCreateSchema),
    defaultValues: getDefaultValues(organizationCreateSchema),
  });

  const organizationCreateMutation = useMutation({
    mutationKey: ["createOrganization"],
    mutationFn: (data: any) => makePostRequest("organizations", data),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Organization created successfully.",
      });
      router.push("/internal/organizations");
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({
        title: "Error",
        description: "Failed to create organization.",
      });
    },
  });

  const onSubmit = (data: Record<string, unknown>) => {
    const parsed = organizationCreateSchema.parse(data);
    organizationCreateMutation.mutate({
      ...parsed,
      available_domains: [parsed.domain_url],
    });
  };

  return (
    <PageContainer width="narrow">
      <div className="space-y-3">
        <div>
          <Link
            href="/internal/organizations"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm"  }),
              "size-9 p-0",
            )}
            aria-label="Back to organizations"
          >
            <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          </Link>
        </div>
        <AutoForm
          schema={organizationCreateSchema}
          saveMode="create"
          groups={ORGANIZATION_CREATE_GROUPS}
          form={form}
          onSubmit={onSubmit}
          isSubmitting={organizationCreateMutation.isLoading}
          fieldConfig={{
            domain_url: {
              description:
                "e.g. 'google.com'. No need http or https or port number.",
            },
          }}
        />
        {organizationCreateMutation.isLoading && (
          <p className="text-text-secondary">
            Creating a new organization. This can take up to 5 minutes.
          </p>
        )}
      </div>
    </PageContainer>
  );
};

export default OrganizationCreatePage;
