"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type UploadFieldErrorProps = {
  message?: string | null;
};

export function UploadFieldError({ message }: UploadFieldErrorProps) {
  const trimmed = message?.trim() ?? "";
  const open = trimmed.length > 0;
  const [displayed, setDisplayed] = useState(trimmed);

  useEffect(() => {
    if (open) setDisplayed(trimmed);
  }, [open, trimmed]);

  return (
    <div
      className={cn(
        "grid w-full self-stretch transition-[grid-template-rows] ease-out motion-reduce:transition-none motion-reduce:duration-0",
        open
          ? "grid-rows-[1fr] duration-180"
          : "grid-rows-[0fr] duration-140",
      )}
      onTransitionEnd={(e) => {
        if (e.propertyName !== "grid-template-rows") return;
        if (!open) setDisplayed("");
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {displayed ? (
          <p
            className={cn(
              "text-sm text-danger transition-opacity ease-out motion-reduce:transition-none",
              open ? "opacity-100 duration-180" : "opacity-0 duration-140",
            )}
            role="alert"
          >
            {displayed}
          </p>
        ) : null}
      </div>
    </div>
  );
}
