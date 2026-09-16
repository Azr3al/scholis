"use client";
import { Button, Sheet, Skeleton, Slider, buttonVariants, useToast } from "@/components/primitives";

import { fetchIdPhotoUrls } from "@/app/client-api/id-photo-urls";
import { updateEntity } from "@/app/client-api/utils";
import { ResolveIdCardFace } from "@/components/id-card/resolve-id-card-face";
import { getCroppedImageBlob } from "@/components/images/canvas-crop";
import {
  aspectRatioForPreset,
  ImageCropPreset,
} from "@/components/images/image-crop-presets";
import { canEditUser } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { getActiveIdCardTemplate } from "@/lib/id-card/active-template";
import { buildIdCardFromDataSheetRow } from "@/lib/id-card/build-id-card";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import { buildVerifyUrl } from "@/lib/id-card/verify-url";
import { cn } from "@/lib/utils";
import type { IdPhotoSubjectRow } from "@/types/data-sheets";
import type { accountType } from "@/types/user";
import { IdCardTemplateAudience } from "@/types/id-card-template";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, CloudUpload as UploadCloud, Xmark as X } from "iconoir-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useDropzone } from "react-dropzone";

type PanelMode = "view" | "crop";

function outputMimeForFile(file: File): string {
  if (file.type === "image/png") return "image/png";
  if (file.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function IdPhotoPanel({
  row,
  user,
  onClose,
  subjectLabel = "person",
  audience,
  onIdPhotoCacheInvalidate,
}: {
  row: IdPhotoSubjectRow & { roles?: string[] };
  user: accountType;
  onClose: () => void;
  /** e.g. "student" or "staff member" for copy in the panel */
  subjectLabel?: string;
  audience: "student" | "staff";
  onIdPhotoCacheInvalidate?: (userId: number) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const imageSrcRef = useRef<string | null>(null);

  const [mode, setMode] = useState<PanelMode>("view");
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">(
    row.has_id_photo ? "loading" : "loaded",
  );
  const [file, setFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);

  const canEdit = canEditUser(user, row.id);

  const vm = useMemo(() => {
    if (!tenant) return null;
    return buildIdCardFromDataSheetRow(
      row,
      tenant,
      audience,
      fullUrl,
    );
  }, [row, tenant, audience, fullUrl]);

  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    if (!vm || (!vm.verifyCode && !vm.verifyToken)) {
      setQrDataUrl("");
      return;
    }
    const url = buildVerifyUrl(window.location.origin, vm);
    let active = true;
    generateQrDataUrl(url).then((next) => {
      if (active) setQrDataUrl(next);
    });
    return () => {
      active = false;
    };
  }, [vm?.verifyCode, vm?.verifyToken]);

  const activeTemplate = getActiveIdCardTemplate(
    tenant,
    audience === "student"
      ? IdCardTemplateAudience.student
      : IdCardTemplateAudience.staff,
  );

  const clearBlobUrl = useCallback(() => {
    if (imageSrcRef.current) {
      URL.revokeObjectURL(imageSrcRef.current);
      imageSrcRef.current = null;
    }
    setImageSrc(null);
  }, []);

  const resetReplaceState = useCallback(() => {
    clearBlobUrl();
    setFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsPreparingCrop(false);
    setMode("view");
  }, [clearBlobUrl]);

  useEffect(() => {
    return () => {
      if (imageSrcRef.current) {
        URL.revokeObjectURL(imageSrcRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!row.has_id_photo) {
      setFullUrl(null);
      setImageStatus("loaded");
      return;
    }
    let cancelled = false;
    setImageStatus("loading");
    void fetchIdPhotoUrls([row.id], "full").then((urls) => {
      if (cancelled) return;
      const url = urls[String(row.id)] ?? null;
      setFullUrl(url);
      setImageStatus(url ? "loading" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [row.id, row.has_id_photo]);

  const bindSelectedFile = useCallback(
    (next: File | null) => {
      clearBlobUrl();
      setFile(next);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      if (next) {
        const url = URL.createObjectURL(next);
        imageSrcRef.current = url;
        setImageSrc(url);
        setMode("crop");
      }
    },
    [clearBlobUrl],
  );

  const uploadMutation = useMutation({
    mutationKey: ["uploadIdPhoto", row.id],
    mutationFn: (uploadFile: File) => {
      const formData = new FormData();
      formData.append("id_photo", uploadFile);
      return updateEntity("users", row.id, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-data-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["staff-data-sheet"] });
      onIdPhotoCacheInvalidate?.(row.id);
      toast.add({ title: "ID photo saved" });
      resetReplaceState();
    },
    onError: () => {
      toast.add({
        type: "error",
        title: "Could not save photo",
        description: "Please try again later if the problem persists.",
      });
    },
  });

  const busy = uploadMutation.isLoading || isPreparingCrop;

  const onDrop = useCallback(
    (accepted: File[]) => {
      const next = accepted[0];
      if (next) bindSelectedFile(next);
    },
    [bindSelectedFile],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    maxFiles: 1,
    disabled: busy || mode === "crop",
    noClick: true,
    noKeyboard: true,
  });

  const handleSaveCrop = async () => {
    if (!file || !imageSrc || !croppedAreaPixels) return;
    setIsPreparingCrop(true);
    try {
      const mimeType = outputMimeForFile(file);
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, {
        mimeType,
        quality: 0.92,
      });
      const ext = extensionForMime(mimeType);
      const baseName = file.name.replace(/\.[^/.]+$/, "").trim() || "id-photo";
      const outFile = new File([blob], `${baseName}.${ext}`, { type: mimeType });
      uploadMutation.mutate(outFile);
    } catch {
      toast.add({
        type: "error",
        title: "Could not prepare image",
        description: "This file may be damaged or unsupported. Try another photo.",
      });
    } finally {
      setIsPreparingCrop(false);
    }
  };

  return (
    <Sheet.Root open onOpenChange={(open) => !open && onClose()}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l-0 p-0 sm:max-w-none md:w-[480px]"
      >
        <div className="absolute left-0 top-0 h-full w-px bg-slate-200" aria-hidden />

        <div className="space-y-1 border-b border-slate-200 px-6 py-5 pr-12 text-left">
          <Sheet.Title className="text-lg font-semibold text-slate-900">
            {row.name ?? "Unknown"}
          </Sheet.Title>
          <Sheet.Description className="font-mono text-xs text-slate-500">
            {displayValue(row.code)}
          </Sheet.Description>
        </div>

        <div
          {...getRootProps()}
          className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5"
        >
          {canEdit && <input {...getInputProps()} />}

          {canEdit && isDragActive && mode === "view" && (
            <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-emerald-500/60 bg-emerald-50/90 text-center backdrop-blur-sm">
              <UploadCloud className="size-10 text-emerald-600" strokeWidth={1.5} />
              <p className="text-sm font-medium text-emerald-700">
                Drop the headshot to upload
              </p>
            </div>
          )}

          {mode === "view" && (
            <div className="space-y-6">
              {vm && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    ID card preview
                  </p>
                  <div className="flex justify-center">
                    <ResolveIdCardFace
                      vm={vm}
                      qrDataUrl={qrDataUrl}
                      template={activeTemplate}
                      width={280}
                      className="drop-shadow-md"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Headshot source
                </p>
                <div className="mx-auto w-full max-w-[320px] rounded-2xl border border-slate-200 bg-slate-50 p-3 ring-1 ring-slate-900/5">
                  <div className="relative aspect-[17/21] w-full max-h-[400px] overflow-hidden rounded-xl bg-slate-100">
                    {row.has_id_photo ? (
                      <>
                        {imageStatus === "loading" && (
                          <Skeleton className="absolute inset-0 rounded-xl" />
                        )}
                        {imageStatus === "error" && (
                          <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center">
                            <p className="text-xs leading-relaxed text-slate-500">
                              Could not load this photo. It may have expired — close
                              and reopen, or upload a new one.
                            </p>
                          </div>
                        )}
                        {fullUrl ? (
                          <Image
                            unoptimized
                            src={fullUrl}
                            alt={
                              row.name ? `${row.name} ID photo` : "ID photo"
                            }
                            fill
                            className={cn(
                              "object-cover transition-opacity duration-500 ease-out",
                              imageStatus === "loaded" ? "opacity-100" : "opacity-0",
                            )}
                            onLoad={() => setImageStatus("loaded")}
                            onError={() => setImageStatus("error")}
                            priority
                          />
                        ) : null}
                      </>
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-3 px-4 text-center">
                        <div className="flex size-14 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                          <Camera
                            className="size-6 text-slate-400"
                            strokeWidth={1.5}
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-slate-700">
                            No ID photo yet
                          </p>
                          <p className="text-xs leading-relaxed text-slate-500">
                            {canEdit
                              ? `Upload a formal headshot for this ${subjectLabel}.`
                              : `No photo has been uploaded for this ${subjectLabel}.`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <dl className="divide-y divide-slate-100">
                <IdentityRow label="Code" value={displayValue(row.code)} />
                <IdentityRow
                  label="NRC/Passport"
                  value={displayValue(row.nrc_passport)}
                />
                <IdentityRow
                  label="Date of birth"
                  value={displayValue(row.date_of_birth)}
                />
                <IdentityRow label="Gender" value={displayValue(row.gender)} />
                <IdentityRow label="Region" value={displayValue(row.region)} />
              </dl>

              {canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2 transition-transform active:scale-[0.98] [&_svg]:shrink-0"
                  disabled={busy}
                  onClick={() => open()}
                >
                  <Camera className="size-4" strokeWidth={1.5} />
                  {row.has_id_photo ? "Replace photo" : "Upload photo"}
                </Button>
              )}
            </div>
          )}

          {mode === "crop" && imageSrc && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">
                  Adjust headshot
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm" className="size-8 text-slate-500 hover:text-slate-900"
                  disabled={busy}
                  onClick={resetReplaceState}
                  aria-label="Cancel upload"
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div
                className="relative mx-auto aspect-[17/21] w-full max-h-[400px] max-w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
              >
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspectRatioForPreset(ImageCropPreset.IdPhoto)}
                  cropShape="rect"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedPixels) =>
                    setCroppedAreaPixels(croppedPixels)
                  }
                />
              </div>

              <div className="space-y-2 px-1">
                <p className="text-xs font-medium text-slate-500">Zoom</p>
                <Slider
                  disabled={busy}
                  min={1}
                  max={3}
                  step={0.02}
                  value={[zoom]}
                  onValueChange={(v) =>
                    setZoom(Array.isArray(v) ? (v[0] ?? 1) : v)
                  }
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={busy}
                  onClick={resetReplaceState}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 transition-transform active:scale-[0.98]"
                  disabled={busy || !croppedAreaPixels}
                  isLoading={busy}
                  onClick={() => void handleSaveCrop()}
                >
                  Save photo
                </Button>
              </div>
            </div>
          )}
        </div>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
