"use client";
import { Button, useToast } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { RecordPageSkeleton } from "@/components/record/record-page-skeleton";
import { hasAdminCredentials, isStudent } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { orgSectionHref } from "@/lib/org/org-section-href";
import { cn } from "@/lib/utils";
import {
  MS_PERSONAL_STATUS_QUERY_KEY,
  MS_SERVICE_STATUS_QUERY_KEY,
} from "@/hooks/useMicrosoftOAuth";
import {
  ZOOM_ACCOUNTS_QUERY_KEY,
  ZOOM_PERSONAL_STATUS_QUERY_KEY,
} from "@/hooks/useZoomAccounts";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { OrgRecordMode, OrgSectionId } from "@/config/org-record-sections";
import { isSchemaSectionId, visibleOrgSections } from "@/config/org-record-sections";
import { OrgMobileSections } from "./org-mobile-sections";
import { OrgRecordHeader } from "./org-record-header";
import { useOrgRecordRail } from "./use-org-record-rail";
import { useOrgRecordForm } from "./use-org-record-form";
import { useOrgRecordPageHeader } from "./use-org-record-page-header";
import { useOrgSection } from "./use-org-section";
import { OrgOverview } from "./sections/org-overview";
import { OrgSchemaSectionPanel } from "./sections/org-schema-section-panel";
import { OrgBrandingSection } from "./sections/org-branding-section";
import { OrgAdminsSection } from "./sections/org-admins-section";
import { OrgBillingSection } from "./sections/org-billing-section";
import { OrgAiSection } from "./sections/org-ai-section";
import ImageUploader from "@/components/images/image-uploader";
import { ImageCropPreset } from "@/components/images/image-crop-presets";
import { OrganizationLogoSection } from "@/components/organization/organization-logo-section";
import { IdCardBrandingSection } from "@/components/id-card/id-card-branding-section";
import { useIdCard } from "@/components/id-card/use-id-card";
import { TelegramWebhookActions } from "@/components/organization/telegram-webhook-actions";
import { PersonalZoomOAuthCard } from "@/components/organization/personal-zoom-oauth-card";
import { PersonalMicrosoftOAuthCard } from "@/components/organization/personal-microsoft-oauth-card";
import { ServiceMicrosoftOAuthCard } from "@/components/organization/service-microsoft-oauth-card";
import { ZoomAccountsSection } from "@/components/organization/zoom-accounts-section";
import {
  OrgRecordNavigationProvider,
  useOrgRecordNavigation,
} from "./org-record-navigation-context";
import { useOrgSectionScrollSpy } from "./use-org-section-scroll-spy";
import { OrgSectionAnchor } from "./org-section-anchor";
import { OrgSharedSettingsSaveBar } from "./org-shared-settings-save-bar";

const PROPAGATION_NOTE_SECTIONS = new Set([
  "profile",
  "microsoft",
  "telegram",
  "google",
  "video",
]);

function OrgRecordShellInner({
  mode,
  orgId: orgIdProp,
  railMountedExternally = false,
  recordBasePath,
}: {
  mode: OrgRecordMode;
  orgId?: string;
  railMountedExternally?: boolean;
  recordBasePath?: string;
}) {
  const { tenant, refetchTenant } = useTenant();
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigation = useOrgRecordNavigation();
  const orgId =
    mode === "tenant" ? String(tenant?.id ?? "") : (orgIdProp ?? "");

  const orgRecordCtx = useMemo(
    () =>
      user
        ? {
            mode,
            viewer: user,
            tenant,
          }
        : null,
    [mode, user, tenant],
  );

  const { section, pane, setSection, setPane } = useOrgSection(orgRecordCtx);
  const activeSection = navigation?.activeSection ?? section;
  const visibleSections = useMemo(
    () => (orgRecordCtx ? visibleOrgSections(orgRecordCtx) : []),
    [orgRecordCtx],
  );
  const visibleSectionIds = useMemo(
    () => visibleSections.map((s) => s.id),
    [visibleSections],
  );

  const [idCardLogoCleared, setIdCardLogoCleared] = useState(false);

  const {
    form,
    objectFormSchema,
    fieldConfig,
    orgRecord,
    orgQuery,
    isMicrosoftOn,
    isTelegramOn,
    saveAllDirtySections,
    discardSharedFormChanges,
    dirtySchemaSectionCount,
    isSaving,
  } = useOrgRecordForm({
    orgId: orgId || undefined,
    tenantOrg: tenant ?? undefined,
    refetchTenant,
    onSectionSaveSuccess: () => setIdCardLogoCleared(false),
  });

  useOrgSectionScrollSpy({
    sectionIds: visibleSectionIds,
    urlSection: section,
    onUrlSectionChange: setSection,
    enabled: Boolean(orgRecordCtx && orgRecord && !orgQuery.isLoading && orgId),
  });

  const handleSectionSelect = (nextSection: OrgSectionId) => {
    if (navigation) {
      navigation.navigateToSection(nextSection);
      return;
    }
    setSection(nextSection);
  };

  const [isDefaultCoverImageUploadOpen, setIsDefaultCoverImageUploadOpen] =
    useState(false);
  const { qrDataUrl } = useIdCard();

  useOrgRecordRail({
    mode,
    orgId,
    activeSection,
    org: orgRecord ?? null,
    ctx: orgRecordCtx,
    isLoading: orgQuery.isLoading,
    onSelect: handleSectionSelect,
    enabled: !railMountedExternally,
  });

  useOrgRecordPageHeader({
    org: orgRecord ?? null,
    mode,
    section: activeSection,
    enabled: !railMountedExternally,
  });

  useEffect(() => {
    if (isUserLoading || !user) return;
    if (isStudent(user)) {
      router.replace("/home");
    } else if (mode === "tenant" && !hasAdminCredentials(user)) {
      router.replace("/home");
    }
  }, [user, isUserLoading, router, mode]);

  const zoomOauthStatus = searchParams.get("zoom_oauth");
  const zoomOauthMessage = searchParams.get("zoom_oauth_message");
  const zoomPersonalOauthStatus = searchParams.get("zoom_oauth_personal");
  const zoomPersonalOauthMessage = searchParams.get(
    "zoom_oauth_personal_message",
  );
  const msPersonalOauthStatus = searchParams.get("microsoft_oauth_personal");
  const msPersonalOauthMessage = searchParams.get(
    "microsoft_oauth_personal_message",
  );
  const msServiceOauthStatus = searchParams.get("microsoft_oauth_service");
  const msServiceOauthMessage = searchParams.get(
    "microsoft_oauth_service_message",
  );

  useEffect(() => {
    if (!zoomOauthStatus || !orgId) return;
    if (zoomOauthStatus === "success") {
      toast.add({ description: "Zoom account updated." });
      void refetchTenant();
      void queryClient.invalidateQueries({ queryKey: ZOOM_ACCOUNTS_QUERY_KEY });
    } else if (zoomOauthStatus === "error") {
      toast.add({
        description: zoomOauthMessage || "Zoom connection did not complete.",
      });
    }
    router.replace(
      orgSectionHref(mode, orgId, "video", { basePath: recordBasePath }),
    );
  }, [
    zoomOauthStatus,
    zoomOauthMessage,
    orgId,
    mode,
    recordBasePath,
    queryClient,
    refetchTenant,
    router,
    toast,
  ]);

  useEffect(() => {
    if (!zoomPersonalOauthStatus || !orgId) return;
    if (zoomPersonalOauthStatus === "success") {
      toast.add({
        description: "Your Zoom account has been linked to your profile.",
      });
      void queryClient.invalidateQueries({
        queryKey: ZOOM_PERSONAL_STATUS_QUERY_KEY,
      });
    } else if (zoomPersonalOauthStatus === "error") {
      toast.add({
        description:
          zoomPersonalOauthMessage ||
          "Personal Zoom connection did not complete.",
      });
    }
    router.replace(
      orgSectionHref(mode, orgId, "video", { basePath: recordBasePath }),
    );
  }, [
    zoomPersonalOauthStatus,
    zoomPersonalOauthMessage,
    orgId,
    mode,
    recordBasePath,
    queryClient,
    router,
    toast,
  ]);

  useEffect(() => {
    if (!msPersonalOauthStatus || !orgId) return;
    if (msPersonalOauthStatus === "success") {
      toast.add({
        description: "Your Microsoft account has been linked to your profile.",
      });
      void queryClient.invalidateQueries({
        queryKey: MS_PERSONAL_STATUS_QUERY_KEY,
      });
    } else if (msPersonalOauthStatus === "error") {
      toast.add({
        description:
          msPersonalOauthMessage ||
          "Personal Microsoft connection did not complete.",
      });
    }
    router.replace(
      orgSectionHref(mode, orgId, "video", { basePath: recordBasePath }),
    );
  }, [
    msPersonalOauthStatus,
    msPersonalOauthMessage,
    orgId,
    mode,
    recordBasePath,
    queryClient,
    router,
    toast,
  ]);

  useEffect(() => {
    if (!msServiceOauthStatus || !orgId) return;
    if (msServiceOauthStatus === "success") {
      toast.add({
        description: "Microsoft service account connected.",
      });
      void queryClient.invalidateQueries({
        queryKey: MS_SERVICE_STATUS_QUERY_KEY,
      });
    } else if (msServiceOauthStatus === "error") {
      toast.add({
        description:
          msServiceOauthMessage ||
          "Microsoft service account connection did not complete.",
      });
    }
    router.replace(
      orgSectionHref(mode, orgId, "video", { basePath: recordBasePath }),
    );
  }, [
    msServiceOauthStatus,
    msServiceOauthMessage,
    orgId,
    mode,
    recordBasePath,
    queryClient,
    router,
    toast,
  ]);

  if (isUserLoading || orgQuery.isLoading || !user || !orgRecord || !orgId) {
    return <RecordPageSkeleton />;
  }

  const activeOrg = orgRecord;
  const isOwnTenant =
    tenant?.id != null && String(tenant.id) === String(orgId);

  const refetchOwnTenantIfNeeded = () => {
    if (isOwnTenant) {
      void refetchTenant();
    }
  };

  if (orgQuery.isError) {
    return (
      <PageContainer width="default">
        <div
          className="rounded-md border border-border bg-card p-4 text-sm"
          role="alert"
        >
          <p className="font-medium text-destructive">
            Failed to load organization settings.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => orgQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      </PageContainer>
    );
  }

  const renderSection = (sectionId: OrgSectionId) => {
    if (sectionId === "overview") {
      return (
        <OrgOverview
          org={orgRecord}
          mode={mode}
          orgId={orgId}
          recordBasePath={recordBasePath}
        />
      );
    }

    if (sectionId === "branding") {
      return <OrgBrandingSection orgId={orgId} mode={mode} />;
    }

    if (sectionId === "ai" && orgRecordCtx) {
      return (
        <OrgAiSection
          orgId={orgId}
          mode={mode}
          pane={pane}
          setPane={setPane}
          ctx={orgRecordCtx}
          recordBasePath={recordBasePath}
        />
      );
    }

    if (sectionId === "billing") {
      return (
        <OrgBillingSection
          orgId={orgId}
          currencySymbol={activeOrg.currency_symbol}
          enablePlatformInvoices
          organizationName={activeOrg.name}
        />
      );
    }

    if (sectionId === "admins") {
      return <OrgAdminsSection orgId={orgId} />;
    }

    if (isSchemaSectionId(sectionId)) {
      return (
        <OrgSchemaSectionPanel
          sectionId={sectionId}
          form={form}
          objectFormSchema={objectFormSchema}
          fieldConfig={fieldConfig}
          recordContext={orgRecordCtx}
          showPropagationNote={PROPAGATION_NOTE_SECTIONS.has(sectionId)}
          childrenBefore={
            sectionId === "profile" ? (
              <div className="mb-6 space-y-4">
                <OrganizationLogoSection
                  organization={activeOrg}
                  onUploadFinished={refetchOwnTenantIfNeeded}
                />
                <div>
                  <Button
                    type="button"
                    onClick={() => setIsDefaultCoverImageUploadOpen(true)}
                  >
                    Change default cover image
                  </Button>
                  <ImageUploader
                    isOpen={isDefaultCoverImageUploadOpen}
                    setIsOpen={setIsDefaultCoverImageUploadOpen}
                    entity="organizations"
                    entityId={activeOrg.id}
                    uploadKey="default_cover_image"
                    cropPreset={ImageCropPreset.CoverBanner}
                    dialogTitle="Default cover image"
                    onUploadFinished={() => {
                      refetchOwnTenantIfNeeded();
                      void orgQuery.refetch();
                      toast.add({ description: "Cover image uploaded." });
                    }}
                  />
                </div>
              </div>
            ) : undefined
          }
          childrenAfter={
            <>
              {sectionId === "id-cards" && user ? (
                <IdCardBrandingSection
                  organization={orgRecord}
                  form={form}
                  qrDataUrl={qrDataUrl}
                  logoCleared={idCardLogoCleared}
                  onLogoClearedChange={setIdCardLogoCleared}
                  onLogoUploadFinished={() => {
                    refetchOwnTenantIfNeeded();
                    void orgQuery.refetch();
                  }}
                />
              ) : null}
              {sectionId === "telegram" ? (
                <TelegramWebhookActions
                  isTelegramOn={isTelegramOn}
                  telegramBotUsername={form.watch("telegram_bot_username")}
                />
              ) : null}
              {sectionId === "video" ? (
                <div className="mt-6 space-y-4">
                  <ZoomAccountsSection
                    videoPlatform={
                      activeOrg.video_conferencing_platform ?? undefined
                    }
                  />
                  {user && !isStudent(user) ? (
                    <>
                      <ServiceMicrosoftOAuthCard
                        organization={activeOrg}
                        crossTenant={mode === "platform"}
                      />
                      <PersonalMicrosoftOAuthCard organization={activeOrg} />
                      <PersonalZoomOAuthCard organization={activeOrg} />
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          }
        />
      );
    }

    return null;
  };

  return (
    <>
      <PageContainer
        width="default"
        className="flex w-full flex-col items-stretch gap-8"
      >
        <div className="sj-root w-full">
          <OrgRecordHeader org={orgRecord} />
          {orgRecordCtx ? (
            <OrgMobileSections
              ctx={orgRecordCtx}
              section={activeSection}
              onSelect={handleSectionSelect}
            />
          ) : null}
        </div>

        <div
          className={cn(
            pageContentInsetClassName(),
            "sj-root flex flex-col gap-16 pb-32 pt-2",
          )}
        >
          {visibleSections.map((sectionDef) => (
            <OrgSectionAnchor key={sectionDef.id} sectionId={sectionDef.id}>
              {renderSection(sectionDef.id)}
            </OrgSectionAnchor>
          ))}
        </div>
      </PageContainer>

      <OrgSharedSettingsSaveBar
        dirtySectionCount={dirtySchemaSectionCount}
        isSaving={isSaving}
        onSave={() =>
          saveAllDirtySections({
            idCardLogoCleared,
          })
        }
        onDiscard={() => {
          discardSharedFormChanges();
          setIdCardLogoCleared(false);
        }}
      />
    </>
  );
}

export function OrgRecordShell({
  mode,
  orgId,
  railMountedExternally = false,
  recordBasePath,
}: {
  mode: OrgRecordMode;
  orgId?: string;
  railMountedExternally?: boolean;
  recordBasePath?: string;
}) {
  if (railMountedExternally) {
    return (
      <OrgRecordShellInner
        mode={mode}
        orgId={orgId}
        railMountedExternally={railMountedExternally}
        recordBasePath={recordBasePath}
      />
    );
  }

  return (
    <OrgRecordShellWithProvider
      mode={mode}
      orgId={orgId}
      railMountedExternally={railMountedExternally}
      recordBasePath={recordBasePath}
    />
  );
}

function OrgRecordShellWithProvider({
  mode,
  orgId,
  railMountedExternally,
  recordBasePath,
}: {
  mode: OrgRecordMode;
  orgId?: string;
  railMountedExternally?: boolean;
  recordBasePath?: string;
}) {
  const { tenant } = useTenant();
  const { user } = useUser();
  const orgRecordCtx = useMemo(
    () =>
      user
        ? {
            mode,
            viewer: user,
            tenant,
          }
        : null,
    [mode, user, tenant],
  );
  const { section } = useOrgSection(orgRecordCtx);

  return (
    <OrgRecordNavigationProvider initialSection={section}>
      <OrgRecordShellInner
        mode={mode}
        orgId={orgId}
        railMountedExternally={railMountedExternally}
        recordBasePath={recordBasePath}
      />
    </OrgRecordNavigationProvider>
  );
}
