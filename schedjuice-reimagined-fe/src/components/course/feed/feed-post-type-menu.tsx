"use client";

import { useMemo } from "react";
import { useDateFormatter } from "react-aria";
import { Check, Book as BookOpen, Megaphone } from "iconoir-react";

import { Button, Menu } from "@/components/primitives";
import type { PostType } from "@/types/course-feed";
import { cn } from "@/lib/utils";

const OPTIONS: {
  value: PostType;
  label: string;
  description: string;
  icon: typeof Megaphone;
}[] = [
  {
    value: "announcement",
    label: "Announcement",
    description: "Share news with the class",
    icon: Megaphone,
  },
  {
    value: "daily_lesson",
    label: "Daily lesson",
    description: "Log what the class covered today",
    icon: BookOpen,
  },
];

export function FeedPostTypeMenu({
  value,
  onChange,
}: {
  value: PostType;
  onChange: (value: PostType) => void;
}) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  const Icon = current.icon;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
          aria-haspopup="menu"
        />}
      >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {current.label}
          <span className="text-xs opacity-70" aria-hidden>
            ▾
          </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup className="w-56">
        {OPTIONS.map((opt) => (
          <Menu.Item
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="flex w-full items-center gap-2 font-medium">
              <opt.icon className="h-4 w-4 text-muted-foreground" />
              {opt.label}
              {value === opt.value ? (
                <Check className="ml-auto h-4 w-4 text-primary" />
              ) : null}
            </span>
            <span className={cn("pl-6 text-xs text-muted-foreground")}>
              {opt.description}
            </span>
          </Menu.Item>
        ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
