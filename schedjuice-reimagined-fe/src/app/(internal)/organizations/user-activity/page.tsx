"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import {
  canAccessUserActivity,
  canViewMobileDevices,
} from "@/helpers/authorization";
import { crossfade } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { GraphUp, Phone } from "iconoir-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMemo } from "react";

const baseTiles = [
  {
    title: "Login activity",
    description:
      "Sign-in trends from your school's records and a list of accounts that have not signed in recently.",
    href: "/organizations/user-activity/login-activity",
    icon: GraphUp,
    visible: () => true,
  },
  {
    title: "Mobile devices",
    description:
      "Mobile app sign-ins — view devices, last activity, and sign people out remotely.",
    href: "/organizations/user-activity/devices",
    icon: Phone,
    visible: canViewMobileDevices,
  },
] as const;

export default function UserActivityHubPage() {
  const { user, isLoading } = useUser();

  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">User activity</h1>
        ),
      }),
      [],
    ),
  );
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && !canAccessUserActivity(user)) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (!user || !canAccessUserActivity(user)) {
    return null;
  }

  const tiles = baseTiles.filter((tile) => tile.visible(user));

  return (
    <PageContainer width="wide" className="space-y-6">
      <motion.div
        variants={crossfade}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        <p className="max-w-2xl text-sm text-text-secondary">
          Reports about how people use this site. More tools may be added here
          over time.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={cn(
                  "group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                )}
              >
                <div className="h-full min-h-[140px] space-y-3 border-b border-border pb-4 transition-colors hover:bg-surface-hover">
                  <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface-hover">
                    <Icon className="size-5 text-text-primary" aria-hidden />
                  </div>
                  <h2 className="text-lg font-medium leading-tight text-text-primary">
                    {tool.title}
                  </h2>
                  <p className="line-clamp-3 text-sm text-text-secondary">
                    {tool.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </motion.div>
    </PageContainer>
  );
}
