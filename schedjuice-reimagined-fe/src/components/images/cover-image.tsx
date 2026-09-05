"use client";
import { useToast } from "@/components/primitives";

import { useUser } from "@/hooks/useUser";
import { useState } from "react";
import ImageUploader from "./image-uploader";
import { ImageCropPreset } from "./image-crop-presets";
import { Camera } from "iconoir-react";
import Image from "next/image";

interface ICoverImageProps {
  src?: string;
  width?: number;
  height?: number;
  userId: number;
  canEditCover?: boolean;
  coverUploaderOpen?: boolean;
  onCoverUploaderOpenChange?: (open: boolean) => void;
}

const CoverImage: React.FC<ICoverImageProps> = ({
  src = "/images/default-cover.jpg",
  userId,
  canEditCover,
  coverUploaderOpen: controlledOpen,
  onCoverUploaderOpenChange,
}) => {
  const { user } = useUser();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled =
    controlledOpen !== undefined && onCoverUploaderOpenChange !== undefined;
  const isImageUploaderOpen = isControlled ? controlledOpen : internalOpen;
  const setIsImageUploaderOpen = isControlled
    ? onCoverUploaderOpenChange
    : setInternalOpen;
  const allowEdit = canEditCover ?? user?.id === userId;
  const toast = useToast();

  return (
    <>
      <ImageUploader
        isOpen={isImageUploaderOpen}
        setIsOpen={setIsImageUploaderOpen}
        entityId={userId}
        entity="users"
        uploadKey="cover_image"
        cropPreset={ImageCropPreset.CoverBanner}
        dialogTitle="Cover image"
        onUploadFinished={() => {
          toast.add({
            title: "Cover Image Updated",
            description: "Your cover image has been updated successfully",
          });
        }}
      />
      {/* Full-bleed cover: parent should use overflow-hidden + rounded top corners */}
      <div className="relative aspect-[2.35/1] w-full max-h-[280px] overflow-hidden bg-muted sm:max-h-[320px]">
        <Image
          unoptimized
          src={src}
          alt="Cover image"
          fill
          priority={false}
          className="object-cover object-center"
          sizes="100vw"
        />
        {allowEdit && (
          <button
            type="button"
            className="absolute bottom-3 end-3 inline-flex size-10 items-center justify-center rounded-full bg-background/95 text-foreground shadow-md ring-1 ring-border/60 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Update cover image"
            onClick={() => setIsImageUploaderOpen(true)}
          >
            <Camera className="size-5" aria-hidden />
          </button>
        )}
      </div>
    </>
  );
};

export default CoverImage;
