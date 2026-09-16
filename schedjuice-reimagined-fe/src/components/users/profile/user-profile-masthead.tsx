"use client";
import { Menu, buttonVariants, useToast } from "@/components/primitives";

// Superseded by RecordProfileHeader — safe to delete once no imports remain.
import CoverImage from "@/components/images/cover-image";
import ProfileImage from "@/components/images/profile-image";
import ImageUploader from "@/components/images/image-uploader";
import { ImageCropPreset } from "@/components/images/image-crop-presets";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";
import { maskEmailLocalPart } from "@/helpers/mask-email-local";
import { BirthdayCake as Cake, NavArrowDown as ChevronDown, CardWallet as IdCard, EditPencil as Pencil } from "iconoir-react";
import Link from "next/link";

type UserProfileMastheadProps = {
  user: accountType;
  userId: number;
  tenant: organizationType | null;
  isBirthday: boolean;
  canEditProfileMedia: boolean;
  canEditAccount: boolean;
  editHref: string;
  idCardHref?: string;
  profileUploaderOpen: boolean;
  onProfileUploaderOpenChange: (open: boolean) => void;
  coverUploaderOpen: boolean;
  onCoverUploaderOpenChange: (open: boolean) => void;
  idPhotoUploaderOpen: boolean;
  onIdPhotoUploaderOpenChange: (open: boolean) => void;
  onIdPhotoUploaded: () => void;
};

function resolveCoverSrc(
  user: accountType,
  tenant: organizationType | null
): string {
  if (user.cover_image) return user.cover_image;
  const d = tenant?.default_cover_image;
  if (typeof d === "string" && d.length > 0) return d;
  return "/images/default-cover.jpg";
}

function resolveProfileSrc(user: accountType): string {
  return user.profile_image || "/images/default.jpg";
}

export function UserProfileMasthead({
  user,
  userId,
  tenant,
  isBirthday,
  canEditProfileMedia,
  canEditAccount,
  editHref,
  idCardHref,
  profileUploaderOpen,
  onProfileUploaderOpenChange,
  coverUploaderOpen,
  onCoverUploaderOpenChange,
  idPhotoUploaderOpen,
  onIdPhotoUploaderOpenChange,
  onIdPhotoUploaded,
}: UserProfileMastheadProps) {
  const toast = useToast();
  const coverSrc = resolveCoverSrc(user, tenant);

  return (
    <div className="flex flex-col gap-3">
      <ImageUploader
        isOpen={idPhotoUploaderOpen}
        setIsOpen={onIdPhotoUploaderOpenChange}
        entityId={userId}
        entity="users"
        uploadKey="id_photo"
        cropPreset={ImageCropPreset.IdPhoto}
        cropShape="rect"
        dialogTitle="ID photo"
        onUploadFinished={() => {
          onIdPhotoUploaded();
          toast.add({
            title: "ID photo updated",
            description: "Your ID card photo has been updated.",
          });
        }}
      />
      {isBirthday && (
        <div className="rounded-lg border border-border bg-surface text-text-primary border-border/60 bg-muted/40">
          <div className="p-6 pt-0 flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Cake className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Birthday
                </p>
                <p className="text-lg font-semibold leading-tight tracking-tight text-text-primary">
                  Happy birthday, {user.name}
                </p>
                <p className="text-sm text-text-muted">
                  Wishing you a great day from everyone here.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm">
        <CoverImage
          src={coverSrc}
          userId={userId}
          canEditCover={canEditProfileMedia}
          coverUploaderOpen={coverUploaderOpen}
          onCoverUploaderOpenChange={onCoverUploaderOpenChange}
        />

        {/* Seam = top of this block; avatar centered on seam (half over cover) via absolute + -translate-y-1/2 */}
        <div className="relative px-4 pb-5 pt-16 sm:px-6 sm:pb-6 sm:pt-5">
          <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 sm:left-8 sm:translate-x-0">
            <div className="pointer-events-auto">
              <ProfileImage
                src={resolveProfileSrc(user)}
                userId={userId}
                width={112}
                height={112}
                canEditProfile={canEditProfileMedia}
                imageUploaderOpen={profileUploaderOpen}
                onImageUploaderOpenChange={onProfileUploaderOpenChange}
                className="ring-4 ring-card shadow-md"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:min-h-[4.5rem] sm:pl-[8.75rem]">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
                <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary">
                    {user.name}
                  </h1>
                  {user.resigned_at ? (
                    <span className="inline-flex items-center rounded-md border border-transparent bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger shrink-0 font-medium">
                      Resigned
                    </span>
                  ) : user.is_active === false ? (
                    <span className="inline-flex items-center rounded-md border border-transparent bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger shrink-0 font-medium">
                      Disabled
                    </span>
                  ) : null}
                </div>
                <p
                  className="max-w-full truncate text-sm text-text-muted"
                  title={user.email || undefined}
                >
                  {maskEmailLocalPart(user.email)}
                </p>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  {(user.roles ?? []).map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary border border-border/60 font-normal"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {(canEditAccount || idCardHref) && (
                <div className="flex w-full shrink-0 flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-end sm:pt-0.5">
                  {idCardHref ? (
                    <Link
                      href={idCardHref}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "md" }),
                        "gap-2 active:scale-[0.98]",
                      )}
                    >
                      <IdCard className="size-4 shrink-0" aria-hidden />
                      ID Card
                    </Link>
                  ) : null}
                  {canEditAccount ? (
                    <Link
                      href={editHref}
                      className={cn(
                        buttonVariants({ variant: "primary", size: "md" }),
                        "gap-2 px-4 font-semibold shadow-sm active:scale-[0.98]",
                      )}
                    >
                      <Pencil className="size-4 shrink-0" aria-hidden />
                      Edit profile
                    </Link>
                  ) : null}
                  {canEditAccount && canEditProfileMedia ? (
                    <Menu.Root>
                      <Menu.Trigger
                        className={cn(
                          buttonVariants({ variant: "secondary", size: "md" }),
                          "min-h-10 gap-1 active:scale-[0.98]",
                        )}
                      >
                        Photos
                        <ChevronDown
                          className="size-4 opacity-70"
                          aria-hidden
                        />
                      </Menu.Trigger>
                      <Menu.Portal>
                        <Menu.Positioner align="end">
                          <Menu.Popup className="w-48">
                        <Menu.Item
                          onClick={() => onProfileUploaderOpenChange(true)}
                        >
                          Update profile photo
                        </Menu.Item>
                        <Menu.Item
                          onClick={() => onCoverUploaderOpenChange(true)}
                        >
                          Update cover image
                        </Menu.Item>
                        <Menu.Item
                          onClick={() => onIdPhotoUploaderOpenChange(true)}
                        >
                          Update ID photo
                        </Menu.Item>
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.Root>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
