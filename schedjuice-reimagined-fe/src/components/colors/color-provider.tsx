"use client";

import { rgbToHslString } from "@/helpers/colors";
import { useColors } from "@/hooks/useColors";
import { themeSchema } from "@/types/theme";
import * as z from "zod";

interface ColorProviderProps {
  theme?: z.infer<typeof themeSchema>;
}

const ColorProvider: React.FC<ColorProviderProps> = (props) => {
  const { theme: sysTheme } = useColors();
  let theme = sysTheme;
  if (props.theme) {
    theme = props.theme;
  }
  return (
    <>
      {theme && (
        <span
          dangerouslySetInnerHTML={{
            __html: `
          <style>
          :root {
          --background: ${rgbToHslString(
            theme?.background.r,
            theme?.background.g,
            theme?.background.b
          )};
          --card: ${rgbToHslString(
            theme?.cardBackground.r,
            theme?.cardBackground.g,
            theme?.cardBackground.b
          )};
           --muted: ${rgbToHslString(
             theme?.mutedBackground.r,
             theme?.mutedBackground.g,
             theme?.mutedBackground.b
           )};
          --popover: ${rgbToHslString(
            theme?.popoverBackground.r,
            theme?.popoverBackground.g,
            theme?.popoverBackground.b
          )};
          --foreground: ${rgbToHslString(
            theme?.text.r,
            theme?.text.g,
            theme?.text.b
          )};
          --card-foreground: ${rgbToHslString(
            theme?.cardText.r,
            theme?.cardText.g,
            theme?.cardText.b
          )};
          --muted-foreground: ${rgbToHslString(
            theme?.mutedText.r,
            theme?.mutedText.g,
            theme?.mutedText.b
          )};
          --popover-foreground: ${rgbToHslString(
            theme?.popoverText.r,
            theme?.popoverText.g,
            theme?.popoverText.b
          )};
          --border: ${rgbToHslString(
            theme?.border.r,
            theme?.border.g,
            theme?.border.b
          )};
          --primary: ${rgbToHslString(
            theme?.primary.r,
            theme?.primary.g,
            theme?.primary.b
          )};
          --primary-foreground: ${rgbToHslString(
            theme?.primaryText.r,
            theme?.primaryText.g,
            theme?.primaryText.b
          )};
          --secondary: ${rgbToHslString(
            theme?.secondary.r,
            theme?.secondary.g,
            theme?.secondary.b
          )};
          --secondary-foreground: ${rgbToHslString(
            theme?.secondaryText.r,
            theme?.secondaryText.g,
            theme?.secondaryText.b
          )};
          }
          
          </style>
          `,
          }}
        ></span>
      )}
    </>
  );
};

export default ColorProvider;
