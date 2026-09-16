"use client";

import { makePostRequest } from "@/app/client-api/utils";
import { DvrFieldCatalog } from "@/components/dvr/dvr-field-catalog";
import { DvrVerifyForm } from "@/components/dvr/dvr-verify-form";
import RoleChooser from "@/components/form/role-chooser";
import BackButton from "@/components/misc/back-button";
import { Button, Field, Input, Sheet, useToast } from "@/components/primitives";
import { InlineEntityTitle } from "@/components/record/inline/inline-entity-title";
import { TypographyH1 } from "@/components/typography/h1";
import {
  defaultDvrExpiresOn,
  defaultDvrFieldConfigs,
  DVR_PREVIEW_STUB_USER,
  DVR_STAFF_ROLE_DEFAULTS,
  isDvrBuiltinField,
  mergeCustomFieldDefaults,
  orderDvrFieldsLikeCatalog,
  type DvrFieldConfig,
} from "@/helpers/dvr";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import {
  entityTitleBackAlignClassName,
  entityTitleStickyChromeClassName,
} from "@/lib/layout/entity-title-chrome";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";
import { useMutation } from "@tanstack/react-query";
import { Settings } from "iconoir-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export function DvrCreateDesigner() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [selectedFields, setSelectedFields] = useState<DvrFieldConfig[]>(() =>
    defaultDvrFieldConfigs(),
  );
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => [
    ...DVR_STAFF_ROLE_DEFAULTS,
  ]);
  const [expiresOn, setExpiresOn] = useState(() => defaultDvrExpiresOn());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    data: definitions,
    isLoading: defsLoading,
    isError: defsError,
  } = useFieldDefinitions(CUSTOM_FIELD_ENTITY_USER);

  const customDefs = useMemo(
    () =>
      (definitions ?? []).filter(
        (d) =>
          d.source === "custom" &&
          d.is_active &&
          !isDvrBuiltinField(d.field_key),
      ),
    [definitions],
  );

  useEffect(() => {
    if (customDefs.length === 0) return;
    setSelectedFields((prev) =>
      mergeCustomFieldDefaults(
        prev,
        customDefs.map((d) => d.field_key),
      ),
    );
  }, [customDefs]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      makePostRequest("data-verification-requests", body),
    onSuccess: (res: any) => {
      const id = res?.data?.data?.id;
      router.push(
        id != null
          ? `/data-verification-requests/${id}`
          : "/data-verification-requests",
      );
    },
    onError: () => {
      toast.add({ type: "error", description: "Failed to create request" });
    },
  });

  function onSubmit() {
    if (selectedFields.length === 0) {
      toast.add({
        description: "Please select at least one field",
      });
      return;
    }
    if (selectedRoles.length === 0) {
      toast.add({
        description: "Please select at least one user type",
      });
      return;
    }
    if (!expiresOn) {
      toast.add({
        description: "Please choose an expiry date",
      });
      return;
    }
    if (!name.trim()) {
      toast.add({
        description: "Please enter a name",
      });
      return;
    }
    mutation.mutate({
      name: name.trim(),
      fields: orderDvrFieldsLikeCatalog(
        selectedFields,
        customDefs.map((d) => d.field_key),
      ),
      requested_user_types: selectedRoles,
      expires_on: expiresOn,
    });
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      <div className={entityTitleStickyChromeClassName()}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <BackButton
              href="/data-verification-requests"
              className={entityTitleBackAlignClassName()}
            />
            <TypographyH1 className="text-2xl leading-none lg:text-3xl">
              Create Data Verification Request
            </TypographyH1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Sheet.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
              <Sheet.Trigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Request settings"
                    className="px-2"
                  >
                    <Settings className="size-5" aria-hidden />
                  </Button>
                }
              />
              <Sheet.Portal>
                <Sheet.Backdrop />
                <Sheet.Popup side="right" className="gap-0 p-0">
                  <div className="space-y-1 border-b border-border px-6 py-5 pr-12">
                    <Sheet.Title className="text-lg font-semibold text-text-primary">
                      Request settings
                    </Sheet.Title>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
                    <Field.Root>
                      <Field.Label htmlFor="dvr-expires-on">
                        Expires on{" "}
                        <span className="text-destructive text-sm">*</span>
                      </Field.Label>
                      <Input
                        id="dvr-expires-on"
                        type="date"
                        value={expiresOn}
                        onChange={(e) => setExpiresOn(e.target.value)}
                      />
                      <Field.Description>
                        Banner stops after this date. Users can still open the
                        verify link later.
                      </Field.Description>
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>
                        Users{" "}
                        <span className="text-destructive text-sm">*</span>
                      </Field.Label>
                      <RoleChooser
                        roles={selectedRoles}
                        setRoles={setSelectedRoles}
                      />
                      <Field.Description>
                        Select the user types that will need to verify their
                        data. Matching users are enrolled when this request is
                        created and will see an in-app banner until they verify
                        (or the request expires).
                      </Field.Description>
                    </Field.Root>
                  </div>
                  <div className="border-t border-border px-6 py-4">
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      onClick={() => setSettingsOpen(false)}
                    >
                      Done
                    </Button>
                  </div>
                </Sheet.Popup>
              </Sheet.Portal>
            </Sheet.Root>
            <Button
              type="button"
              variant="primary"
              isLoading={mutation.isPending}
              onClick={onSubmit}
            >
              Submit
            </Button>
          </div>
        </div>
        <InlineEntityTitle
          value={name}
          onChange={setName}
          placeholder="untitled DVR"
          aria-label="Name"
          className="max-w-xl"
          inputClassName="max-w-xl"
        />
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div data-testid="dvr-preview" className="min-w-0">
          <DvrVerifyForm
            mode="preview"
            user={DVR_PREVIEW_STUB_USER}
            rawFields={selectedFields}
            title="Preview"
            description="This is what recipients will fill in."
          />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <DvrFieldCatalog
            selectedFields={selectedFields}
            setSelectedFields={setSelectedFields}
            customDefs={customDefs}
            defsLoading={defsLoading}
            defsError={defsError}
          />
        </aside>
      </div>
    </div>
  );
}
