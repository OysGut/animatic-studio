/**
 * Tekst- og grafikkmodellen i Motion Typography Studio (MTS MT1, spes. §2–6, §61). Ren data. Tekstlaget er et
 * vanlig lag i 2D-scenen (`kind: "text"`), med transformasjon, nøkkelbilder, maske, blanding, gruppe og
 * aktivt tidsområde som alle andre lag. Ingen egen tekstmotor (§72).
 */

/** Bokstavanimasjon (§9, §29): data på tekstlaget, beregnet i renderFrame. Teksten forblir tekst. */
export interface LetterAnimation {
  /** Hva som animeres hver for seg. */
  readonly unit: "letter" | "word" | "line";
  /** appear: kommer brått (F → FI → FIL → FILM); fade; slide (fra retningen); scale. */
  readonly effect: "appear" | "fade" | "slide" | "scale";
  /** Retningen enhetene kommer fra (slide). */
  readonly direction: "up" | "down" | "left" | "right";
  /** Første bilde (fra lagets start, eller starten av det aktive tidsområdet). */
  readonly startFrame: number;
  /** Bilder mellom hver enhet. */
  readonly delayFrames: number;
  /** Bilder hver enhet bruker (fade, slide, scale). */
  readonly durationFrames: number;
  readonly order: "start" | "end" | "center" | "random";
  /** Frø for «random» (samme rekkefølge i editor og eksport). */
  readonly seed: number;
  /** Avstand i piksler (slide). */
  readonly distance: number;
}

export type TextAlign = "left" | "center" | "right";
export type TextVAlign = "top" | "middle" | "bottom";

export interface TextSpec {
  /** Selve teksten (høyst MAX_TEXT_CHARS tegn). Linjeskift med \n. */
  readonly content: string;
  /** Font fra katalogen (FONT_CATALOG). */
  readonly fontId: string;
  /** Størrelse i piksler i scenen. */
  readonly size: number;
  readonly weight: number;
  readonly italic: boolean;
  /** #rrggbb */
  readonly color: string;
  /** Ekstra avstand mellom bokstavene i piksler. */
  readonly letterSpacing: number;
  /** Linjehøyde som faktor av størrelsen. */
  readonly lineHeight: number;
  readonly align: TextAlign;
  readonly vAlign: TextVAlign;
  /** Bryt linjene innenfor lagets bredde. */
  readonly wrap: boolean;
  readonly letterAnim?: LetterAnimation | null;
}

/** Form for en fargeflate (§6 grafiske former). */
export interface ShapeSpec {
  readonly type: "rect" | "ellipse" | "line";
  /** Avrundede hjørner (rect), piksler. */
  readonly radius: number;
  readonly stroke: { readonly color: string; readonly width: number } | null;
}

export interface LayerEffects {
  readonly shadow?: {
    readonly color: string;
    readonly blur: number;
    readonly offsetX: number;
    readonly offsetY: number;
  } | null;
  readonly glow?: { readonly color: string; readonly blur: number } | null;
  readonly outline?: { readonly color: string; readonly width: number } | null;
}

/** Laget er bygget fra et felt i en malforekomst (MT4). */
export interface TemplateSlotRef {
  readonly instanceId: string;
  /** Elementets nøkkel i malen (stabil mellom malversjoner). */
  readonly key: string;
  /** Feltets nøkkel i malen (f.eks. «name»), eller null for et fast element i malen. */
  readonly slot: string | null;
}

/** Grense for tekst per tekstlag (Øystein 2026-10-18). Over grensen avvises endringen med melding. */
export const MAX_TEXT_CHARS = 2000;
