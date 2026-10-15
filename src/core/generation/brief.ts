/**
 * Bildebestillingen og promptmotoren (DEC-0080). Mars 14.10.2026: «les deg grundig opp på de ulike
 * anbefalte måtene og kom opp med en god struktur og angivelse for promptingen».
 *
 * Programmet bygger først én strukturert bestilling (`ImageBrief`): hva bildet er, motivet og
 * kjennetegnene, vinkel og positur, stil, farger, lys, bakgrunn og komposisjon, referansebildene med roller
 * og det som skal holdes likt. Bestillingen oversettes så til den formen hver modellfamilie forstår best:
 *
 * - «narrative» (Nano Banana/Gemini, GPT Image): sammenhengende beskrivelse i avsnitt – motiv, handling,
 *   sted, komposisjon, stil (Googles anbefaling: «describe the scene, don't just list keywords»).
 *   Referansebildene får roller med ord («the first image shows …»), og det som skal unngås, beskrives
 *   positivt («a plain, empty background» i stedet for «no background»).
 * - «compact» (Seedream, Qwen-Image-Edit, FLUX Kontext): kortere, med identiteten først, så positur og
 *   vinkel, så stil – og en egen negativ beskrivelse der modellen har et felt for det.
 *
 * Regler fra kildene (Google Cloud «Ultimate prompting guide for Nano Banana», Gemini API-dokumentasjonen,
 * Veo 3.1-guiden og ByteDance/Seedream-materiale):
 * 1. Én oppgave per bilde, uten motsigelser: et karakterdesign får nøytralt, jevnt lys; scenelyset hører
 *    til bakgrunner og scenebilder.
 * 2. Bare visuelle fakta om motivet (alder, kropp, klær, farger, kjennetegn) – ikke replikker eller andre
 *    figurer i scenen, som frister modellen til å tegne dem.
 * 3. Konkret stil (medium, strek, form, farger, detaljnivå), aldri bare «som resten av filmen».
 * 4. Farger med navn og kode («deep navy (#0d1b2a)»): modellene følger navn bedre enn koder.
 * 5. Ingen filmtittel eller annen tekst modellen kan finne på å skrive inn i bildet.
 * 6. Ekte gjennomsiktighet lages sjelden; en helt flat, ensfarget bakgrunn friegges i programmet etterpå.
 */
import type { AssetKind, StyleGuide } from "../model";
import { VERSION_VIEW_PROMPT, type VersionView } from "../library/view";
import type { ImagePurpose } from "./prompt";
import { L, localized } from "../i18n";

export type PromptFamily = "narrative" | "compact";

/** Modellfamilien en modell hører til (bestemmer formen på beskrivelsen). */
export function promptFamilyOf(provider: string, model: string | null | undefined): PromptFamily {
  if (provider === "fal") return "compact";
  return "narrative";
}

export const PROMPT_FAMILY_LABEL: Record<PromptFamily, string> = localized({
  narrative: [
    "fortellende beskrivelse (anbefalt for Nano Banana og GPT Image)",
    "narrative description (recommended for Nano Banana and GPT Image)",
  ],
  compact: [
    "kort og presis beskrivelse med identiteten først (anbefalt for Seedream, Qwen og FLUX)",
    "short, precise description with the identity first (recommended for Seedream, Qwen and FLUX)",
  ],
});

/** Hva bildet er. */
export type BriefTask =
  /** Frilagt figur eller ting (eget lag i scenen). */
  | "design"
  /** Bakgrunn som fyller bildet. */
  | "background"
  /** Karakterark: flere vinkler side om side i ett bilde. */
  | "sheet"
  /** Én bestemt vinkel av et motiv som finnes fra før. */
  | "view";

export interface BriefReference {
  /** 1-basert plass i listen over bildene som sendes. */
  readonly index: number;
  readonly role: "identity" | "style" | "view";
  /** Hva bildet viser (engelsk). */
  readonly label: string;
  /** Vinkelen bildet viser, når den er merket. */
  readonly view?: VersionView;
}

export interface ImageBrief {
  readonly task: BriefTask;
  readonly purpose: ImagePurpose;
  readonly subject: {
    readonly name: string;
    readonly kind: AssetKind;
    /** Visuelle fakta på engelsk (fra faktaarket), én per linje. */
    readonly facts: readonly string[];
    /** Utdrag fra manuset/biblioteket på originalspråket (når faktaark mangler), merket som norsk. */
    readonly notes: readonly string[];
    /** Utseendet i denne varianten (antrekk, alder …). */
    readonly appearance: string | null;
  };
  /** Vinkel(er): én for «design»/«view», flere for «sheet». */
  readonly views: readonly VersionView[];
  /** Stil, i konkrete ord. */
  readonly style: {
    readonly look: string;
    readonly technique: string;
    readonly design: string;
    readonly colours: readonly string[];
    readonly colourNote: string;
    readonly mood: string;
    /** Stilen kommer fra «Filmens visuelle stil» (ellers en enkel standard ut fra varianten). */
    readonly fromGuide: boolean;
  };
  /** Kort om filmen (stemning og publikum, ikke tittel). */
  readonly film: string;
  /** Sted, tid og årstid (bakgrunner). */
  readonly setting: string | null;
  /** Hva som skjer, for stemningen (bakgrunner), på originalspråket. */
  readonly moodExcerpt: string | null;
  readonly lighting: string;
  readonly composition: string;
  /** Lag gjennomsiktig bakgrunn (modellen kan det) eller en flat, ensfarget bakgrunn. */
  readonly transparent: boolean;
  readonly references: readonly BriefReference[];
  /** Ting som ikke skal være med (blir positive formuleringer eller negativ beskrivelse). */
  readonly avoid: readonly string[];
  /** Prosjektets egne instrukser (går foran). */
  readonly instructions: string;
  /** Et forbilde sendes med uten liste over bildene (eldre vei): hold motivet likt det. */
  readonly keepReference?: boolean;
}

// ---------------------------------------------------------------- Farger med navn

function hsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

const HUES: readonly [number, string][] = [
  [15, "red"],
  [36, "orange"],
  [55, "gold"],
  [70, "yellow"],
  [160, "green"],
  [195, "teal"],
  [250, "blue"],
  [290, "violet"],
  [335, "magenta"],
  [360, "red"],
];

/**
 * Et engelsk navn på en farge (#rrggbb), f.eks. «deep navy», «warm off-white», «muted gold». Bildemodellene
 * følger navn bedre enn koder; begge sendes.
 */
export function colourName(hex: string): string {
  const c = hsl(hex);
  if (!c) return hex;
  const { h, s, l } = c;
  if (s < 0.12 || (l > 0.9 && s < 0.4) || (l < 0.1 && s < 0.4)) {
    if (l > 0.9) return h > 20 && h < 70 && s > 0.15 ? "warm off-white" : "off-white";
    if (l > 0.7) return "light grey";
    if (l > 0.4) return "mid grey";
    if (l > 0.15) return "charcoal";
    return "near-black";
  }
  let hue = HUES.find(([lim]) => h < lim)?.[1] ?? "red";
  if (hue === "blue" && l < 0.3) hue = "navy";
  if (hue === "orange" && l < 0.35) hue = "brown";
  if (hue === "gold" && s < 0.55) hue = "ochre";
  const shade = l < 0.2 ? "deep" : l < 0.35 ? "dark" : l > 0.8 ? "pale" : l > 0.65 ? "light" : "";
  const tone = hue === "navy" ? "" : s < 0.3 ? "greyish" : s < 0.55 ? "muted" : "";
  const name = [shade, tone, hue].filter(Boolean).join(" ").replace("greyish blue", "blue-grey");
  return name || hue;
}

/** «deep navy (#0d1b2a)». */
export function namedColours(colors: readonly string[]): string[] {
  return colors.map((c) => `${colourName(c)} (${c.toLowerCase()})`);
}

// ---------------------------------------------------------------- Felles tekst

const KIND_NOUN: Record<AssetKind, string> = {
  character: "character",
  animal: "animal character",
  object: "prop",
  location: "location",
  environment: "environment",
  other: "element",
  sound: "element",
};

const sentence = (t: string) => {
  const x = t.trim().replace(/\s+/g, " ");
  if (!x) return "";
  return /[.!?…]$/.test(x) ? x : `${x}.`;
};
const join = (...xs: (string | null | undefined | false)[]) =>
  xs.filter((x): x is string => !!x && !!x.trim()).join(" ");

/** «image 1», «images 2 and 3», «images 2–4». */
function imageList(idx: readonly number[]): string {
  if (!idx.length) return "";
  if (idx.length === 1) return `image ${idx[0]}`;
  const sorted = [...idx].sort((a, b) => a - b);
  const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
  if (consecutive && sorted.length > 2) return `images ${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `images ${sorted.slice(0, -1).join(", ")} and ${sorted[sorted.length - 1]}`;
}

function poseText(b: ImageBrief): string {
  const v = b.views[0] ?? "three_quarter";
  const full = b.subject.kind === "character" || b.subject.kind === "animal";
  if (v === "portrait") return VERSION_VIEW_PROMPT.portrait;
  return full
    ? `full figure from head to feet, standing in a relaxed, natural pose; ${VERSION_VIEW_PROMPT[v]}`
    : `the whole object, ${VERSION_VIEW_PROMPT[v].replace(/^(\S+ )?(\S+ view)/, "$1$2")}`;
}

function backgroundText(b: ImageBrief): string {
  if (b.purpose === "background")
    return "The image fills the whole frame edge to edge as a wide establishing view, with readable open floor space where characters will later stand, and the place itself empty of people and characters.";
  const what = b.subject.kind === "character" || b.subject.kind === "animal" ? "figure" : "object";
  return b.transparent
    ? `The ${what} is centred on a fully transparent background with generous empty space around it and nothing else in the frame: no ground, no cast shadow, no scenery, no other characters.`
    : `The ${what} is centred on a plain, flat, pure white background with generous empty space around it and nothing else in the frame: no ground, no cast shadow, no scenery, no other characters (the background is removed afterwards).`;
}

function styleText(b: ImageBrief, refs: readonly BriefReference[]): string {
  const style = refs.filter((r) => r.role === "style").map((r) => r.index);
  const s = b.style;
  const colours = s.colours.length
    ? `Colours from the film's palette: ${s.colours.join(", ")}${s.colourNote ? ` – ${s.colourNote.replace(/\.$/, "")}` : ""}.`
    : s.colourNote
      ? sentence(`Colours: ${s.colourNote}`)
      : "";
  return join(
    style.length
      ? `Match the drawing style, line quality, texture, colour treatment and level of detail of ${imageList(style)} exactly.`
      : "",
    sentence(s.look),
    sentence(s.technique),
    sentence(s.design),
    colours,
  );
}

function referenceText(b: ImageBrief): string {
  const id = b.references.filter((r) => r.role === "identity");
  const views = b.references.filter((r) => r.role === "view");
  const style = b.references.filter((r) => r.role === "style");
  const parts: string[] = [];
  if (id.length)
    parts.push(
      `${cap(imageList(id.map((r) => r.index)))} ${id.length > 1 ? "show" : "shows"} ${b.subject.name} as designed – this is who to draw.`,
    );
  if (views.length)
    parts.push(
      `${cap(imageList(views.map((r) => r.index)))} ${views.length > 1 ? "show" : "shows"} the same ${KIND_NOUN[b.subject.kind]} from other angles (${views
        .map((r) => (r.view ? VERSION_VIEW_PROMPT[r.view].split(" – ")[0] : "another view"))
        .join(", ")}).`,
    );
  if (style.length)
    parts.push(
      `${cap(imageList(style.map((r) => r.index)))} ${style.length > 1 ? "are" : "is an"} approved image${style.length > 1 ? "s" : ""} from the film, for style only – do not copy their subject or composition.`,
    );
  return parts.join(" ");
}

const cap = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

function keepText(b: ImageBrief): string {
  const refs = b.references.filter((r) => r.role === "identity" || r.role === "view");
  if (!refs.length)
    return b.keepReference
      ? `Keep ${b.subject.name} identical to the attached reference image: the same face, proportions, clothing and colours. Change only what is described here.`
      : "";
  return `Keep ${b.subject.name} identical to ${imageList(refs.map((r) => r.index))}: the same face, head shape, hair, body proportions, clothing, colours and markings, drawn with the same line and the same level of detail. Change only the angle and pose described here; do not redesign anything.`;
}

function factsText(b: ImageBrief): string {
  const f = b.subject.facts.map((x) => sentence(cap(x))).join(" ");
  const notes = b.subject.notes.length
    ? `Visual details from the screenplay (Norwegian, use only what describes how ${b.subject.name} looks): ${b.subject.notes.map((n) => `"${n}"`).join(" ")}`
    : "";
  return join(
    f,
    b.subject.appearance ? sentence(`In this version: ${b.subject.appearance}`) : "",
    notes,
  );
}

function avoidList(b: ImageBrief): string[] {
  return [
    ...new Set(["text", "letters", "logos", "watermarks", ...b.avoid.map((x) => x.trim())]),
  ].filter(Boolean);
}

// ---------------------------------------------------------------- Fortellende (Nano Banana, GPT Image)

function renderNarrative(b: ImageBrief): string {
  const out: string[] = [];
  const refs = referenceText(b);
  if (refs) out.push(`Reference images: ${refs}`);
  const noun = KIND_NOUN[b.subject.kind];
  if (b.task === "background") {
    out.push(
      join(
        `Create a wide background painting of ${b.subject.name}, a ${noun} in a 2D animated film.`,
        factsText(b),
        b.setting ? sentence(b.setting) : "",
        b.moodExcerpt
          ? `For mood only – do not draw the characters (screenplay excerpt, Norwegian): "${b.moodExcerpt}"`
          : "",
      ),
    );
    out.push(join(sentence(b.composition), backgroundText(b)));
    out.push(join("Style:", styleText(b, b.references)));
    out.push(sentence(`Lighting: ${b.lighting}`));
  } else if (b.task === "sheet") {
    out.push(
      join(
        `Create a character turnaround sheet of ${b.subject.name}: the same ${noun} shown ${b.views.length} times side by side in one row, in this order from left to right: ${b.views
          .map((v, i) => `${i + 1}) ${VERSION_VIEW_PROMPT[v].split(" – ")[0]}`)
          .join(", ")}.`,
        "Every view is the same height and scale, standing on the same baseline, evenly spaced with clear empty space between them, drawn with a neutral, straight-on camera (no perspective distortion) and the same neutral pose.",
        factsText(b),
      ),
    );
    out.push(join("Style:", styleText(b, b.references)));
    out.push(
      join(
        `Lighting: ${b.lighting}.`,
        b.transparent
          ? "Transparent background, nothing else in the image."
          : "Plain, flat, pure white background behind all views, nothing else in the image: no labels, no ground, no shadows, no scenery.",
      ),
    );
  } else {
    out.push(
      join(
        b.task === "view"
          ? `Draw ${b.subject.name} from a new angle: ${poseText(b)}.`
          : `Create a ${noun} design of ${b.subject.name} for a 2D animated film: ${poseText(b)}.`,
        factsText(b),
      ),
    );
    out.push(join("Style:", styleText(b, b.references)));
    out.push(join(sentence(`Lighting: ${b.lighting}`), backgroundText(b)));
  }
  const keep = keepText(b);
  if (keep) out.push(keep);
  if (b.film) out.push(sentence(b.film));
  out.push(`Leave out: ${avoidList(b).join(", ")}.`);
  if (b.instructions.trim())
    out.push(`Project instructions (always follow): ${b.instructions.trim()}`);
  return out.filter((x) => x.trim()).join("\n\n");
}

// ---------------------------------------------------------------- Kort og presis (Seedream, Qwen, Kontext)

function renderCompact(b: ImageBrief): { prompt: string; negative: string } {
  const lines: string[] = [];
  const id = b.references.filter((r) => r.role === "identity" || r.role === "view");
  const style = b.references.filter((r) => r.role === "style");
  if (id.length)
    lines.push(
      `Identity: the ${KIND_NOUN[b.subject.kind]} in ${imageList(id.map((r) => r.index))} – keep face, hair, proportions, outfit and colours exactly the same.`,
    );
  lines.push(
    `Subject: ${b.subject.name}${b.subject.facts.length ? `, ${b.subject.facts.map((f) => f.replace(/\.$/, "")).join("; ")}` : ""}${b.subject.appearance ? `; ${b.subject.appearance}` : ""}.`,
  );
  if (!b.subject.facts.length && b.subject.notes.length)
    lines.push(`Details (Norwegian screenplay): ${b.subject.notes.slice(0, 3).join(" ")}`);
  if (b.task === "sheet")
    lines.push(
      `Layout: turnaround sheet, ${b.views.length} views in one row, left to right: ${b.views
        .map((v) => VERSION_VIEW_PROMPT[v].split(" – ")[0])
        .join(", ")}; same height, same baseline, evenly spaced, neutral pose, no perspective.`,
    );
  else if (b.task === "background")
    lines.push(
      `Shot: wide establishing view filling the frame, open floor space, no people. ${b.setting ?? ""}`.trim(),
    );
  else lines.push(`Pose: ${poseText(b)}.`);
  lines.push(
    `Style: ${join(
      style.length ? `match ${imageList(style.map((r) => r.index))} (style only)` : "",
      [b.style.look, b.style.technique].filter(Boolean).join("; "),
    )}${b.style.colours.length ? `; colours ${b.style.colours.join(", ")}` : ""}.`,
  );
  lines.push(`Light: ${b.lighting}.`);
  if (b.purpose !== "background" || b.task === "sheet")
    lines.push(
      b.transparent
        ? "Background: transparent, centred, empty margin."
        : "Background: plain flat white, centred, empty margin, nothing else.",
    );
  if (b.instructions.trim()) lines.push(`Always: ${b.instructions.trim()}`);
  const negative = [
    ...avoidList(b),
    "photorealistic",
    "3D render",
    ...(b.purpose === "background"
      ? ["people", "characters"]
      : ["background scenery", "extra characters", "cropped", "cast shadow"]),
    "blurry",
    "deformed",
  ];
  return { prompt: lines.join("\n"), negative: [...new Set(negative)].join(", ") };
}

/** Beskrivelsen i formen modellfamilien forstår best (og en negativ beskrivelse der det passer). */
export function renderBrief(
  b: ImageBrief,
  family: PromptFamily,
): { readonly prompt: string; readonly negative: string | null } {
  if (family === "compact") return renderCompact(b);
  return { prompt: renderNarrative(b), negative: null };
}

// ---------------------------------------------------------------- Norsk oppsummering

const TASK_NB: Record<BriefTask, string> = localized({
  design: ["Figurdesign", "Character design"],
  background: ["Bakgrunn", "Background"],
  sheet: ["Karakterark", "Character sheet"],
  view: ["Ny vinkel", "New angle"],
});

/** Kort, norsk oppsummering av bestillingen (vises over den engelske beskrivelsen). */
export function briefSummaryNb(
  b: ImageBrief,
  family: PromptFamily,
  viewLabel: (v: VersionView) => string,
): string[] {
  const id = b.references.filter((r) => r.role !== "style").length;
  const st = b.references.filter((r) => r.role === "style").length;
  const views = b.views.map(viewLabel).join(", ");
  const colours = b.style.colours.length;
  return [
    L(
      `${TASK_NB[b.task]} av ${b.subject.name}${b.views.length ? ` – ${views.toLocaleLowerCase("nb")}` : ""}.`,
      `${TASK_NB[b.task]}: ${b.subject.name}${b.views.length ? ` – ${views.toLocaleLowerCase("en")}` : ""}.`,
    ),
    b.subject.facts.length
      ? L(
          `Utseende fra faktaarket (${b.subject.facts.length} punkter).`,
          `Appearance from the fact sheet (${b.subject.facts.length} points).`,
        )
      : b.subject.notes.length
        ? L(
            "Utseende fra manusutdrag (ingen faktaark ennå – lag et for bedre treff).",
            "Appearance from the script extract (no fact sheet yet – make one for better results).",
          )
        : L(
            "Ingen beskrivelse av utseendet – lag et faktaark eller skriv en beskrivelse av objektet.",
            "No description of the appearance – make a fact sheet or write a description of the object.",
          ),
    b.style.fromGuide
      ? L(
          `Stil fra «Filmens visuelle stil»${colours ? ` med ${colours} farger` : ""}.`,
          `Style from “The film's visual style”${colours ? ` with ${colours} colours` : ""}.`,
        )
      : L(
          "Ingen visuell stil fylt ut – bruker en enkel standardstil.",
          "No visual style filled in – using a simple default style.",
        ),
    id || st
      ? L(
          `Referansebilder: ${[id ? `${id} av motivet` : "", st ? `${st} for stilen` : ""].filter(Boolean).join(", ")}.`,
          `Reference images: ${[id ? `${id} of the subject` : "", st ? `${st} for the style` : ""].filter(Boolean).join(", ")}.`,
        )
      : L("Ingen referansebilder.", "No reference images."),
    b.purpose === "background"
      ? L("Fyller hele bildet, uten figurer.", "Fills the whole image, without figures.")
      : b.transparent
        ? L("Gjennomsiktig bakgrunn.", "Transparent background.")
        : L("Hvit bakgrunn – frilegg etterpå.", "White background – cut out afterwards."),
    `${L("Form:", "Format:")} ${PROMPT_FAMILY_LABEL[family]}.`,
  ];
}

/** Stilfeltene i bestillingen fra filmens visuelle stil (tom stil gir en enkel standard). */
export function briefStyle(
  g: StyleGuide | null,
  purpose: ImagePurpose,
  variantStyleText: string,
): ImageBrief["style"] {
  // Den redigerte samlede beskrivelsen er den ene versjonen (DEC-0085): den erstatter feltene
  const edited = g?.prompt?.trim();
  if (edited)
    return {
      look: edited,
      technique: "",
      design: "",
      colours: namedColours(g!.palette.colors),
      colourNote: "",
      mood: "",
      fromGuide: true,
    };
  return {
    look: g?.visualStyle.trim() || variantStyleText,
    technique: g?.technique.trim() ?? "",
    design: (purpose === "background" ? g?.environmentDesign : g?.characterDesign)?.trim() ?? "",
    colours: g ? namedColours(g.palette.colors) : [],
    colourNote: g?.palette.description.trim() ?? "",
    mood: g?.mood.trim() ?? "",
    fromGuide:
      !!g &&
      [
        g.visualStyle,
        g.technique,
        g.characterDesign,
        g.environmentDesign,
        g.palette.description,
      ].some((x) => x.trim().length > 0),
  };
}
