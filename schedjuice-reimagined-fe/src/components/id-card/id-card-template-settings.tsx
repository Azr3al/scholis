"use client";

import {
  activateIdCardTemplate,
  createIdCardTemplate,
  deleteIdCardTemplate,
  fetchIdCardTemplates,
  updateIdCardTemplate,
} from "@/app/client-api/id-card-templates";
import { IdCardTemplateFace } from "@/components/id-card/id-card-template-face";
import { ResolveIdCardFace } from "@/components/id-card/resolve-id-card-face";
import {
  Button,
  Input,
  Select,
  Tabs,
  inputClassName,
  useToast,
} from "@/components/primitives";
import { buildIdCardPreview } from "@/lib/id-card/build-id-card";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import { normalizeQrSlots } from "@/lib/id-card/template-geometry";
import { fetchAndPersistPublicTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import type { organizationType } from "@/types/organization";
import {
  DEFAULT_ID_CARD_HEIGHT_IN,
  DEFAULT_ID_CARD_WIDTH_IN,
  IdCardTemplateAudience,
  IdCardTemplateSide,
  templateHasBack,
  type IdCardTemplate,
  type IdCardTemplateSlot,
} from "@/types/id-card-template";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type IdCardTemplateSettingsProps = {
  organization: organizationType;
};

export function IdCardTemplateSettings({ organization }: IdCardTemplateSettingsProps) {
  const { user } = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const editorReturnHref = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [audience, setAudience] = useState<IdCardTemplateAudience>(
    IdCardTemplateAudience.student,
  );
  const [side, setSide] = useState<IdCardTemplateSide>(IdCardTemplateSide.front);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [widthIn, setWidthIn] = useState(String(DEFAULT_ID_CARD_WIDTH_IN));
  const [heightIn, setHeightIn] = useState(String(DEFAULT_ID_CARD_HEIGHT_IN));
  const [academicYear, setAcademicYear] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [slots, setSlots] = useState<IdCardTemplateSlot[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [pendingBackground, setPendingBackground] = useState<File | null>(null);
  const [backSlots, setBackSlots] = useState<IdCardTemplateSlot[]>([]);
  const [backBackgroundUrl, setBackBackgroundUrl] = useState<string | null>(null);
  const [pendingBackBackground, setPendingBackBackground] = useState<File | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["id-card-templates", organization.id, audience],
    queryFn: () => fetchIdCardTemplates(organization.id, audience),
  });

  const templates = templatesQuery.data ?? [];
  const selectedTemplate = templates.find((template) => template.id === selectedId) ?? null;

  useEffect(() => {
    generateQrDataUrl("https://example.com/verify/sample").then(setQrDataUrl);
  }, []);

  useEffect(() => {
    if (templates.length === 0) {
      setSelectedId(null);
      return;
    }
    const active = templates.find((template) => template.is_active);
    setSelectedId((current) => {
      if (current != null && templates.some((template) => template.id === current)) {
        return current;
      }
      return active?.id ?? templates[0]?.id ?? null;
    });
  }, [templates]);

  useEffect(() => {
    setPendingBackground(null);
    setPendingBackBackground(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setName("");
      setWidthIn(String(DEFAULT_ID_CARD_WIDTH_IN));
      setHeightIn(String(DEFAULT_ID_CARD_HEIGHT_IN));
      setAcademicYear("");
      setExpiresOn("");
      setSlots([]);
      setBackgroundUrl(null);
      setBackSlots([]);
      setBackBackgroundUrl(null);
      return;
    }
    setName(selectedTemplate.name);
    setWidthIn(String(selectedTemplate.width_in));
    setHeightIn(String(selectedTemplate.height_in));
    setAcademicYear(selectedTemplate.academic_year ?? "");
    setExpiresOn(selectedTemplate.expires_on ?? "");
    setSlots(normalizeQrSlots(selectedTemplate.slots ?? []));
    setBackSlots(normalizeQrSlots(selectedTemplate.back_slots ?? []));
    setBackgroundUrl((current) =>
      pendingBackground ? current : selectedTemplate.background_url,
    );
    setBackBackgroundUrl((current) =>
      pendingBackBackground ? current : selectedTemplate.back_background_url ?? null,
    );
  }, [selectedTemplate, pendingBackground, pendingBackBackground]);

  const previewVm = useMemo(() => {
    if (!user) return null;
    return buildIdCardPreview(
      user,
      organization,
      audience === IdCardTemplateAudience.student ? "student" : "staff",
    );
  }, [audience, organization, user]);

  const previewTemplate = useMemo(() => {
    if (!selectedTemplate) return null;
    const identityFill = { offsetX: 0, offsetY: 0, scale: 1 };
    const existingTransform = selectedTemplate.background_transform;
    return {
      ...selectedTemplate,
      width_in: Number(widthIn) || DEFAULT_ID_CARD_WIDTH_IN,
      height_in: Number(heightIn) || DEFAULT_ID_CARD_HEIGHT_IN,
      academic_year: academicYear.trim() || null,
      expires_on: expiresOn || null,
      slots,
      background_url: backgroundUrl,
      back_slots: backSlots,
      back_background_url: backBackgroundUrl,
      background_transform: {
        front: pendingBackground
          ? identityFill
          : existingTransform?.front ?? identityFill,
        back: pendingBackBackground
          ? identityFill
          : existingTransform?.back ?? identityFill,
      },
    };
  }, [
    academicYear,
    backBackgroundUrl,
    backSlots,
    backgroundUrl,
    expiresOn,
    heightIn,
    pendingBackBackground,
    pendingBackground,
    selectedTemplate,
    slots,
    widthIn,
  ]);

  const sideLabel = side === IdCardTemplateSide.back ? "Back" : "Front";

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["id-card-templates", organization.id],
    });
    await fetchAndPersistPublicTenant("refetch");
    await queryClient.invalidateQueries({ queryKey: ["organizations", "public"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) return null;
      const identityFill = { offsetX: 0, offsetY: 0, scale: 1 };
      const existingTransform = selectedTemplate.background_transform;
      return updateIdCardTemplate(organization.id, selectedTemplate.id, {
        name: name.trim() || selectedTemplate.name,
        width_in: Number(widthIn),
        height_in: Number(heightIn),
        slots: normalizeQrSlots(slots),
        back_slots: normalizeQrSlots(backSlots),
        academic_year: academicYear.trim() || null,
        expires_on: expiresOn || null,
        background: pendingBackground ?? undefined,
        back_background: pendingBackBackground ?? undefined,
        ...(pendingBackground || pendingBackBackground
          ? {
              background_transform: {
                front: pendingBackground
                  ? identityFill
                  : existingTransform?.front ?? identityFill,
                back: pendingBackBackground
                  ? identityFill
                  : existingTransform?.back ?? identityFill,
              },
            }
          : {}),
      });
    },
    onSuccess: async () => {
      toast.add({ description: "Template saved." });
      await invalidate();
    },
    onError: () => {
      toast.add({
        title: "Save failed",
        description: "Check the template fields and try again.",
        type: "error",
      });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (templateId: number) =>
      activateIdCardTemplate(organization.id, templateId),
    onSuccess: async () => {
      toast.add({ description: "Template activated." });
      await invalidate();
    },
    onError: () => {
      toast.add({
        title: "Activation failed",
        type: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId: number) =>
      deleteIdCardTemplate(organization.id, templateId),
    onSuccess: async () => {
      toast.add({ description: "Template deleted." });
      await invalidate();
    },
    onError: () => {
      toast.add({
        title: "Delete failed",
        description: "You cannot delete the only template for this audience.",
        type: "error",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("name", file.name.replace(/\.[^.]+$/, "") || "New template");
      fd.append("audience", audience);
      fd.append("width_in", String(DEFAULT_ID_CARD_WIDTH_IN));
      fd.append("height_in", String(DEFAULT_ID_CARD_HEIGHT_IN));
      fd.append("background", file);
      fd.append("slots", JSON.stringify([]));
      return createIdCardTemplate(organization.id, fd);
    },
    onSuccess: async (template: IdCardTemplate) => {
      toast.add({ description: "Template uploaded." });
      setSelectedId(template.id);
      await invalidate();
    },
    onError: () => {
      toast.add({
        title: "Upload failed",
        type: "error",
      });
    },
  });

  function handleBackgroundReplace(file: File) {
    if (side === IdCardTemplateSide.back) {
      setPendingBackBackground(file);
      setBackBackgroundUrl(URL.createObjectURL(file));
      return;
    }
    setPendingBackground(file);
    setBackgroundUrl(URL.createObjectURL(file));
  }

  return (
    <div className="space-y-8">
      <Tabs.Root
        value={audience}
        onValueChange={(value) => setAudience(value as IdCardTemplateAudience)}
      >
        <Tabs.List className="relative gap-4 border-b border-border pb-0">
          <Tabs.Tab
            value={IdCardTemplateAudience.student}
            className="relative h-10 rounded-none px-0 pb-3 data-[active]:text-text-primary"
          >
            Student
          </Tabs.Tab>
          <Tabs.Tab
            value={IdCardTemplateAudience.staff}
            className="relative h-10 rounded-none px-0 pb-3 data-[active]:text-text-primary"
          >
            Staff
          </Tabs.Tab>
          <Tabs.Indicator className="!bottom-0 !top-auto !z-10 !h-0.5 !rounded-none !bg-brand !mix-blend-normal" />
        </Tabs.List>
      </Tabs.Root>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <label className="text-sm text-muted-foreground">Template</label>
          <Select
            value={selectedId != null ? String(selectedId) : ""}
            onValueChange={(value) => setSelectedId(Number(value))}
            placeholder="No templates yet"
            className="w-full"
            items={templates.map((template) => ({
              value: String(template.id),
              label: template.is_active ? `${template.name} (active)` : template.name,
            }))}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          isLoading={createMutation.isPending}
        >
          Upload template
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void createMutation.mutateAsync(file);
            event.target.value = "";
          }}
        />
        {selectedTemplate ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                router.push(
                  `/templates/id-card/${selectedTemplate.id}?orgId=${organization.id}&backHref=${encodeURIComponent(editorReturnHref)}`,
                )
              }
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={selectedTemplate.is_active || activateMutation.isPending}
              isLoading={activateMutation.isPending}
              onClick={() => void activateMutation.mutateAsync(selectedTemplate.id)}
            >
              Set active
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deleteMutation.isPending || templates.length <= 1}
              isLoading={deleteMutation.isPending}
              onClick={() => void deleteMutation.mutateAsync(selectedTemplate.id)}
            >
              Delete
            </Button>
          </>
        ) : null}
      </div>

      {selectedTemplate ? (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Name</span>
                <Input
                  className={inputClassName}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Width (in)</span>
                <Input
                  className={inputClassName}
                  type="number"
                  step="0.001"
                  min="0.1"
                  value={widthIn}
                  onChange={(event) => setWidthIn(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Height (in)</span>
                <Input
                  className={inputClassName}
                  type="number"
                  step="0.001"
                  min="0.1"
                  value={heightIn}
                  onChange={(event) => setHeightIn(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{sideLabel} background</span>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className={inputClassName}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleBackgroundReplace(file);
                  }}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Academic year</span>
                <Input
                  className={inputClassName}
                  value={academicYear}
                  onChange={(event) => setAcademicYear(event.target.value)}
                  placeholder="2026-2027"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Expires</span>
                <Input
                  className={inputClassName}
                  type="date"
                  value={expiresOn}
                  onChange={(event) => setExpiresOn(event.target.value)}
                />
              </label>
            </div>

            <Tabs.Root
              value={side}
              onValueChange={(value) => setSide(value as IdCardTemplateSide)}
            >
              <Tabs.List className="relative gap-4 border-b border-border pb-0">
                <Tabs.Tab
                  value={IdCardTemplateSide.front}
                  className="relative h-9 rounded-none px-0 pb-2 text-sm data-[active]:text-text-primary"
                >
                  Front
                </Tabs.Tab>
                <Tabs.Tab
                  value={IdCardTemplateSide.back}
                  className="relative h-9 rounded-none px-0 pb-2 text-sm data-[active]:text-text-primary"
                >
                  Back
                </Tabs.Tab>
                <Tabs.Indicator className="!bottom-0 !top-auto !z-10 !h-0.5 !rounded-none !bg-brand !mix-blend-normal" />
              </Tabs.List>
            </Tabs.Root>

            <p className="text-sm text-muted-foreground">
              Layout is edited in the full-screen template editor.
            </p>

            <Button
              type="button"
              isLoading={saveMutation.isPending}
              disabled={saveMutation.isPending}
              onClick={() => void saveMutation.mutateAsync()}
            >
              Save template
            </Button>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-medium">Preview</p>
            {previewVm && previewTemplate ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Front</p>
                  <ResolveIdCardFace
                    vm={previewVm}
                    qrDataUrl={qrDataUrl}
                    template={previewTemplate}
                    width={200}
                    className="drop-shadow-md"
                  />
                </div>
                {templateHasBack(previewTemplate) ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Back</p>
                    <IdCardTemplateFace
                      vm={previewVm}
                      qrDataUrl={qrDataUrl}
                      template={previewTemplate}
                      side={IdCardTemplateSide.back}
                      width={200}
                      className="drop-shadow-md"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Upload a back background or add back slots to preview the reverse side.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Upload a PNG or JPG background to start a {audience} ID card template.
        </p>
      )}
    </div>
  );
}
