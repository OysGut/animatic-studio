/**
 * Størrelse på store dialoger som brukeren kan endre (Øystein 23.10). Rene regler uten React og uten
 * nettleser-API: grenser, dra, tastatur og gyldig lagret verdi. Komponenten er ResizableDialogContent.
 */

export interface DialogSize {
  readonly w: number;
  readonly h: number;
}

/** Avstand til vinduets kant (px) på hver side. */
export const DIALOG_MARGIN = 24;
/** Under denne vindusbredden endres ikke størrelsen (mobil og smal skjerm). */
export const DIALOG_RESIZE_MIN_VIEWPORT = 768;
/** Steg for Shift + piltast (px). */
export const DIALOG_KEY_STEP = 20;
/** Standard minimum når dialogen ikke oppgir eget. */
export const DIALOG_DEFAULT_MIN: DialogSize = { w: 480, h: 320 };

export function isResizableViewport(viewportWidth: number): boolean {
  return viewportWidth >= DIALOG_RESIZE_MIN_VIEWPORT;
}

/** Største størrelse: vinduet minus marg på hver side. */
export function maxDialogSize(viewport: DialogSize): DialogSize {
  return {
    w: Math.max(1, Math.floor(viewport.w - 2 * DIALOG_MARGIN)),
    h: Math.max(1, Math.floor(viewport.h - 2 * DIALOG_MARGIN)),
  };
}

const clamp1 = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(Math.min(lo, hi), v)));

/**
 * Størrelsen innenfor grensene: minst `min`, høyst vinduet minus marg. Er vinduet mindre enn minimum,
 * vinner vinduet (dialogen krymper med vinduet).
 */
export function clampDialogSize(size: DialogSize, min: DialogSize, viewport: DialogSize): DialogSize {
  const max = maxDialogSize(viewport);
  return { w: clamp1(size.w, min.w, max.w), h: clamp1(size.h, min.h, max.h) };
}

/**
 * Ny størrelse når brukeren drar. Dialogen holdes sentrert, så kanten følger markøren: bredden
 * (og høyden) endres med det dobbelte av bevegelsen.
 */
export function dragDialogSize(
  start: DialogSize,
  edge: "right" | "bottom" | "corner",
  dx: number,
  dy: number,
): DialogSize {
  return {
    w: edge === "bottom" ? start.w : start.w + 2 * dx,
    h: edge === "right" ? start.h : start.h + 2 * dy,
  };
}

/** Shift + piltast på grepet; null når tasten ikke endrer størrelsen. */
export function keyDialogSize(
  start: DialogSize,
  key: string,
  shift: boolean,
  step = DIALOG_KEY_STEP,
): DialogSize | null {
  if (!shift) return null;
  switch (key) {
    case "ArrowRight":
      return { w: start.w + step, h: start.h };
    case "ArrowLeft":
      return { w: start.w - step, h: start.h };
    case "ArrowDown":
      return { w: start.w, h: start.h + step };
    case "ArrowUp":
      return { w: start.w, h: start.h - step };
    default:
      return null;
  }
}

/** Gyldig lagret verdi: null (standardstørrelse) eller en størrelse med rimelige tall. */
export function validStoredDialogSize(v: unknown): v is DialogSize | null {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 100 && n <= 20000;
  return ok(s["w"]) && ok(s["h"]);
}

/** Nøkkelen i brukerens visningsvalg for en dialogtype. */
export const dialogSizePrefKey = (sizeKey: string) => `dialogSize.${sizeKey}`;
