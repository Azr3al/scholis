// src/components/primitives/tabs.tsx
"use client";

import { type ComponentProps } from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

function List({ className, ...props }: ComponentProps<typeof BaseTabs.List>) {
  return <BaseTabs.List className={cn("relative z-0 flex gap-1", className)} {...props} />;
}

function Tab({ className, ...props }: ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "relative z-10 flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium",
        "text-text-muted outline-none select-none transition-colors hover:text-text-primary",
        "data-[active]:text-text-primary",
        "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}

function Indicator({ className, ...props }: ComponentProps<typeof BaseTabs.Indicator>) {
  return (
    <BaseTabs.Indicator
      className={cn(
        "absolute top-0 left-0 -z-10 h-full w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]",
        "rounded-md bg-[var(--tab-highlight)] [mix-blend-mode:var(--tab-highlight-blend-mode)]",
        "transition-[translate,width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        className,
      )}
      {...props}
    />
  );
}

function Panel({ className, ...props }: ComponentProps<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      className={cn(
        "py-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}

export const Tabs = {
  Root: BaseTabs.Root,
  List,
  Tab,
  Indicator,
  Panel,
};
