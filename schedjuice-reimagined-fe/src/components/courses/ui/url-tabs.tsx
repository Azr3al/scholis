"use client";

import { cn } from "@/lib/utils";
import Link, { LinkProps } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import { useEffect } from "react";

interface Context {
  defaultValue: string;
  hrefFor: (value: string) => LinkProps["href"];
  searchParam: string;
  selected: string;
}
const TabsContext = React.createContext<Context>(null as any);

const TabSuspence = (props: {
  children: React.ReactNode;
  className?: string;
  defaultValue: string;
  searchParam?: string;
  onValueChange?: (value: string) => void;
}) => {
  const {
    children,
    className,
    searchParam = "tab",
    defaultValue,
    onValueChange,
    ...other
  } = props;
  const searchParams = useSearchParams()!;
  const selected = searchParams.get(searchParam) || defaultValue;
  const pathname = usePathname();

  useEffect(() => {
    onValueChange?.(selected);
  }, [selected, onValueChange]);

  const hrefFor: Context["hrefFor"] = React.useCallback(
    (value) => {
      // @ts-ignore
      const params = new URLSearchParams(searchParams);
      if (value === defaultValue) {
        params.delete(searchParam);
      } else {
        params.set(searchParam, value);
      }

      const asString = params.toString();

      return pathname + (asString ? "?" + asString : "");
    },
    [searchParams, pathname, searchParam, defaultValue],
  );

  return (
    <TabsContext.Provider
      value={{ ...other, hrefFor, searchParam, selected, defaultValue }}
    >
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

export function Tabs(props: {
  children: React.ReactNode;
  className?: string;
  defaultValue: string;
  searchParam?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <React.Suspense>
      <TabSuspence {...props} />
    </React.Suspense>
  );
}

const useContext = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(
      "Tabs compound components cannot be rendered outside the Tabs component",
    );
  }

  return context;
};

export function TabsList(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      {...props}
      className={cn(
        "inline-flex h-10 !w-fit items-center justify-start rounded-xl bg-surface-hover text-2xl font-light text-text-muted",
        props.className,
      )}
    />
  );
}

export const TabsTrigger = (props: {
  children: React.ReactNode;
  className?: string;
  value: string;
  variant?: "default" | "underline";
}) => {
  const variant = {
    default:
      "data-[state=active]:h-10 data-[state=active]:rounded-xl data-[state=active]:border-2 data-[state=active]:border-border data-[state=active]:bg-surface data-[state=active]:text-text-primary data-[state=active]:shadow-sm",
    underline:
      "data-[state=active]:-mb-[4px] data-[state=active]:border-b-4 data-[state=active]:border-text-primary data-[state=active]:font-semibold data-[state=active]:text-text-primary",
  };
  const context = useContext();
  return (
    <Link
      {...props}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-normal text-text-muted transition-all hover:text-text-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variant[props.variant || "default"],
        props.className,
      )}
      data-state={context.selected === props.value ? "active" : "inactive"}
      href={context.hrefFor(props.value)}
      scroll={false}
    />
  );
};

export function TabsContent(props: {
  children: React.ReactNode;
  className?: string;
  value: string;
}) {
  const context = useContext();

  if (context.selected !== props.value) {
    return null;
  }

  return (
    <div
      {...props}
      className={cn(
        "mt-2 ring-offset-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        props.className,
      )}
    />
  );
}
