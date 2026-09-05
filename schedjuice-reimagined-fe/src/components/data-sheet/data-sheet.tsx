"use client";

import dynamic from "next/dynamic";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { DataEditorRef } from "@glideapps/glide-data-grid";

import type { DataSheetProps } from "./data-sheet-impl";

export type { DataSheetProps } from "./data-sheet-impl";

export const DataSheet = dynamic(
  () =>
    import("./data-sheet-impl").then((mod) => ({
      default: mod.DataSheet,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-60 w-full animate-pulse rounded-md bg-muted/40" />
    ),
  },
) as ForwardRefExoticComponent<
  DataSheetProps & RefAttributes<DataEditorRef>
>;
