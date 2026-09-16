export function componentToHex(c: number) {
  var hex = c.toString(16);
  return hex.length == 1 ? "0" + hex : hex;
}

export function rgbToHex(r: number, g: number, b: number) {
  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function rgbToHsl(r: number, g: number, b: number) {
  (r /= 255), (g /= 255), (b /= 255);
  const vmax = Math.max(r, g, b),
    vmin = Math.min(r, g, b);
  let h,
    s,
    l = (vmax + vmin) / 2;

  if (vmax === vmin) {
    return [0, 0, l]; // achromatic
  }

  const d = vmax - vmin;
  s = l > 0.5 ? d / (2 - vmax - vmin) : d / (vmax + vmin);
  if (vmax === r) h = (g - b) / d + (g < b ? 6 : 0);
  if (vmax === g) h = (b - r) / d + 2;
  if (vmax === b) h = (r - g) / d + 4;
  // @ts-ignore
  h /= 6;

  return [h, s, l];
}

export const rgbToHslString = (r: number, g: number, b: number) => {
  const [h, s, l] = rgbToHsl(r, g, b);
  //@ts-ignore
  return `${h * 360} ${s * 100} ${l * 100}`;
};
