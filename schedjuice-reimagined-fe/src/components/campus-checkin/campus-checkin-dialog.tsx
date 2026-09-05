"use client";
import { Button, Dialog, Select, useToast } from "@/components/primitives";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import Image from "next/image";
import { useMutation } from "@tanstack/react-query";
import { Camera, MapPin, Upload } from "iconoir-react";
import { axiosClient } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { getCurrentPosition } from "@/lib/geo/get-current-position";
import { CampusCheckinStatus } from "@/types/campus-checkin";
import { CampusCheckinVerificationMode } from "@/types/organization";
import { LiveCameraCapture } from "@/components/camera/live-camera-capture";
import { isLiveCameraSupported } from "@/components/camera/live-camera-capture-utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface CampusCheckinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "checkin" | "checkout";
  status?: CampusCheckinStatus;
  children: React.ReactNode;
}

function extractErrorCode(error: unknown): string {
  const data = (error as any)?.response?.data;
  const rawCode =
    data?.code ?? data?.error_code ?? data?.error ?? data?.message ?? "";
  return typeof rawCode === "string" ? rawCode : "";
}

function isImageRequiredError(error: unknown): boolean {
  return extractErrorCode(error).toLowerCase().includes("image_required");
}

export const CampusCheckinDialog = ({
  open,
  onOpenChange,
  mode,
  status,
  children,
}: CampusCheckinDialogProps) => {
  const toast = useToast();
  const [selectedCampusId, setSelectedCampusId] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [requireSelfieFallback, setRequireSelfieFallback] = useState(false);
  const [cameraFallback, setCameraFallback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const cameraSupported = isLiveCameraSupported();

  const campuses = useMemo(
    () =>
      (status?.campuses ?? []).filter(
        (campus) => !(campus as { is_online?: boolean }).is_online,
      ),
    [status?.campuses],
  );

  const verificationMode =
    status?.verification_mode ??
    CampusCheckinVerificationMode.geo_with_selfie_fallback;
  const shouldShowSelfieStep =
    verificationMode === CampusCheckinVerificationMode.selfie_only ||
    (verificationMode ===
      CampusCheckinVerificationMode.geo_with_selfie_fallback &&
      requireSelfieFallback);
  const imageFieldName = mode === "checkin" ? "checkin_image" : "checkout_image";
  const useLiveCamera =
    shouldShowSelfieStep && isMobile && cameraSupported && !cameraFallback;

  const revokeImagePreview = () => {
    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
  };

  const resetDialogState = () => {
    revokeImagePreview();
    setSelectedImage(null);
    setImagePreview(null);
    setRequireSelfieFallback(false);
    setCameraFallback(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!open) {
      resetDialogState();
      return;
    }
    if (mode === "checkin" && !selectedCampusId && campuses.length > 0) {
      setSelectedCampusId(String(campuses[0].id));
    }
  }, [open, mode, campuses, selectedCampusId]);

  const submitMutation = useMutation({
    mutationFn: (formData: FormData) => {
      if (mode === "checkin") {
        return axiosClient.post("campus-checkin", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      return axiosClient.put("campus-checkin", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      toast.add({
        title:
          mode === "checkin" ? "Successfully checked in" : "Successfully checked out",
      });
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["campus-checkin-status"] });
    },
    onError: (error: any) => {
      if (
        verificationMode ===
          CampusCheckinVerificationMode.geo_with_selfie_fallback &&
        !requireSelfieFallback &&
        isImageRequiredError(error)
      ) {
        setRequireSelfieFallback(true);
        toast.add({
          title: "Selfie required",
          description: "Location could not verify this request. Please upload a selfie.",
        });
        return;
      }

      toast.add({
        title: mode === "checkin" ? "Failed to check in" : "Failed to check out",
        description: error?.response?.data?.message || "Please try again later.",
        type: "error",
      });
    },
  });

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    revokeImagePreview();
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview((e.target?.result as string) ?? null);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (file: File) => {
    revokeImagePreview();
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const submitFormData = (formData: FormData) => {
    submitMutation.mutate(formData);
  };

  const handleGeoFailure = () => {
    if (
      verificationMode === CampusCheckinVerificationMode.geo_with_selfie_fallback
    ) {
      setRequireSelfieFallback(true);
      toast.add({
        title: "Location unavailable",
        description: "Please upload a selfie instead.",
      });
      return;
    }

    toast.add({
      title: "Location required",
      description: "Please allow location access and try again.",
      type: "error",
    });
  };

  const handleSubmit = async () => {
    if (mode === "checkin" && !selectedCampusId) {
      toast.add({
        title: "Please select a campus",
        type: "error",
      });
      return;
    }

    const formData = new FormData();
    if (mode === "checkin") {
      formData.append("campus_id", selectedCampusId);
    }

    if (shouldShowSelfieStep) {
      if (!selectedImage) {
        toast.add({
          title: useLiveCamera ? "Please take a photo" : "Please select an image",
          type: "error",
        });
        return;
      }

      formData.append(imageFieldName, selectedImage);
      submitFormData(formData);
      return;
    }

    if (
      verificationMode === CampusCheckinVerificationMode.geo_only ||
      verificationMode === CampusCheckinVerificationMode.geo_with_selfie_fallback
    ) {
      try {
        const position = await getCurrentPosition();
        formData.append("latitude", String(position.latitude));
        formData.append("longitude", String(position.longitude));
        submitFormData(formData);
      } catch {
        handleGeoFailure();
      }
      return;
    }

    submitFormData(formData);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetDialogState();
    }
    onOpenChange(nextOpen);
  };

  const hasCampusOptions = campuses.length > 0;
  const disableSubmit =
    submitMutation.isPending ||
    (mode === "checkin" && !selectedCampusId) ||
    (shouldShowSelfieStep && !selectedImage);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger render={children as ReactElement} />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="flex max-h-[min(90dvh,720px)] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="shrink-0 space-y-1.5 px-6 pb-4 pt-6 pr-12">
          <Dialog.Title>{mode === "checkin" ? "Campus Check In" : "Campus Check Out"}</Dialog.Title>
          <Dialog.Description>
            {mode === "checkin"
              ? "Confirm your attendance for today."
              : "Confirm your check-out for today."}
          </Dialog.Description>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-4">
          {mode === "checkin" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Campus</p>
              <Select
                value={selectedCampusId}
                onValueChange={setSelectedCampusId}
                disabled={!hasCampusOptions || submitMutation.isPending}
                className="w-full"
                placeholder={
                  hasCampusOptions ? "Select a campus" : "No campus available"
                }
                items={campuses.map((campus) => ({
                  value: String(campus.id),
                  label: campus.name,
                }))}
              />
              {!hasCampusOptions && (
                <p className="text-xs text-muted-foreground">
                  No campus is available for check-in yet.
                </p>
              )}
            </div>
          )}

          {shouldShowSelfieStep ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {mode === "checkin" ? "Check-in Photo" : "Check-out Photo"}
              </p>

              {useLiveCamera ? (
                <LiveCameraCapture
                  onCapture={handleCameraCapture}
                  onError={() => setCameraFallback(true)}
                  disabled={submitMutation.isPending}
                />
              ) : (
                <>
                  {cameraFallback && isMobile && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Camera access is required for check-in. You can upload a photo
                      instead, but it may be reviewed.
                    </p>
                  )}
                  <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center">
                    {imagePreview ? (
                      <div className="space-y-2">
                        <Image
                          src={imagePreview}
                          alt="Check-in preview"
                          width={128}
                          height={128}
                          className="mx-auto h-28 w-28 rounded-lg object-cover sm:h-32 sm:w-32"
                        />
                        <p className="text-sm text-muted-foreground">Photo selected</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Camera className="mx-auto h-8 w-8 text-gray-400" />
                        <p className="text-sm text-muted-foreground">
                          No photo selected. Please select a photo.
                        </p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    variant="secondary" onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                    disabled={submitMutation.isPending}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {selectedImage ? "Change Photo" : "Select Photo"}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                <MapPin className="h-4 w-4" />
                Location verification
              </div>
              {verificationMode === CampusCheckinVerificationMode.geo_only
                ? "Your current location will be used to verify this action."
                : "We will try location first. If unavailable, selfie upload will be required."}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-background px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-stretch">
          <Button
            onClick={() => void handleSubmit()}
            className="w-full"
            isLoading={submitMutation.isPending}
            disabled={disableSubmit || (mode === "checkin" && !hasCampusOptions)}
          >
            {mode === "checkin" ? "Check In" : "Check Out"}
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
