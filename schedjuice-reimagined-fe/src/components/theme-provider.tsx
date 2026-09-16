"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"
import { ThemeSync } from "@/components/shell/theme-sync"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props} disableTransitionOnChange>
      <ThemeSync />
      {children}
    </NextThemesProvider>
  )
}
