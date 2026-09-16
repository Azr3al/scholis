import { Avatar } from "@/components/primitives";
import React from "react";
import { cn } from "@/lib/utils";

export type avatarProfileTypes = {
  className?: string;
  currentUser: any;
};

const AvatarProfile = ({ currentUser, className }: avatarProfileTypes) => {
  return (
    <Avatar
      className={cn("", className)}
      src={currentUser?.profile_image}
      name={currentUser?.name ?? ""}
    />
  );
};

export default AvatarProfile;
