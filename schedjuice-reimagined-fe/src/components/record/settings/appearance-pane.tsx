"use client";
import { useToast } from "@/components/primitives";

import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import { RecordSection } from "@/components/record/record-section";
import { Slider } from "@/components/primitives/slider";
import { Switch } from "@/components/primitives/switch";
import { ThemeToggle } from "@/components/primitives/theme-toggle";
import { useUnifiedTheme } from "@/components/shell/use-unified-theme";
import { mergeAccountPreservingProfileImage } from "@/lib/user/profile-image-url";
import { playClick } from "@/lib/sound/click-sound";
import {
  useUiSoundEnabled,
  useUiSoundVolume,
} from "@/lib/sound/sound-preference";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { viewMode } from "@/types/user";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function AppearancePane({ userId }: { userId: string }) {
  const { setUser, user: account } = useUser();
  const { syncNextThemes } = useUnifiedTheme();
  const toast = useToast();
  const [uiSoundsEnabled, setUiSoundsEnabled] = useUiSoundEnabled();
  const [uiSoundVolume, setUiSoundVolume] = useUiSoundVolume();
  const [viewModePref, setViewModePref] = useState<viewMode>(viewMode.card);

  const { data, isSuccess } = useQuery({
    queryKey: [`getUser${userId}`],
    queryFn: () => fetchEntity("users", userId),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isSuccess && data?.data?.data?.default_view_mode) {
      setViewModePref(data.data.data.default_view_mode as viewMode);
    }
  }, [isSuccess, data]);

  const saveViewMode = useMutation({
    mutationFn: (mode: viewMode) =>
      updateEntity("users", userId, { default_view_mode: mode }),
    onSuccess: (res) => {
      toast.add({
        title: "Success",
        description: "View mode updated.",
      });
      const next = res.data.data;
      if (account) {
        setUser(mergeAccountPreservingProfileImage(account, next));
      } else {
        setUser(next);
      }
    },
    onError: () =>
      toast.add({
        title: "Error",
        description: "Failed to update view mode.",
      }),
  });

  return (
    <div className="flex flex-col gap-8">
      <RecordSection
        title="Theme"
        description="Choose light, dark, or match your system setting."
      >
        <ThemeToggle onChange={syncNextThemes} />
      </RecordSection>

      <RecordSection
        title="Interface sounds"
        description="Play subtle clicks on navigation and list entrances."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-text-primary">
                Interface sounds
              </p>
              <p className="text-sm text-text-muted">
                Clicks on sidebar switches and staggered list entrances.
              </p>
            </div>
            <Switch
              checked={uiSoundsEnabled}
              onCheckedChange={(checked) => {
                setUiSoundsEnabled(checked);
                if (checked) playClick();
              }}
            />
          </div>
          <div
            className={cn(
              "space-y-3 rounded-lg border border-border p-4 transition-opacity",
              !uiSoundsEnabled && "pointer-events-none opacity-50",
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-text-primary">Volume</p>
              <span className="text-sm tabular-nums text-text-muted">
                {uiSoundVolume}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={uiSoundVolume}
              disabled={!uiSoundsEnabled}
              onValueChange={(v) => {
                setUiSoundVolume(v as number);
              }}
            />
          </div>
        </div>
      </RecordSection>

      <RecordSection
        title="Default view mode"
        description="How lists open when you first visit a page."
      >
        <div className="flex flex-wrap gap-2">
          {([viewMode.card, viewMode.table] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setViewModePref(mode);
                saveViewMode.mutate(mode);
              }}
              className={cn(
                "rounded-md border px-4 py-2 text-sm capitalize transition-colors",
                viewModePref === mode
                  ? "border-accent bg-surface-active font-medium text-text-primary"
                  : "border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </RecordSection>
    </div>
  );
}
