"use client";
import { useToast } from "@/components/primitives";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import Image from "next/image";
import ImageUploader from "./image-uploader";
import { ImageCropPreset } from "./image-crop-presets";
import { useState } from "react";
import { EditPencil as EditIcon } from "iconoir-react";

interface IProfileImageProps {
  src?: string;
  width?: number;
  height?: number;
  userId: number;
  className?: string;
  /** When true, allow opening the uploader (e.g. staff editing another user). Defaults to viewer is this user. */
  canEditProfile?: boolean;
  imageUploaderOpen?: boolean;
  onImageUploaderOpenChange?: (open: boolean) => void;
}

const ProfileImage: React.FC<IProfileImageProps> = ({
  src = "/images/default.jpg",
  width = 130,
  height = 130,
  userId,
  className,
  canEditProfile,
  imageUploaderOpen: controlledOpen,
  onImageUploaderOpenChange,
}) => {
  const { user } = useUser();
  const toast = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onImageUploaderOpenChange;
  const isImageUploaderOpen = isControlled ? controlledOpen : internalOpen;
  const setIsImageUploaderOpen = isControlled
    ? onImageUploaderOpenChange
    : setInternalOpen;
  const allowEdit = canEditProfile ?? user?.id === userId;

  return (
    <>
      <ImageUploader
        isOpen={isImageUploaderOpen}
        setIsOpen={setIsImageUploaderOpen}
        entityId={userId}
        entity="users"
        uploadKey="profile_image"
        cropPreset={ImageCropPreset.Square}
        cropShape="round"
        dialogTitle="Profile photo"
        onUploadFinished={() => {
          toast.add({
            title: "Profile image updated",
            description: "Your profile image has been updated successfully",
          });
        }}
      />
      <div
        style={{
          width: width,
          height: height,
        }}
        className={cn(
          "relative group cursor-pointer rounded-full border-2 border-background",
          className
        )}
        onClick={() => {
          if (allowEdit) {
            setIsImageUploaderOpen(true);
          }
        }}
      >
        <Image
          unoptimized
          className={cn(
            "rounded-full transition-all duration-300 ease-in-out aspect-square",
            {
              "hover:rounded-none": !allowEdit,
              "cursor-pointer": allowEdit,
            }
          )}
          src={src}
          width={width}
          height={height}
          alt="Profile image"
          style={{
            objectFit: "cover",
          }}
        />
        {allowEdit && (
          <div className="absolute inset-0 bg-black bg-opacity-40 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300">
            <EditIcon className="text-white w-6 h-6" />
          </div>
        )}
      </div>
    </>
  );
};

export default ProfileImage;
