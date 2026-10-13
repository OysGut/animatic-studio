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
}

/** Et bilde som sendes med til bildemodellen (DEC-0066). */
export interface AttachedImage {
  readonly versionId: string;
  readonly path: string;
  readonly mimeType: string;
  /** «identity»: bildet som skal endres/beholdes; «style»: forbilde for stilen bare. */
  readonly role: "identity" | "style";
  /** Hva bildet viser (engelsk beskrivelse til modellen). */
  readonly label: string;
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
    re: word("skumring(?:en)?|dusk|tussmørke(?:t)?|solnedgang(?:en)?|sunset"),
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
      "snø(?:en|r|stormen|storm|fnugg)?|snødekt\\p{L}*|vinter(?:en)?|frost(?:en)?|snow\\p{L}*|winter",
    ),
    text: "winter, snow",
  },
  { re: word("regn(?:et|er)?|rain(?:ing|y)?"), text: "rain" },
  { re: word("sommer(?:en)?|summer"), text: "summer" },
  { re: word("høst(?:en)?|autumn"), text: "autumn" },
  { re: word("våren|vårsol(?:en)?"), text: "spring" },
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

/**
 * Bildebeskrivelsen med sammenheng. Brukeren ser og kan endre den før noe sendes.
 */
export function buildContextImagePrompt(s: ProjectState, input: ContextPromptInput): string {
  const asset = s.assets[input.assetId];
  if (!asset) return "";
  const variant: AssetVariant | null = input.variantId
    ? (s.assetVariants[input.variantId] ?? null)
    : null;
  const purpose: ImagePurpose = IMAGE_PURPOSE_FOR_KIND[asset.kind];
  const profile = styleProfileFor(s, asset.kind);
  const g = profile?.guide ?? null;
  const prod = s.productions[input.productionId];
  const title = prod && prod.kind !== "main" ? `${s.project.name} – ${prod.name}` : s.project.name;
  const out: string[] = [];
  const section = (head: string, lines: (string | null)[]) => {
    const l = lines.filter((x): x is string => !!x);
    if (l.length) out.push(`${head}\n${l.join("\n")}`);
  };

  // 1. Filmen
  section("FILM", [
    `A 2D animated film called "${title}".`,
    line("Story", g?.premise),
    line("World", g?.world),
    line("Audience and tone", g?.audience),
  ]);

  // 2. Visuell stil
  const variantStyle = variant ? STYLE_TEXT[variant.style] : STYLE_TEXT.animatic;
  const palette = g
    ? [
        g.palette.description.trim(),
        g.palette.colors.length ? `key colours ${g.palette.colors.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ")
    : "";
  section("VISUAL STYLE", [
    line("Overall look", g?.visualStyle) ?? `Overall look: ${variantStyle}.`,
    g?.visualStyle && variant && g.visualStyle.trim() !== variantStyle
      ? `This version of the design: ${variantStyle}.`
      : null,
    line("Technique and materials", g?.technique),
    line("Colour palette", palette),
    line("Lighting", g?.lighting),
    line("Mood", g?.mood),
    line(
      purpose === "cutout" ? "Character and prop design" : "Environment design",
      purpose === "cutout" ? g?.characterDesign : g?.environmentDesign,
    ),
    line("Composition and camera language", g?.composition),
  ]);

  // 3. Dette bildet
  const purposeText =
    purpose === "cutout"
      ? "Use: a separate cut-out layer in a multiplane 2D scene. Full figure, centred, three-quarter view facing slightly towards the camera, on a transparent background, no ground shadow, no frame, no text."
      : "Use: the background layer of a scene. Wide establishing view filling the whole frame, leave readable open space where characters will stand, no characters, no text.";
  section("THIS IMAGE", [
    `Design ${KIND_TEXT[asset.kind]}: ${asset.name}.`,
    line("Description (from the production, may be in Norwegian)", asset.description),
    variant ? line(`Version "${variant.name}"`, variant.appearance) : null,
    asset.tags.length ? `Keywords: ${asset.tags.join(", ")}.` : null,
    purposeText,
  ]);

  // 3b. Slik manuset beskriver ressursen (Mars 2026-10-13, DEC-0079)
  const said = scriptMentions(s, input.productionId, asset);
  if (said.length)
    section("IN THE SCREENPLAY", [
      `How the script describes ${asset.name} (Norwegian excerpts, in story order – follow them):`,
      ...said.map((x) => `- ${x.dialogue ? `${x.speaker} says: ` : ""}"${x.text}"`),
    ]);

  // 4. Hvor bildet brukes
  const sceneIds = scenesFor(s, input, asset);
  const contexts = sceneIds
    .map((id) => sceneContext(s, input.productionId, id, asset))
    .filter((x): x is SceneContext => !!x);
  if (contexts.length) {
    const main = contexts[0]!;
    const lines: string[] = [];
    const chosen = input.occurrenceId && sceneIds[0] === input.occurrenceId;
    lines.push(
      `${chosen ? "Made for the scene" : "Appears in"}: ${contexts.map((c) => c.heading).join(" · ")} (scene headings, Norwegian).`,
    );
    const times = [...new Set(contexts.map((c) => c.time).filter(Boolean))];
    const seasons = [...new Set(contexts.flatMap((c) => c.seasons))];
    if (main.intExt)
      lines.push(
        `Setting: ${main.intExt}${main.time ? `, ${main.time}` : ""}${seasons.length ? `, ${seasons.join(", ")}` : ""}.`,
      );
    else if (seasons.length) lines.push(`Season: ${seasons.join(", ")}.`);
    // Lyset fra scenen bare når bildet lages til én scene (eller alle scenene har samme tid på døgnet);
    // ellers nøytralt lys, så bildet kan brukes i alle
    if (purpose === "background" && main.light && (chosen || times.length <= 1))
      lines.push(`Scene lighting: ${main.light}.`);
    else if (times.length > 1)
      lines.push(
        `It must work at different times of day (${times.join(", ")}); use neutral, even light.`,
      );
    if (main.action)
      lines.push(
        `What happens, for mood only – do not draw ${purpose === "background" ? "the characters" : "other characters or the surroundings"} (script excerpt, Norwegian): "${main.action}"`,
      );
    if (purpose === "cutout" && main.appearance && chosen)
      lines.push(`In this scene ${asset.name} appears as: ${main.appearance}.`);
    section("WHERE IT APPEARS", lines);
  }

  // 5. Sammenheng med godkjente bilder
  const designs = approvedDesigns(s, input.productionId, asset, sceneIds, purpose);
  const refs = g ? referenceList(s, g) : [];
  const own = coverVersion(s, asset.id);
  const attached = input.attached ?? [];
  const identity = attached.find((a) => a.role === "identity");
  const styleImgs = attached.filter((a) => a.role === "style");
  section("CONSISTENCY", [
    designs.length
      ? `Must match the style of these approved ${purpose === "background" ? "locations" : "designs"} in the film (style only – do not include them): ${designs.join("; ")}.`
      : null,
    refs.length && !styleImgs.length
      ? `The film's look is set by these approved designs (style only): ${refs.join(", ")}.`
      : null,
    identity || (input.withReference && !attached.length)
      ? `Keep the identity, proportions, colours and clothing of ${identity ? `${asset.name} in image 1` : "the attached reference image"}; change only what is described above.`
      : own && purpose === "cutout"
        ? `Stay consistent with the existing design of ${asset.name}.`
        : null,
    "Same line quality, level of detail and colour treatment as the rest of the film.",
  ]);

  // 6. Bildene som sendes med (DEC-0066)
  if (attached.length) out.push(describeAttached(asset.name, attached));

  // 7. Unngå
  section("AVOID", [
    g?.avoid.trim() ? g.avoid.trim().replace(/\s+/g, " ") : null,
    purpose === "cutout"
      ? "No background scenery, no other characters, no text, logos or watermarks."
      : "No characters or people, no text, signs with words, logos or watermarks.",
  ]);

  if (g?.instructions.trim()) section("PROJECT INSTRUCTIONS", [g.instructions.trim()]);
  return out.join("\n\n");
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
