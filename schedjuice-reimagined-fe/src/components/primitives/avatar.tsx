// src/components/primitives/avatar.tsx
"use client";

import { type ComponentProps, useMemo, useRef } from "react";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { normalizeProfileImagePath } from "@/lib/user/profile-image-url";
import { cn } from "@/lib/utils";

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words.map((w) => Array.from(w)[0] ?? "").join("");
}

export function Avatar({
  src,
  name,
  className,
  loading = "lazy",
  ...props
}: ComponentProps<typeof BaseAvatar.Root> & {
  src?: string | null;
  name: string;
  loading?: "eager" | "lazy";
}) {
  const loadedPathRef = useRef<string | null>(null);
  const loadedSrcRef = useRef<string | null>(null);

  const displaySrc = useMemo(() => {
    if (!src) return null;
    const nextPath = normalizeProfileImagePath(src);
    if (
      loadedPathRef.current &&
      nextPath &&
      loadedPathRef.current === nextPath &&
      loadedSrcRef.current
    ) {
      return loadedSrcRef.current;
    }
    return src;
  }, [src]);

  return (
    <BaseAvatar.Root
      className={cn(
        "inline-flex size-10 items-center justify-center overflow-hidden rounded-full",
        "bg-brand/15 align-middle text-sm font-medium text-accent select-none",
        className,
      )}
      {...props}
    >
      {displaySrc ? (
        <BaseAvatar.Image
          src={displaySrc}
          className="size-full object-cover"
          loading={loading}
          onLoad={() => {
            loadedPathRef.current = normalizeProfileImagePath(src);
            loadedSrcRef.current = src ?? null;
          }}
        />
      ) : null}
      <BaseAvatar.Fallback delay={src ? 400 : 0} className="flex size-full items-center justify-center">
        {initialsFrom(name)}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
