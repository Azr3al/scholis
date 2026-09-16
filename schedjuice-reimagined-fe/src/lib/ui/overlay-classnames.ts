// src/lib/ui/overlay-classnames.ts
import { overlayZClass } from "./overlay-layers";

export const dropdownPositionerClassName = `sj-root ${overlayZClass("dropdown")} outline-none`;
export const modalDropdownPositionerClassName = `sj-root ${overlayZClass("modalDropdown")} outline-none`;
export const modalBackdropClassName = `sj-root ${overlayZClass("modalBackdrop")} bg-overlay-scrim`;
export const modalPopupClassName = `sj-root ${overlayZClass("modalContent")}`;
export const toastViewportClassName = `sj-root fixed right-4 bottom-4 ${overlayZClass("toast")} w-[22rem] max-w-[calc(100vw-2rem)]`;
export const bannerStickyClassName = `sticky top-0 ${overlayZClass("banner")} w-full shrink-0`;
export const emergencyFixedClassName = `fixed ${overlayZClass("emergency")}`;
