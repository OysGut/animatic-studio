/**
 * Bildebeskrivelser med sammenheng (DEC-0065, REQ-0245/0246, REQ-0589): «Prompt Orchestration» for bilder.
 *
 * En bildemodell vet ingenting om filmen. Beskrivelsen bygges derfor av alt prosjektet vet:
 * 1. FILM – hva filmen handler om, verden, tid og sted, publikum (filmens visuelle stil, `StyleProfile`).
 * 2. VISUAL STYLE – stil, teknikk, farger, lys, stemning, regler for figurer/omgivelser og bildeutsnitt.
 * 3. THIS IMAGE – hva bildet skal være (ressurs, variant, utseende), og hvordan det brukes (frilagt figur
 *    som eget lag, eller bakgrunn som fyller bildet).
 * 4. WHERE IT APPEARS – scenene ressursen er med i (eller scenen bildet lages til): sted, INT/EXT, tid på
 *    døgnet og årstid fra manuset med lyset det gir, hvem andre som er der, og et kort utdrag av handlingen.
 * 5. CONSISTENCY – godkjente bilder i filmen: andre figurer og steder i samme scener, filmens forbildebilder,
 *    og utseendet karakteren har i scenen (kontinuitet).
 * 6. AVOID – det som ikke skal være med.
 *
 * Alt er tekst brukeren ser og kan endre før noe sendes (REQ-0250–0256). Beskrivelsen er på engelsk
 * (REQ-0015); tekst fra manuset og biblioteket står på originalspråket og er merket slik.
 * Beskrivelsen lages uten AI (gratis). Brukeren kan be en språkmodell skrive den om (DEC-0066,
 * `prompt-writer.ts`), og filmens godkjente bilder kan sendes med til bildemodellen (`attachedImages`).
 */
import type { Asset, AssetVariant, ProjectState, StyleGuide } from "../model";
import { allAssetUsage, assetNames, assetsInScene, coverVersion } from "../library";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { sceneContinuityVariant } from "../continuity";
import { IMAGE_PURPOSE_FOR_KIND, MAX_PROMPT_CHARS, STYLE_TEXT, type ImagePurpose } from "./prompt";
import { defaultStyleProfile, styleProfileFor } from "./style";
import {
  briefStyle,
  renderBrief,
  type BriefTask,
  type ImageBrief,
  type PromptFamily,
} from "./brief";
import { labelledViews, VERSION_VIEW_PROMPT, type VersionView } from "../library/view";

export interface ContextPromptInput {
  readonly assetId: string;
  /** Varianten bildet lagres i (null: en ny lages). */
  readonly variantId: string | null;
  readonly productionId: string;
  /** Scenen (sceneforekomsten) bildet lages til, f.eks. fra sceneeditoren. */
  readonly occurrenceId?: string | null;
  /** Sendes et eksisterende bilde med som forbilde? */
  readonly withReference: boolean;
  /**
   * Bildene som sendes med til bildemodellen (DEC-0066), i rekkefølge – se `attachedImages`. Beskrivelsen
   * forteller da modellen hva hvert bilde er og hva det skal brukes til.
   */
  readonly attached?: readonly AttachedImage[];
  /** Formen beskrivelsen skrives i (modellfamilien, DEC-0080). Standard: fortellende. */
  readonly family?: PromptFamily;
  /** Modellen kan lage gjennomsiktig bakgrunn (ellers flat hvit, som friegges etterpå). */
  readonly transparent?: boolean;
  /** Hva bildet er (standard: figurdesign eller bakgrunn ut fra ressurstypen). */
  readonly task?: BriefTask;
  /** Vinkel(er) for figuren (standard: tre kvart forfra). */
  readonly views?: readonly VersionView[];
}

/** Et bilde som sendes med til bildemodellen (DEC-0066). */
export interface AttachedImage {
  readonly versionId: string;
  readonly path: string;
  readonly mimeType: string;
  /**
   * «identity»: bildet som skal endres/beholdes; «view»: samme motiv fra en annen vinkel (DEC-0080);
   * «style»: forbilde for stilen bare.
   */
  readonly role: "identity" | "view" | "style";
  /** Hva bildet viser (engelsk beskrivelse til modellen). */
  readonly label: string;
  /** Vinkelen bildet viser, når den er merket (DEC-0080). */
  readonly view?: VersionView;
}

/** Høyeste antall bilder som sendes med (bildemodellen og kostnaden). */
export const MAX_ATTACHED_IMAGES = 6;

const KIND_TEXT: Record<Asset["kind"], string> = {
  character: "a character",
  animal: "an animal character",
  object: "a prop / object",
  location: "a location",
  environment: "an environment",
  other: "an element",
  sound: "an element",
};

/** Tid på døgnet i scenehodet (norsk eller engelsk) → engelsk tid og forslag til lys. */
/** Hele ord (også æ, ø, å – JavaScripts \\b gjelder bare a–z). */
const word = (alts: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "iu");

const TIME_OF_DAY: readonly { re: RegExp; time: string; light: string }[] = [
  {
    re: word("natt(?:en)?|night|midnatt|midnight"),
    time: "night",
    light:
      "night: low-key moonlight, deep cool blues, warm practical light from windows, lamps or fire",
  },
  {
    re: word("kveld(?:en)?|evening|aften(?:en)?"),
    time: "evening",
    light:
      "evening: fading daylight, long shadows, warm interior lights against a cool blue exterior",
  },
  {
    re: word("skumring(?:en)?|dusk|tussmørke(?:t)?|solnedgang(?:en)?|sunset"), // i18n-ignore
    time: "dusk",
    light: "dusk: soft violet and orange sky, low contrast, first lights coming on",
  },
  {
    re: word("morgen\\p{L}*|morning|gry(?:et)?|soloppgang(?:en)?|sunrise|dawn"),
    time: "morning",
    light: "morning: low, soft, warm sunlight, fresh and clear air",
  },
  {
    re: word("ettermiddag(?:en)?|afternoon"),
    time: "afternoon",
    light: "afternoon: warm, slightly low sun",
  },
  {
    re: word("dag(?:en)?|day|formiddag(?:en)?|noon"),
    time: "day",
    light: "day: even, natural daylight",
  },
];

/** Årstid og vær fra scenehodet og handlingen (ikke replikkene). */
const SEASONS: readonly { re: RegExp; text: string }[] = [
  {
    re: word(
      "jul(?:a|en|ens|eaften|aften|ekvelden|etre(?:et)?|ebord(?:et)?|egave\\p{L}*|enisse\\p{L}*)?|julaften|nisse(?:n|r|ne)?|christmas",
    ),
    text: "Christmas time",
  },
  {
    re: word(
      "snø(?:en|r|stormen|storm|fnugg)?|snødekt\\p{L}*|vinter(?:en)?|frost(?:en)?|snow\\p{L}*|winter", // i18n-ignore
    ),
    text: "winter, snow",
  },
  { re: word("regn(?:et|er)?|rain(?:ing|y)?"), text: "rain" }, // i18n-ignore
  { re: word("sommer(?:en)?|summer"), text: "summer" },
  { re: word("høst(?:en)?|autumn"), text: "autumn" }, // i18n-ignore
  { re: word("våren|vårsol(?:en)?"), text: "spring" }, // i18n-ignore
];

/** Tekst å lete etter årstid i: scenehodet og handlingen. */
function seasonText(s: ProjectState, variantId: string): string {
  const v = s.variants[variantId];
  if (!v) return "";
  return `${v.heading.location} ${v.heading.time} ${blocksOfVariant(s, variantId)
    .filter((b) => b.kind === "action" || b.kind === "heading")
    .map((b) => b.text)
    .join(" ")}`;
}

/**
 * Stedet og tiden i en scene i ord (engelsk, DEC-0085): inne/ute, tid på døgnet med forslag til lys, og
 * årstid/vær fra scenehodet og handlingen.
 */
export function sceneSetting(
  s: ProjectState,
  variantId: string,
): {
  readonly intExt: "interior" | "exterior" | "interior/exterior" | null;
  readonly time: string | null;
  readonly light: string | null;
  readonly seasons: readonly string[];
} {
  const v = s.variants[variantId];
  if (!v) return { intExt: null, time: null, light: null, seasons: [] };
  const ie = v.heading.intExt.toUpperCase();
  const tod = TIME_OF_DAY.find((t) => t.re.test(v.heading.time));
  const src = seasonText(s, v.id);
  return {
    intExt:
      ie.includes("INT") && ie.includes("EXT")
        ? "interior/exterior"
        : ie.includes("INT")
          ? "interior"
          : ie.includes("EXT")
            ? "exterior"
            : null,
    time: tod?.time ?? null,
    light: tod?.light ?? null,
    seasons: SEASONS.filter((x) => x.re.test(src)).map((x) => x.text),
  };
}

function excerpt(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")} …`).trim();
}

const line = (label: string, v: string | undefined | null) =>
  v && v.trim() ? `${label}: ${v.trim().replace(/\s+/g, " ")}` : null;

interface SceneContext {
  readonly heading: string;
  readonly intExt: "interior" | "exterior" | "interior/exterior" | null;
  readonly time: string | null;
  readonly light: string | null;
  readonly seasons: readonly string[];
  readonly others: readonly string[];
  readonly action: string;
  /** Utseendet ressursen har i scenen (kontinuitet). */
  readonly appearance: string | null;
}

function sceneContext(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
  asset: Asset,
): SceneContext | null {
  const occ = s.occurrences[occurrenceId];
  const v = occ ? s.variants[occ.variantId] : undefined;
  if (!occ || !v) return null;
  const h = v.heading;
  const ie = h.intExt.toUpperCase();
  const intExt =
    ie.includes("INT") && ie.includes("EXT")
      ? "interior/exterior"
      : ie.includes("INT")
        ? "interior"
        : ie.includes("EXT")
          ? "exterior"
          : null;
  const tod = TIME_OF_DAY.find((t) => t.re.test(h.time));
  const blocks = blocksOfVariant(s, v.id);
  const actions = blocks.filter((b) => b.kind === "action").map((b) => b.text);
  const seasonSrc = seasonText(s, v.id);
  const seasons = SEASONS.filter((x) => x.re.test(seasonSrc)).map((x) => x.text);
  const others = assetsInScene(s, productionId, occurrenceId)
    .map((x) => x.asset)
    .filter((a) => a.id !== asset.id && (a.kind === "character" || a.kind === "animal"))
    .map((a) => a.name);
  const look = sceneContinuityVariant(s, asset.id, v.id);
  const lv = look ? s.assetVariants[look] : undefined;
  return {
    heading: [h.intExt, h.location, h.time].filter(Boolean).join(" "),
    intExt,
    time: tod?.time ?? null,
    light: tod?.light ?? null,
    seasons,
    others,
    action: excerpt(actions.slice(0, 2).join(" ")),
    appearance: lv ? [lv.name, lv.appearance].filter((x) => x.trim()).join(": ") : null,
  };
}

/** Godkjente figurer og steder i filmen (navn, variant, utseende) som bildet skal passe sammen med. */
function approvedDesigns(
  s: ProjectState,
  productionId: string,
  asset: Asset,
  occurrenceIds: readonly string[],
  purpose: ImagePurpose,
): string[] {
  // En bakgrunn skal ikke få figurer i seg: bare steder og miljøer som forbilde. En figur sammenlignes
  // med andre figurer og ting (stil, proporsjoner), ikke med stedene.
  const kinds: readonly Asset["kind"][] =
    purpose === "background"
      ? ["location", "environment"]
      : ["character", "animal", "object", "other"];
  const near = new Set<string>();
  for (const o of occurrenceIds)
    for (const x of assetsInScene(s, productionId, o))
      if (x.asset.id !== asset.id) near.add(x.asset.id);
  const out: string[] = [];
  for (const id of near) {
    const a = s.assets[id];
    if (!a || !kinds.includes(a.kind)) continue;
    const va = Object.values(s.assetVariants).find(
      (v) => v.assetId === id && v.approvedVersionId && !v.archived,
    );
    if (!va) continue;
    const desc = [va.appearance, a.description]
      .map((x) => x.trim())
      .filter(Boolean)
      .join("; ");
    out.push(
      `${a.name} (${KIND_TEXT[a.kind].replace(/^an? /, "")}, approved "${va.name}" design${desc ? ` – ${excerpt(desc, 140)}` : ""})`,
    );
    if (out.length >= 6) break;
  }
  return out;
}

/** Forbildebildene i stilprofilen som tekst (hva de viser). */
function referenceList(s: ProjectState, g: StyleGuide): string[] {
  return g.referenceVersionIds.flatMap((id) => {
    const v = s.assetVersions[id];
    const va = v ? s.assetVariants[v.variantId] : undefined;
    const a = va ? s.assets[va.assetId] : undefined;
    return a && va ? [`${a.name} – ${va.name} v${v!.number}`] : [];
  });
}

/** «Rev – Vinterpels v2 (an approved character design)». */
function versionLabel(s: ProjectState, versionId: string): string | null {
  const v = s.assetVersions[versionId];
  const va = v ? s.assetVariants[v.variantId] : undefined;
  const a = va ? s.assets[va.assetId] : undefined;
  if (!v || !va || !a) return null;
  return `${a.name} – ${va.name} v${v.number} (${KIND_TEXT[a.kind].replace(/^an? /, "")})`;
}

const isImage = (s: ProjectState, id: string) =>
  !!s.assetVersions[id]?.mimeType.startsWith("image/");

/**
 * Bildene som sendes med til bildemodellen (DEC-0066, Mars 11.10.2026: «bilder kan sendes og brukes»):
 * 1. dagens bilde av ressursen (hvis brukeren vil beholde utseendet), så
 * 2. filmens forbildebilder fra den visuelle stilen, og
 * 3. godkjente bilder av det som er i de samme scenene (bare steder for en bakgrunn, bare figurer og ting
 *    for en frilagt figur – stilen, ikke innholdet).
 * Høyst `MAX_ATTACHED_IMAGES`, bare bilder, ingen dubletter.
 */
export function attachedImages(
  s: ProjectState,
  input: {
    readonly assetId: string;
    readonly productionId: string;
    readonly occurrenceId?: string | null;
    /** Dagens bilde som skal beholdes (eller null). */
    readonly identityVersionId: string | null;
    /** Send filmens godkjente bilder med som stilforbilder. */
    readonly style: boolean;
  },
): AttachedImage[] {
  const asset = s.assets[input.assetId];
  if (!asset) return [];
  const out: AttachedImage[] = [];
  const seen = new Set<string>();
  const add = (id: string, role: AttachedImage["role"]) => {
    if (out.length >= MAX_ATTACHED_IMAGES || seen.has(id) || !isImage(s, id)) return;
    const v = s.assetVersions[id]!;
    const label = versionLabel(s, id);
    if (!label) return;
    seen.add(id);
    out.push({ versionId: id, path: v.mediaPath, mimeType: v.mimeType, role, label });
  };
  if (input.identityVersionId) add(input.identityVersionId, "identity");
  if (!input.style) return out;
  const purpose = IMAGE_PURPOSE_FOR_KIND[asset.kind];
  const ownVariants = new Set<string>(
    Object.values(s.assetVariants)
      .filter((v) => v.assetId === asset.id)
      .map((v) => v.id),
  );
  // Ressursens egne bilder sendes bare som «identity» (ellers kopierer modellen dem)
  const notOwn = (id: string) => !ownVariants.has(s.assetVersions[id]?.variantId ?? "");
  // Stilprofilen for ressurstypen (REQ-0148), ellers standardprofilen
  const g = styleProfileFor(s, asset.kind)?.guide;
  for (const id of g?.referenceVersionIds ?? []) if (notOwn(id)) add(id, "style");
  const kinds: readonly Asset["kind"][] =
    purpose === "background"
      ? ["location", "environment"]
      : ["character", "animal", "object", "other"];
  const scenes = scenesFor(s, { ...input, variantId: null, withReference: false }, asset);
  for (const o of scenes)
    for (const x of assetsInScene(s, input.productionId, o)) {
      if (x.asset.id === asset.id || !kinds.includes(x.asset.kind)) continue;
      const va = Object.values(s.assetVariants)
        .filter((v) => v.assetId === x.asset.id && v.approvedVersionId && !v.archived)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (va?.approvedVersionId) add(va.approvedVersionId, "style");
    }
  return out;
}

/**
 * Avsnittet som forteller bildemodellen hva hvert vedlagte bilde er (DEC-0066). Står i den automatiske
 * beskrivelsen, og byttes alltid ut med en fersk liste når bildet sendes (`withAttachedLegend`).
 */
export function describeAttached(assetName: string, attached: readonly AttachedImage[]): string {
  return [
    ATTACHED_HEAD,
    ...attached.map((a, i) =>
      a.role === "identity"
        ? `Image ${i + 1}: the current design of ${assetName} (${a.label}). This is the subject to draw – keep who it is.`
        : a.role === "view"
          ? `Image ${i + 1}: ${assetName} seen from another angle (${a.label}). The same subject – keep every detail consistent with it.`
          : `Image ${i + 1}: ${a.label}, an approved image from the film. Style reference only – match its drawing style, line quality, texture, colour treatment and level of detail; do not copy its subject, pose or composition, and do not put it in the new image.`,
    ),
    ...(attached.length
      ? [
          `Exactly ${attached.length} image(s) are attached. If the text above refers to images differently, this list is what counts.`,
        ]
      : []),
  ].join("\n");
}

const ATTACHED_HEAD = "ATTACHED IMAGES";
const ATTACHED_SECTION =
  /(?:^|\n+)ATTACHED IMAGES\n(?:(?:Image \d+:|Exactly \d+ image)[^\n]*(?:\n|$))*/g;

/** Beskrivelsen uten avsnittet om vedlagte bilder. */
export function stripAttachedSection(prompt: string): string {
  return prompt
    .replace(ATTACHED_SECTION, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Beskrivelsen slik den sendes (DEC-0066): et gammelt bildeavsnitt fjernes, og en fersk liste over bildene
 * som faktisk sendes, legges til til slutt. Er det for langt, kortes selve beskrivelsen – aldri listen.
 */
export function withAttachedLegend(
  prompt: string,
  assetName: string,
  attached: readonly AttachedImage[],
  max = MAX_PROMPT_CHARS,
): string {
  const body = stripAttachedSection(prompt);
  if (!attached.length) return body.slice(0, max);
  const legend = describeAttached(assetName, attached);
  const room = Math.max(0, max - legend.length - 2);
  let cut = body.length > room ? body.slice(0, room) : body;
  // Ikke del et tegn som består av to UTF-16-enheter
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}\n\n${legend}`.slice(0, max);
}

/** Scenene bildet skal passe i: valgt scene først, så de første aktive scenene der ressursen er med. */
function scenesFor(s: ProjectState, input: ContextPromptInput, asset: Asset): string[] {
  const uses = (allAssetUsage(s, input.productionId).get(asset.id) ?? []).filter((u) => u.active);
  const ids = uses.map((u) => u.occurrenceId);
  const first = input.occurrenceId && s.occurrences[input.occurrenceId] ? [input.occurrenceId] : [];
  return [...new Set([...first, ...ids])].slice(0, 3);
}

/** Fakta fra faktaarket: én per linje (eller semikolon), uten punkttegn. */
export function visualBriefFacts(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\n|;\s+/)
    .map((x) => x.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 16);
}

/**
 * Bestillingen for et bilde av ressursen (DEC-0080): alt prosjektet vet, ordnet og renset for motsigelser.
 * Se `brief.ts` for reglene og hvordan den gjøres om til tekst for hver modell.
 */
export function buildContextImageBrief(
  s: ProjectState,
  input: ContextPromptInput,
): ImageBrief | null {
  const asset = s.assets[input.assetId];
  if (!asset) return null;
  const variant: AssetVariant | null = input.variantId
    ? (s.assetVariants[input.variantId] ?? null)
    : null;
  const purpose: ImagePurpose = IMAGE_PURPOSE_FOR_KIND[asset.kind];
  const g = styleProfileFor(s, asset.kind)?.guide ?? null;
  const task: BriefTask = input.task ?? (purpose === "background" ? "background" : "design");
  const attached = input.attached ?? [];

  // Motivet: faktaarket først; ellers beskrivelsen og manusets handlingslinjer (ikke replikker)
  const facts = visualBriefFacts(asset.visualBrief);
  const notes = facts.length
    ? []
    : [
        ...(asset.description.trim() ? [excerpt(asset.description, 300)] : []),
        ...scriptMentions(s, input.productionId, asset, 4, 600)
          .filter((m) => !m.dialogue)
          .map((m) => m.text),
      ].slice(0, 3);

  // Scenene (bakgrunner: sted, tid, årstid og lys; figurer: bare utseendet i valgt scene)
  const sceneIds = scenesFor(s, input, asset);
  const contexts = sceneIds
    .map((id) => sceneContext(s, input.productionId, id, asset))
    .filter((x): x is SceneContext => !!x);
  const main = contexts[0] ?? null;
  const chosen = !!input.occurrenceId && sceneIds[0] === input.occurrenceId;
  const times = [...new Set(contexts.map((c) => c.time).filter(Boolean))];
  const seasons = [...new Set(contexts.flatMap((c) => c.seasons))];
  let setting: string | null = null;
  let lighting =
    "soft, even, neutral light that shows the design clearly, without dramatic shadows";
  if (purpose === "background") {
    setting = main
      ? `${main.intExt ? cap(main.intExt) : "Setting"}${main.time ? `, ${main.time}` : ""}${seasons.length ? `, ${seasons.join(", ")}` : ""}`
      : seasons.length
        ? `Season: ${seasons.join(", ")}`
        : null;
    lighting =
      main?.light && (chosen || times.length <= 1)
        ? main.light
        : times.length > 1
          ? `neutral, even light that works at different times of day (${times.join(", ")})`
          : g?.lighting.trim() || "natural light that suits the place";
  }
  const appearance =
    [variant?.appearance.trim(), purpose === "cutout" && chosen ? main?.appearance : null]
      .filter((x): x is string => !!x && !!x.trim())
      .join("; ") || null;

  // Referansebildene med roller
  const references = attached.map((a, i) => ({
    index: i + 1,
    role: a.role,
    label: a.label,
    ...(a.view ? { view: a.view } : {}),
  }));

  const variantStyle = variant ? STYLE_TEXT[variant.style] : STYLE_TEXT.animatic;
  const film = [
    g?.premise.trim() ? `The film: ${firstSentence(g.premise)}` : "",
    g?.audience.trim() ? `Audience and tone: ${firstSentence(g.audience)}` : "",
    g?.mood.trim() ? `Mood: ${firstSentence(g.mood)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    task,
    purpose,
    subject: { name: asset.name, kind: asset.kind, facts, notes, appearance },
    views: task === "background" ? [] : (input.views ?? ["three_quarter"]),
    style: briefStyle(g, purpose, variantStyle),
    film,
    setting,
    moodExcerpt: purpose === "background" && main?.action ? main.action : null,
    lighting,
    composition:
      purpose === "background"
        ? g?.composition.trim() || "Eye-level wide shot."
        : "Centred, the whole subject visible with a margin on all sides.",
    transparent: !!input.transparent && purpose !== "background",
    references,
    avoid: (g?.avoid ?? "")
      .split(/[,;\n]/)
      .map((x) => x.trim().replace(/\.$/, ""))
      .filter(Boolean),
    instructions: g?.instructions.trim() ?? "",
    keepReference: input.withReference && !attached.length,
  };
}

const cap = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);
const firstSentence = (t: string) => {
  const x = t.replace(/\s+/g, " ").trim();
  const m = /^(.{20,300}?[.!?])(\s|$)/.exec(x);
  return m ? m[1]! : x.length > 300 ? `${x.slice(0, 297)}…` : sentenceEnd(x);
};
const sentenceEnd = (t: string) => (/[.!?…]$/.test(t) ? t : `${t}.`);

/**
 * Bildebeskrivelsen med sammenheng, i formen den valgte modellen forstår best (DEC-0080). Brukeren ser og
 * kan endre den før noe sendes.
 */
export function buildContextImagePrompt(s: ProjectState, input: ContextPromptInput): string {
  const brief = buildContextImageBrief(s, input);
  if (!brief) return "";
  const asset = s.assets[input.assetId]!;
  const { prompt } = renderBrief(brief, input.family ?? "narrative");
  const attached = input.attached ?? [];
  // Listen over bildene som sendes (byttes alltid ut med en fersk liste ved sending)
  return attached.length ? `${prompt}\n\n${describeAttached(asset.name, attached)}` : prompt;
}

/** Har prosjektet en utfylt visuell stil (ellers foreslås det å lage en)? */
export function hasStyleGuide(s: ProjectState): boolean {
  const g = defaultStyleProfile(s)?.guide;
  return !!g && [g.premise, g.visualStyle, g.technique, g.world].some((x) => x.trim().length > 0);
}

/**
 * Utkast til filmens visuelle stil fra prosjektet (engelsk), som brukeren fyller ut og endrer:
 * verden fra scenehodene (steder, tider, årstid), stil fra variantene som brukes mest, og fargene fra
 * en plakat hvis det finnes en.
 */
export function suggestStyleGuide(s: ProjectState, productionId: string): StyleGuide {
  const occs = orderedOccurrences(s, productionId).filter((o) => o.active);
  const locs = new Map<string, number>();
  const times = new Map<string, number>();
  let text = "";
  for (const o of occs) {
    const v = s.variants[o.variantId];
    if (!v) continue;
    const loc = v.heading.location.split(/\s+[-–]\s+/)[0]!.trim();
    if (loc) locs.set(loc, (locs.get(loc) ?? 0) + 1);
    const t = TIME_OF_DAY.find((x) => x.re.test(v.heading.time))?.time;
    if (t) times.set(t, (times.get(t) ?? 0) + 1);
    text += ` ${seasonText(s, v.id)}`;
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);
  const seasons = SEASONS.filter((x) => x.re.test(text)).map((x) => x.text);
  const styles = new Map<string, number>();
  for (const va of Object.values(s.assetVariants))
    if (!va.archived) styles.set(va.style, (styles.get(va.style) ?? 0) + 1);
  const style = (top(styles, 1)[0] ?? "animatic") as keyof typeof STYLE_TEXT;
  const poster = Object.values(s.posters).find((p) => !p.removed);
  const pal = poster?.document.palette;
  const logline = poster?.document.logline.en.trim() || "";
  return {
    version: 1,
    premise: logline,
    world: [
      top(locs, 5).length ? `Main locations: ${top(locs, 5).join(", ")} (from the script)` : "",
      seasons.length ? `Season and atmosphere: ${seasons.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". "),
    audience: "",
    visualStyle: STYLE_TEXT[style],
    technique: "",
    palette: pal
      ? {
          colors: [pal.background, pal.text, pal.accent, pal.muted],
          description: `${pal.name} palette`,
        }
      : { colors: [], description: "" },
    lighting: top(times, 2).length
      ? `Most scenes take place in the ${top(times, 2).join(" and ")}.`
      : "",
    mood: "",
    characterDesign: "",
    environmentDesign: "",
    composition: "",
    avoid: "Photorealism, 3D rendering, text, logos, watermarks.",
    instructions: "",
    referenceVersionIds: Object.values(s.assetVariants)
      .filter((v) => {
        const a = s.assets[v.assetId];
        const ver = v.approvedVersionId ? s.assetVersions[v.approvedVersionId] : undefined;
        return !v.archived && a && !a.archived && !a.removed && ver?.mimeType.startsWith("image/");
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 4)
      .map((v) => v.approvedVersionId!),
  };
}

/** Tid på døgnet i en tekst (scenehodets tid), eller null. Eksportert for test. */
export function detectTimeOfDay(text: string): string | null {
  return TIME_OF_DAY.find((t) => t.re.test(text))?.time ?? null;
}

/** Årstid og vær i en tekst. Eksportert for test. */
export function detectSeasons(text: string): string[] {
  return SEASONS.filter((x) => x.re.test(text)).map((x) => x.text);
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Setningene i manuset der ressursen nevnes (handling, og replikker der andre omtaler den), i
 * fortellingsrekkefølge (DEC-0079): «AI bildegenereringsteksten bør basere seg på manuset og forståelsen av
 * objektet slik det står beskrevet i manus». Første forekomst først; høyst `max` utdrag og `maxChars` tegn.
 */
export function scriptMentions(
  s: ProjectState,
  productionId: string,
  asset: Pick<Asset, "name" | "names">,
  max = 6,
  maxChars = 1200,
): { readonly text: string; readonly dialogue: boolean; readonly speaker: string }[] {
  const names = assetNames(asset)
    .map((n) => n.trim())
    .filter((n) => n.length >= 2);
  if (!names.length) return [];
  // Hele ord, uavhengig av store og små bokstaver (også æ, ø, å)
  const re = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${names.map(escapeRe).join("|")})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
  const out: { text: string; dialogue: boolean; speaker: string }[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const o of orderedOccurrences(s, productionId)) {
    if (!o.active) continue;
    let speaker = "";
    for (const b of blocksOfVariant(s, o.variantId)) {
      if (b.kind === "character") speaker = b.text.trim();
      if (b.kind !== "action" && b.kind !== "dialogue") continue;
      // Egne replikker beskriver sjelden utseendet; andres omtale tas med
      if (b.kind === "dialogue" && re.test(speaker)) continue;
      for (const sentence of b.text.replace(/\s+/g, " ").split(/(?<=[.!?…])\s+/)) {
        const t = sentence.trim();
        if (!t || !re.test(t)) continue;
        const key = t.toLocaleLowerCase("nb");
        if (seen.has(key)) continue;
        const cut = t.length > 300 ? `${t.slice(0, 297)}…` : t;
        if (total + cut.length > maxChars) return out;
        seen.add(key);
        total += cut.length;
        out.push({ text: cut, dialogue: b.kind === "dialogue", speaker });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

/**
 * Bildene som sendes med når andre vinkler lages (DEC-0080): bildet brukeren står i (identitet) først, så
 * bilder av samme motiv med merket vinkel (høyst 3), så noen få stilforbilder fra filmen (høyst 2).
 * Rekkefølgen er den modellen får dem i.
 */
export function turnaroundAttachments(
  s: ProjectState,
  input: {
    readonly assetId: string;
    readonly productionId: string;
    readonly identityVersionId: string;
    /** Vinkler som allerede er laget i denne omgangen (sendes med som «view», nyeste sist). */
    readonly extraViews?: readonly { readonly versionId: string; readonly view: VersionView }[];
    readonly style: boolean;
  },
): AttachedImage[] {
  const out: AttachedImage[] = [];
  const seen = new Set<string>();
  const add = (id: string, role: AttachedImage["role"], view?: VersionView) => {
    if (out.length >= MAX_ATTACHED_IMAGES || seen.has(id) || !isImage(s, id)) return;
    const v = s.assetVersions[id];
    const label = versionLabel(s, id);
    if (!v || !label) return;
    seen.add(id);
    const shown = view ?? v.view;
    out.push({
      versionId: id,
      path: v.mediaPath,
      mimeType: v.mimeType,
      role,
      label:
        shown && role !== "style"
          ? `${label}, ${VERSION_VIEW_PROMPT[shown].split(" – ")[0]}`
          : label,
      ...(shown ? { view: shown } : {}),
    });
  };
  add(input.identityVersionId, "identity");
  // Det som er laget i denne omgangen veier mest (nyeste først), så merkede bilder fra før
  for (const x of [...(input.extraViews ?? [])].reverse().slice(0, 3))
    add(x.versionId, "view", x.view);
  for (const x of labelledViews(s, input.assetId)) {
    if (out.filter((a) => a.role === "view").length >= 3) break;
    if (x.view !== "sheet") add(x.version.id, "view");
  }
  if (input.style) {
    const styles = attachedImages(s, {
      assetId: input.assetId,
      productionId: input.productionId,
      identityVersionId: null,
      style: true,
    }).slice(0, 2);
    for (const a of styles) add(a.versionId, "style");
  }
  return out;
}

// ---------- Variasjoner og deler av et bilde (Mars 15.10.2026) ----------

/** Stilen i korte ord fra bestillingen (til variasjoner og deler). */
function briefStyleLine(b: ImageBrief): string {
  const s = b.style;
  return [s.look, s.technique, s.design]
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .concat(s.colours.length ? [`colours ${s.colours.join(", ")}`] : [])
    .join("; ");
}

/** «image 1», «images 2 and 3». */
function imagesText(ix: readonly number[]): string {
  if (ix.length === 1) return `image ${ix[0]}`;
  return `images ${ix.slice(0, -1).join(", ")} and ${ix[ix.length - 1]}`;
}

function backgroundLine(b: ImageBrief, keep: boolean): string {
  if (keep) return "Keep the same background as in the original image.";
  return b.transparent
    ? "Transparent background, nothing else in the image."
    : "Plain, flat, pure white background, nothing else in the image: no ground, no shadows, no scenery.";
}

/**
 * Beskrivelsen for «Lag variasjoner» (Mars 15.10.2026: «for en dør f.eks så ønsker jeg den åpen»): bildet
 * brukeren står i er forbildet (identitet); bare det brukeren ber om endres – identitet, stil, vinkel og
 * utsnitt beholdes. Engelsk, som alle AI-beskrivelser. `change` er brukerens egen tekst (kan være norsk).
 */
export function buildVariationPrompt(
  b: ImageBrief,
  change: string,
  opts: { readonly index: number; readonly count: number; readonly family: PromptFamily },
): { readonly prompt: string; readonly negative: string | null } {
  const what = change.trim().replace(/\s+/g, " ");
  const noun = KIND_TEXT[b.subject.kind].replace(/^an? /, "");
  const id = b.references.filter((r) => r.role === "identity").map((r) => r.index);
  const style = b.references.filter((r) => r.role === "style").map((r) => r.index);
  const src = id.length ? imagesText(id) : "the attached image";
  const keepBg = b.purpose === "background";
  const variation =
    opts.count > 1
      ? `This is variation ${opts.index + 1} of ${opts.count}: interpret the change in your own way, a little differently from the other variations.`
      : "";
  if (opts.family === "compact") {
    const lines = [
      `Edit ${src}: ${b.subject.name} (${noun}).`,
      `Change only this (the user's words, may be Norwegian): "${what}".`,
      "Keep exactly the same: identity, design, proportions, colours, materials, line quality, drawing style, camera angle, framing and scale.",
      style.length ? `Style: match ${imagesText(style)} (style only).` : "",
      briefStyleLine(b) ? `Style: ${briefStyleLine(b)}.` : "",
      backgroundLine(b, keepBg),
      variation,
    ].filter(Boolean);
    return {
      prompt: lines.join("\n"),
      negative: [
        "different subject",
        "different style",
        "different angle",
        "extra objects",
        "text",
        "letters",
        "logos",
        "watermarks",
        "blurry",
        "deformed",
      ].join(", "),
    };
  }
  const out = [
    `Make a variation of ${b.subject.name}, ${KIND_TEXT[b.subject.kind]} in a 2D animated film, using ${src} as the original.`,
    `The only thing that should be different (the user's own words, may be in Norwegian): "${what}". Make this change clearly and naturally for this subject.`,
    "Keep everything else exactly as in the original: the same subject and identity, design, proportions, colours, materials, line quality, drawing style, level of detail, camera angle, framing and scale. Do not add anything else and do not redesign it.",
    style.length
      ? `Match the drawing style of ${imagesText(style)} (style references only; do not copy their subjects).`
      : "",
    briefStyleLine(b) ? `Style: ${briefStyleLine(b)}.` : "",
    backgroundLine(b, keepBg),
    variation,
    "Leave out: text, letters, logos, watermarks.",
    b.instructions.trim() ? `Project instructions (always follow): ${b.instructions.trim()}` : "",
  ].filter(Boolean);
  return { prompt: out.join("\n\n"), negative: null };
}

/**
 * Beskrivelsen for én del av et bilde som eget objekt (Mars 15.10.2026: «en dørramme og et dørblad … ulike
 * objekter slik at en kan animere at den åpner seg»): bare delen tegnes, hel og alene, i samme stil, vinkel
 * og målestokk som originalen, på gjennomsiktig eller ensfarget bakgrunn.
 */
export function buildPartPrompt(
  b: ImageBrief,
  part: string,
  others: readonly string[],
  family: PromptFamily,
): { readonly prompt: string; readonly negative: string | null } {
  const name = part.trim().replace(/\s+/g, " ");
  const rest = others.map((o) => o.trim()).filter((o) => o && o !== name);
  const id = b.references.filter((r) => r.role === "identity").map((r) => r.index);
  const style = b.references.filter((r) => r.role === "style").map((r) => r.index);
  const src = id.length ? imagesText(id) : "the attached image";
  const restText = rest.length ? ` Do not draw the other parts (${rest.join(", ")}).` : "";
  const bg = b.transparent
    ? "Transparent background, nothing else in the image."
    : "Plain, flat, pure white background, nothing else in the image: no ground, no shadows, no scenery.";
  if (family === "compact")
    return {
      prompt: [
        `From ${src} (${b.subject.name}), draw only this part as a separate piece: "${name}" (the user's words, may be Norwegian).${restText}`,
        "Same drawing style, colours, proportions, camera angle and scale as the original; the part complete and whole, including what is hidden behind other parts in the original.",
        style.length ? `Style: match ${imagesText(style)} (style only).` : "",
        briefStyleLine(b) ? `Style: ${briefStyleLine(b)}.` : "",
        bg,
      ]
        .filter(Boolean)
        .join("\n"),
      negative: [
        "other parts",
        "whole object",
        "scenery",
        "text",
        "letters",
        "logos",
        "watermarks",
        "cast shadow",
        "blurry",
      ].join(", "),
    };
  return {
    prompt: [
      `Using ${src} of ${b.subject.name} as the reference, draw only one part of it as a separate piece for cut-out animation: "${name}" (the user's own words, may be in Norwegian).${restText}`,
      "Draw the part complete and whole – including anything that is hidden behind other parts in the original – seen from the same camera angle, with the same drawing style, colours, materials, proportions and scale as in the original, so it fits exactly back into place.",
      style.length
        ? `Match the drawing style of ${imagesText(style)} (style references only; do not copy their subjects).`
        : "",
      briefStyleLine(b) ? `Style: ${briefStyleLine(b)}.` : "",
      `${bg} Centred, with a small empty margin on all sides.`,
      "Leave out: text, letters, logos, watermarks.",
      b.instructions.trim() ? `Project instructions (always follow): ${b.instructions.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    negative: null,
  };
}
