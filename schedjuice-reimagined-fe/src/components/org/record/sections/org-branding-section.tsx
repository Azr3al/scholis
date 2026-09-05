"use client";
import { Button, useToast } from "@/components/primitives";

import ColorSelector from "@/components/colors/color-selector";
import DemoComponent from "@/components/colors/demo-component";
import { BLACK_TEXT, DEFAULT_THEME, WHITE_TEXT } from "@/config/defaults";
import type { OrgRecordMode } from "@/config/org-record-sections";
import { useColors } from "@/hooks/useColors";
import { themeSchema } from "@/types/theme";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as z from "zod";
import { OrgSectionPanel } from "./org-section-panel";

export function OrgBrandingSection({
  orgId,
  mode,
}: {
  orgId: string | number;
  mode: OrgRecordMode;
}) {
  const { saveTheme, theme, isLoading } = useColors(
    mode === "platform" ? { orgId } : undefined,
  );
  const toast = useToast();
  const [colors, setColors] =
    useState<z.infer<typeof themeSchema>>(DEFAULT_THEME);

  useEffect(() => {
    if (theme) setColors(theme);
  }, [theme]);

  return (
    <OrgSectionPanel
      title="Branding"
      description="Customize your school's theme colors. System colors (success, destructive) cannot be overridden."
      footer={
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading}
            onClick={async () => {
              saveTheme(DEFAULT_THEME);
              toast.add({
                title: "Theme reset",
                description: "Your theme has been reset to default."});
            }}
          >
            Reset to default
          </Button>
          <Button
            type="button"
            disabled={isLoading}
            onClick={async () => {
              saveTheme(colors);
              toast.add({
                title: "Theme saved",
                description: "Your theme has been saved."});
            }}
          >
            Save theme
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-muted">
        Learn more about{" "}
        <Link
          className="underline"
          href="https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23col_customize&versions=2.1&showtechniques=143#col_customize"
        >
          color contrast guidelines
        </Link>
        .
      </p>
      <div className="grid grid-cols-2 items-end gap-3">
        <ColorSelector
          label="Primary Color"
          description="Background colors of primary buttons."
          color={colors.primary}
          setColor={(color) => setColors({ ...colors, primary: color })}
        />
        <ColorSelector
          label="Primary Text Color"
          description="Text color on primary color background."
          presets={[BLACK_TEXT, WHITE_TEXT]}
          color={colors.primaryText}
          setColor={(color) => setColors({ ...colors, primaryText: color })}
        />
        <ColorSelector
          label="Secondary Color"
          description="Background colors of secondary buttons."
          color={colors.secondary}
          setColor={(color) => setColors({ ...colors, secondary: color })}
        />
        <ColorSelector
          label="Secondary Text Color"
          description="Text color on secondary color background."
          presets={[BLACK_TEXT, WHITE_TEXT]}
          color={colors.secondaryText}
          setColor={(color) => setColors({ ...colors, secondaryText: color })}
        />
        <div className="col-span-2">
          <ColorSelector
            label="Border Color"
            color={colors.border}
            setColor={(color) => setColors({ ...colors, border: color })}
          />
        </div>
        <ColorSelector
          label="Background Color"
          color={colors.background}
          setColor={(color) => setColors({ ...colors, background: color })}
        />
        <ColorSelector
          label="Background Text Color"
          presets={[BLACK_TEXT, WHITE_TEXT]}
          color={colors.text}
          setColor={(color) => setColors({ ...colors, text: color })}
        />
        <ColorSelector
          label="Card Background Color"
          color={colors.cardBackground}
          setColor={(color) => setColors({ ...colors, cardBackground: color })}
        />
        <ColorSelector
          label="Card Text Color"
          presets={[BLACK_TEXT, WHITE_TEXT]}
          color={colors.cardText}
          setColor={(color) => setColors({ ...colors, cardText: color })}
        />
        <ColorSelector
          label="Muted Background Color"
          description="A muted background color."
          color={colors.mutedBackground}
          setColor={(color) =>
            setColors({ ...colors, mutedBackground: color })
          }
        />
        <ColorSelector
          label="Muted Text Color"
          presets={[BLACK_TEXT, WHITE_TEXT]}
          color={colors.mutedText}
          setColor={(color) => setColors({ ...colors, mutedText: color })}
        />
        <ColorSelector
          label="Popover Background Color"
          color={colors.popoverBackground}
          setColor={(color) =>
            setColors({ ...colors, popoverBackground: color })
          }
        />
        <ColorSelector
          label="Popover Text Color"
          presets={[BLACK_TEXT, WHITE_TEXT]}
          color={colors.popoverText}
          setColor={(color) => setColors({ ...colors, popoverText: color })}
        />
      </div>
      <DemoComponent theme={colors} />
    </OrgSectionPanel>
  );
}
