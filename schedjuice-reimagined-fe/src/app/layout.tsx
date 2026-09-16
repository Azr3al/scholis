import "./globals.css";
import { Inter, Noto_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import UploadQueueDockMount from "@/components/attachment-uploader/upload-queue-dock-mount";
import { cn } from "@/lib/utils";
import { overlayZClass } from "@/lib/ui/overlay-layers";
import { AppProviders } from "@/components/providers";
import MainFooter from "@/components/footer/main-footer";
import { ToastProvider, TooltipProvider } from "@/components/primitives";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/react";

import { getTenantOnServer } from "@/helpers/tenant";
import ColorProvider from "@/components/colors/color-provider";
import Link from "next/link";
import { axiosClient } from "@/lib/api";
import { OpenInAppPromptMount } from "@/components/linking/open-in-app-prompt-mount";
import { cookies } from "next/headers";
import { THEME_INLINE_SCRIPT } from "@/lib/theme-inline-script";
import { normalizeTheme } from "@/lib/sj/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-noto",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const theme = normalizeTheme(cookieStore.get("theme")?.value);
  // const bg = getTheme();
  return (
    // <MsalProvider instance={pca}>
    // </MsalProvider>
    <html
      lang="en"
      data-theme={theme}
      suppressHydrationWarning
      // className="mx-auto max-w-(--breakpoint-lg)"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INLINE_SCRIPT }} />
      </head>
      <body className={cn(GeistSans.variable, "font-sans")}>
        {/* <ColorProvider></ColorProvider> */}
        <AppProviders>
          <ToastProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <TooltipProvider delay={500}>
                <div className="relative">
                  {children}
                  <UploadQueueDockMount />
                  <OpenInAppPromptMount />
                </div>
              </TooltipProvider>
            </ThemeProvider>
          </ToastProvider>
        </AppProviders>
        {/* <MainFooter></MainFooter> */}
        <SpeedInsights></SpeedInsights>
        <Analytics></Analytics>
        {/* Glide Data Grid overlay editor — fixed origin so getBoundingClientRect coords align */}
        <div id="portal" className={cn("fixed top-0 left-0 h-0 w-0 overflow-visible", overlayZClass("dropdown"))} />
      </body>
    </html>
  );
}

export const generateMetadata = async () => {
  const metadata = {
    title: "Schedjuice",
    description: "",
  };
  try {
    const { tenant } = await getTenantOnServer();
    if (tenant?.name) {
      metadata.title = tenant.name;
    }
    if (tenant?.tagline) {
      metadata.description = tenant.tagline;
    }
  } catch {
    // Keep defaults when tenant cannot be resolved (offline preview, etc.)
  }
  return metadata;
};
