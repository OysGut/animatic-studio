/**
 * Kontinuitet for karakterer og ressurser (M6 del 2, DEC-0055, mandat kap. 19, REQ-0150–0165, REQ-0496).
 *
 * En kontinuitetshendelse sier at utseendet til en karakter (eller en annen ressurs) endres på et bestemt
 * sted i historien: scenen og eventuelt manuslinjen der det skjer, utseendet før og etter (visuelle
 * varianter) og hvor lenge det varer:
 * - «permanent»: for godt (til en senere hendelse endrer utseendet igjen), f.eks. Maja klipper håret;
 * - «temporary»: til en bestemt scene (der er det over), f.eks. bandasje til scene 30;
 * - «scene»: bare i denne scenen, f.eks. snø i håret.
 *
 * Hvilket utseende som gjelder, regnes ut fra FORTELLINGSTIDEN (storyTimes), ikke rekkefølgen scenene vises
 * eller produseres i (REQ-0152/0160/0165): et tilbakeblikk til før hårklippet får langt hår selv om det
 * vises etter. Forslag fra manuset er bare forslag til brukeren har godkjent dem (REQ-0157/0158); avviste
 * forslag lagres som avvist, så de ikke foreslås igjen.
 *
 * Alt her er ren TypeScript uten nettleser-API.
 */
import type {
  Asset,
  AssetVariant,
  CompositionLayer,
  ContinuityDuration,
  ContinuityEvent,
  ContinuityKind,
  ProjectState,
  ScriptBlock,
} from "../model";
import { compareKeys } from "../order-key";
import { blocksOfVariant, orderedOccurrences, storyTimes } from "../views";
import { mentions } from "../screenplay/filter";
import { assetNames, coverVersion, nameKey } from "../library";

export const CONTINUITY_KIND_LABEL: Record<ContinuityKind, string> = {
  haircut: "Hårklipp / frisyre",
  hair_color: "Hårfarge",
  costume: "Kostyme / klær",
  injury: "Skade / bandasje",
  scar: "Arr",
  dirt: "Skitt",
  snow_water: "Snø / vann",
  beard: "Skjegg",
  aging: "Alder",
  carried_object: "Gjenstand den bærer",
  other: "Annen forandring",
};

export const CONTINUITY_DURATION_LABEL: Record<ContinuityDuration, string> = {
  permanent: "For godt",
  temporary: "Til en bestemt scene",
  scene: "Bare denne scenen",
};

/** Engelsk ord for typen (brukes i beskrivelsen til AI-generering). */
const KIND_EN: Record<ContinuityKind, string> = {
  haircut: "haircut",
  hair_color: "hair colour",
  costume: "costume",
  injury: "injury",
  scar: "scar",
  dirt: "dirt",
  snow_water: "snow/water",
  beard: "beard",
  aging: "age",
  carried_object: "carried object",
  other: "appearance",
};
export function continuityKindEnglish(k: ContinuityKind): string {
  return KIND_EN[k];
}

/** Ressurstyper som kan ha kontinuitet (utseende som endres i historien). */
export function hasContinuity(a: Pick<Asset, "kind">): boolean {
  return a.kind !== "sound" && a.kind !== "location" && a.kind !== "environment";
}

// ---------- Plassering i fortellingstiden ----------

/** Et sted i historien: scenens fortellingstid og (valgfritt) manuslinjen i scenen. */
interface StoryPoint {
  readonly sceneId: string;
  readonly time: number;
  /** Plassen i hovedfilmen (skiller scener med samme fortellingstid, f.eks. tilbakeblikk uten forskyvning). */
  readonly idx: number;
  /** Rekkefølgenøkkel til linjen; null = scenens begynnelse. */
  readonly orderKey: string | null;
}

interface Rank {
  readonly times: Map<string, number>;
  readonly idx: Map<string, number>;
  /** Scener som er aktive i hovedfilmen. */
  readonly active: Set<string>;
}

const rankCache = new WeakMap<object, Rank>();

// ---------- Kontinuitet per produksjon (DEC-0060, REQ-0166/0167) ----------

/** Tilstander som viser kontinuiteten slik den er i en avledet produksjon. */
const viewProduction = new WeakMap<object, string>();
const productionViews = new WeakMap<object, Map<string, ProjectState>>();

/**
 * Tilstanden slik kontinuiteten er i en produksjon: en avledet produksjon arver hovedfilmens hendelser,
 * unntatt de som er slått av der, og har i tillegg sine egne lokale hendelser. Scenene som bare finnes i
 * produksjonen, er med i historien. Hovedfilmen (og ukjent produksjon) gir tilstanden uendret. Bare til
 * beregning – endringer gjøres på den egentlige tilstanden.
 */
export function continuityFor(
  s: ProjectState,
  productionId: string | null | undefined,
): ProjectState {
  const p = productionId ? s.productions[productionId] : undefined;
  if (!p || p.kind === "main") return s;
  let m = productionViews.get(s);
  if (!m) productionViews.set(s, (m = new Map()));
  let v = m.get(p.id);
  if (!v) {
    v = { ...s };
    viewProduction.set(v, p.id);
    m.set(p.id, v);
  }
  return v;
}

/** Produksjonen kontinuiteten beregnes for (null = hovedfilmen). */
export function continuityProduction(s: ProjectState): string | null {
  return viewProduction.get(s) ?? null;
}

/**
 * Kontinuiteten for en scenevariant: en variant som tilhører en avledet produksjon, bruker den produksjonens
 * kontinuitet (lokale hendelser og hendelser som er slått av der).
 */
export function continuityForVariant(
  s: ProjectState,
  variantId: string | null | undefined,
): ProjectState {
  const owner = variantId ? s.variants[variantId]?.ownerProductionId : null;
  return owner ? continuityFor(s, owner) : s;
}

function rankOf(s: ProjectState): Rank {
  let r = rankCache.get(s);
  if (!r) {
    const idx = new Map<string, number>();
    const main = Object.values(s.productions).find((p) => p.kind === "main");
    const mainOccs = main ? orderedOccurrences(s, main.id) : [];
    mainOccs.forEach((o, i) => {
      if (!idx.has(o.sceneId)) idx.set(o.sceneId, i);
    });
    // Scener som er med i hovedfilmen (kontinuiteten følger hovedfilmens historie; uten hovedfilm: alle)
    const active = new Set<string>();
    for (const o of Object.values(s.occurrences))
      if (o.active && (!main || o.productionId === main.id)) active.add(o.sceneId);
    // En avledet produksjon: scenene som bare finnes der, er også med (etter hovedfilmens)
    const vp = viewProduction.get(s);
    if (vp)
      orderedOccurrences(s, vp).forEach((o, i) => {
        if (o.active) active.add(o.sceneId);
        if (!idx.has(o.sceneId)) idx.set(o.sceneId, mainOccs.length + i);
      });
    r = { times: storyTimes(s), idx, active };
    rankCache.set(s, r);
  }
  return r;
}

/** Fortellingstiden per scene, beregnet én gang per tilstand. */
export function storyTimesCached(s: ProjectState): Map<string, number> {
  return rankOf(s).times;
}

/**
 * Scenen hendelsen skjer i. Er den knyttet til en manuslinje, følger den linjen (også når scenen er delt
 * eller slått sammen og linjen har flyttet til en annen scene).
 */
export function eventSceneId(s: ProjectState, e: Pick<ContinuityEvent, "sceneId" | "blockId">) {
  const b = e.blockId ? s.blocks[e.blockId] : undefined;
  return (b && s.variants[b.variantId]?.sceneId) || e.sceneId;
}

/**
 * Gjelder hendelsen? Godkjent, ikke fjernet, og scenen den skjer i er med i filmen (en hendelse i en
 * deaktivert scene gjelder ikke – scenen er tatt ut av historien).
 */
export function eventApplies(s: ProjectState, e: ContinuityEvent): boolean {
  if (e.removed || e.status !== "approved") return false;
  // Lokale hendelser gjelder bare i sin produksjon; arvede kan være slått av (DEC-0060)
  const vp = viewProduction.get(s) ?? null;
  if (e.productionId && e.productionId !== vp) return false;
  if (!e.productionId && vp && e.disabledIn?.includes(vp as never)) return false;
  return rankOf(s).active.has(eventSceneId(s, e));
}

function pointOf(s: ProjectState, sceneId: string, blockId: string | null): StoryPoint {
  const r = rankOf(s);
  const b = blockId ? s.blocks[blockId] : undefined;
  return {
    sceneId,
    time: r.times.get(sceneId) ?? 0,
    idx: r.idx.get(sceneId) ?? Number.MAX_SAFE_INTEGER,
    orderKey: b ? b.orderKey : null,
  };
}

/** Hendelsens sted. Skjer den ved scenens første linje, gjelder den fra scenens begynnelse. */
const pointCache = new WeakMap<object, Map<string, StoryPoint>>();

function eventPoint(s: ProjectState, e: ContinuityEvent): StoryPoint {
  let m = pointCache.get(s);
  if (!m) pointCache.set(s, (m = new Map()));
  const hit = m.get(e.id);
  if (hit) return hit;
  const p = eventPointRaw(s, e);
  m.set(e.id, p);
  return p;
}

function eventPointRaw(s: ProjectState, e: ContinuityEvent): StoryPoint {
  const p = pointOf(s, eventSceneId(s, e), e.blockId);
  const b = e.blockId ? s.blocks[e.blockId] : undefined;
  if (!b) return p;
  const first = blocksOfVariant(s, b.variantId).find((x) => x.kind !== "heading");
  return first?.id === b.id ? { ...p, orderKey: null } : p;
}

/** Skjer hendelsen midt i scenen (ikke ved begynnelsen eller ved første linje)? */
export function eventMidScene(s: ProjectState, e: ContinuityEvent): boolean {
  return eventPoint(s, e).orderKey !== null;
}

/** Rekkefølgen til to scener i historien (fortellingstid, så plassen i filmen). */
function compareScenes(a: StoryPoint, b: StoryPoint): number {
  if (a.time !== b.time) return a.time - b.time;
  if (a.idx !== b.idx) return a.idx - b.idx;
  return a.sceneId === b.sceneId ? 0 : a.sceneId < b.sceneId ? -1 : 1;
}

/**
 * Sammenligner to steder i historien (<0: a er før b). Linjer i ulike varianter av samme scene sammenlignes
 * på rekkefølgenøkkelen (en variant som er skilt ut, beholder nøklene).
 */
function comparePoints(a: StoryPoint, b: StoryPoint): number {
  const c = compareScenes(a, b);
  if (c !== 0) return c;
  if (a.orderKey === null || b.orderKey === null)
    return a.orderKey === b.orderKey ? 0 : a.orderKey === null ? -1 : 1;
  return compareKeys(a.orderKey, b.orderKey);
}

/** Godkjente hendelser som gjelder for en ressurs, i fortellingsrekkefølge (beregnet én gang per tilstand). */
export function continuityEventsOf(s: ProjectState, assetId: string): ContinuityEvent[] {
  let byAsset = eventsCache.get(s);
  if (!byAsset) eventsCache.set(s, (byAsset = new Map()));
  let list = byAsset.get(assetId);
  if (!list) {
    list = Object.values(s.continuityEvents)
      .filter((e) => e.assetId === assetId && eventApplies(s, e))
      .map((e) => ({ e, p: eventPoint(s, e) }))
      .sort((a, b) => comparePoints(a.p, b.p) || (a.e.id < b.e.id ? -1 : 1))
      .map((x) => x.e);
    byAsset.set(assetId, list);
  }
  return [...list];
}

const eventsCache = new WeakMap<object, Map<string, ContinuityEvent[]>>();

/**
 * Kommer scene a før scene b i historien (fortellingstid, så plassen i hovedfilmen)? <0: før, 0: samme.
 */
export function compareStory(s: ProjectState, a: string, b: string): number {
  return compareScenes(pointOf(s, a, null), pointOf(s, b, null));
}

export interface Appearance {
  /** Varianten (utseendet) som gjelder; null = ikke bestemt av kontinuiteten (bruk standard). */
  readonly variantId: string | null;
  /** Hendelsen som bestemmer varianten (null når ingen hendelse har skjedd ennå, eller ingen finnes). */
  readonly sourceEventId: string | null;
  /** Hendelser som gjelder akkurat her (for beskrivelser: skitt, bandasje …). */
  readonly active: readonly ContinuityEvent[];
  /** Utseendet uten midlertidige endringer og endringer for bare scenen. */
  readonly baseVariantId: string | null;
}

/** Har hendelsen skjedd på dette stedet, og varer den fortsatt? */
function inEffect(
  s: ProjectState,
  e: ContinuityEvent,
  ep: StoryPoint,
  at: StoryPoint,
): "before" | "active" | "over" {
  if (comparePoints(ep, at) > 0) return "before";
  if (e.duration === "permanent") return "active";
  if (e.duration === "scene") return at.sceneId === ep.sceneId ? "active" : "over";
  // Til en bestemt scene: over når den scenen begynner. Ligger den ikke etter hendelsen i historien
  // (feilregistrert, eller scenen er borte), gjelder hendelsen bare sin egen scene.
  const until =
    e.untilSceneId !== null && s.scenes[e.untilSceneId] ? pointOf(s, e.untilSceneId, null) : null;
  if (!until || compareScenes(until, ep) <= 0) return at.sceneId === ep.sceneId ? "active" : "over";
  return compareScenes(at, until) < 0 ? "active" : "over";
}

/**
 * Utseendet til en ressurs på et sted i historien (scene og eventuelt manuslinje; uten linje: ved scenens
 * begynnelse). REQ-0152/0159/0160/0165.
 *
 * - En midlertidig hendelse eller en hendelse for bare scenen som gjelder her, går foran (den siste).
 * - Ellers gjelder den siste permanente hendelsen som har skjedd.
 * - Før den første permanente hendelsen: utseendet FØR den (f.eks. langt hår før hårklippet).
 */
export function appearanceAt(
  s: ProjectState,
  assetId: string,
  sceneId: string,
  blockId: string | null = null,
): Appearance {
  return appearanceFrom(s, continuityEventsOf(s, assetId), sceneId, blockId);
}

/**
 * Som `appearanceAt`, men med en gitt liste av hendelser (i fortellingsrekkefølge, som `continuityEventsOf`
 * gir dem) – brukes av analysen for å se utseendet slik bare de tidligere hendelsene gir det.
 */
export function appearanceFrom(
  s: ProjectState,
  events: readonly ContinuityEvent[],
  sceneId: string,
  blockId: string | null = null,
): Appearance {
  const at = pointOf(s, sceneId, blockId);
  const active: ContinuityEvent[] = [];
  let overlay: ContinuityEvent | null = null;
  let base: ContinuityEvent | null = null;
  // Første permanente endring som bestemmer utseendet (alt før den har «utseendet før»)
  const firstPermanent = events.find((e) => e.duration === "permanent" && e.toVariantId) ?? null;
  let lastOver: ContinuityEvent | null = null;
  let firstUpcoming: ContinuityEvent | null = null;
  let pastFirst = false;
  for (const e of events) {
    if (e === firstPermanent) pastFirst = true;
    const state = inEffect(s, e, eventPoint(s, e), at);
    if (state === "before") {
      // Bare hendelser før den første permanente endringen kan si noe om utseendet før den
      if (!firstUpcoming && !pastFirst && e.fromVariantId) firstUpcoming = e;
      continue;
    }
    if (state === "over") {
      if (e.fromVariantId) lastOver = e;
      continue;
    }
    active.push(e);
    if (!e.toVariantId) continue;
    if (e.duration === "permanent") base = e;
    else overlay = e;
  }
  // Grunnutseendet (uten midlertidige endringer)
  const baseVariantId = base
    ? base.toVariantId
    : firstPermanent
      ? firstPermanent.fromVariantId
      : ((lastOver ?? firstUpcoming)?.fromVariantId ?? null);
  const decided = overlay ?? base;
  if (decided)
    return { variantId: decided.toVariantId, sourceEventId: decided.id, active, baseVariantId };
  return { variantId: baseVariantId, sourceEventId: null, active, baseVariantId };
}

// ---------- Tidslinje per karakter (REQ-0155) ----------

export interface ContinuityTimelineRow {
  readonly sceneId: string;
  /** Sceneforekomsten i hovedfilmen (for lenker); null når scenen bare finnes i en annen produksjon. */
  readonly occurrenceId: string | null;
  readonly number: string | null;
  readonly heading: string;
  /** Utseendet ved scenens begynnelse. */
  readonly appearance: Appearance;
  /** Hendelser som skjer i denne scenen. */
  readonly events: readonly ContinuityEvent[];
  /** Ressursen nevnes eller snakker i scenen. */
  readonly present: boolean;
  /** Scenen er et tilbakeblikk, en drøm e.l. (fortellingstiden avviker fra rekkefølgen). */
  readonly nonLinear: boolean;
}

/**
 * Scenene i fortellingsrekkefølge med utseendet ved begynnelsen og hendelsene i scenen. Bare scenene i
 * hovedfilmen tas med (og scener hendelser er registrert i).
 */
export function continuityTimeline(s: ProjectState, assetId: string): ContinuityTimelineRow[] {
  const asset = s.assets[assetId];
  if (!asset) return [];
  const times = storyTimesCached(s);
  const main = Object.values(s.productions).find((p) => p.kind === "main");
  // Scenene i produksjonen kontinuiteten gjelder for (en spinoff: dens scener, DEC-0060)
  const pid = viewProduction.get(s) ?? main?.id;
  const occs = pid ? orderedOccurrences(s, pid).filter((o) => o.active) : [];
  const bySceneOcc = new Map<string, (typeof occs)[number]>();
  for (const o of occs) if (!bySceneOcc.has(o.sceneId)) bySceneOcc.set(o.sceneId, o);
  const events = continuityEventsOf(s, assetId);
  const sceneIds = new Set<string>([
    ...bySceneOcc.keys(),
    ...events.map((e) => eventSceneId(s, e)),
  ]);
  const names = assetNames(asset)
    .map((n) => nameKey(n))
    .filter((n) => n.length >= 2);
  const rows = [...sceneIds]
    .filter((id) => s.scenes[id])
    .map((sceneId) => {
      const o = bySceneOcc.get(sceneId) ?? null;
      const variantId =
        o?.variantId ?? Object.values(s.variants).find((v) => v.sceneId === sceneId)?.id ?? null;
      const v = variantId ? s.variants[variantId] : undefined;
      const blocks = variantId ? blocksOfVariant(s, variantId) : [];
      const present = blocks.some(
        (b) =>
          (b.kind === "character" && names.includes(nameKey(b.text))) ||
          names.some((n) => mentions(b.text, n)),
      );
      const sc = s.scenes[sceneId]!;
      return {
        sceneId,
        occurrenceId: o?.id ?? null,
        // En scene i en spinoff har ofte ikke eget nummer: hovedfilmens nummer
        number:
          o?.productionNumber ??
          (main
            ? (orderedOccurrences(s, main.id).find((m) => m.sceneId === sceneId)
                ?.productionNumber ?? null)
            : null),
        heading: v
          ? [v.heading.intExt, v.heading.location, v.heading.time].filter(Boolean).join(" ")
          : "",
        appearance: appearanceAt(s, assetId, sceneId),
        events: events.filter((e) => eventSceneId(s, e) === sceneId),
        present,
        nonLinear: sc.storyTime.kind !== "linear",
        time: times.get(sceneId) ?? 0,
      };
    })
    .sort((a, b) => a.time - b.time || (a.sceneId < b.sceneId ? -1 : 1));
  return rows.map(({ time: _t, ...r }) => r);
}

// ---------- Forslag fra manuset (REQ-0157/0158) ----------

/** Nøkkelord (norsk) per type. Treff i en handlingslinje der karakteren nevnes, gir et forslag. */
const KEYWORDS: readonly { kind: ContinuityKind; re: RegExp }[] = [
  {
    kind: "haircut",
    re: /(klipp\p{L}*\s+(\p{L}+\s+){0,3}hår|hår\p{L}*\s+(\p{L}+\s+){0,3}klipp|kortklipt|snauklipt|barber\p{L}*\s+(av\s+)?hodet|ny\s+frisyre|setter\s+opp\s+håret|fletter\s+håret)/iu,
  },
  { kind: "hair_color", re: /(farg\p{L}*\s+(\p{L}+\s+){0,2}hår|hårfarge|bleke\p{L}*\s+håret)/iu },
  {
    kind: "costume",
    re: /(tar\s+på\s+seg|kler\s+på\s+seg|skifter\s+(klær|til)|kler\s+seg\s+(ut|om)|nye\s+klær|kostyme|ikledd|tar\s+av\s+seg\s+(jakka|kåpa|lua|genseren|skjerfet|kjolen|skoene|støvlene))/iu,
  },
  {
    kind: "injury",
    re: /(skader\s+seg|skadet|slår\s+seg|skjærer\s+seg|kutter\s+seg|blør|blødende|bandasje|plaster|brekker|forstuer|halter|blåmerke|blått\s+øye)/iu,
  },
  { kind: "scar", re: /(^|[^\p{L}])arr($|[^\p{L}])/iu },
  {
    kind: "dirt",
    re: /(skitten|skitne|tilgriset|gjørmete|full\s+av\s+gjørme|søle\p{L}*|møkkete)/iu,
  },
  {
    kind: "snow_water",
    re: /(gjennomvåt|søkkvåt|klissvåt|dyvåt|dryppende|snødekt|full\s+av\s+snø|dekket\s+av\s+snø|snø\s+i\s+håret|faller\s+i\s+vannet)/iu,
  },
  { kind: "beard", re: /(skjegg|barberer\s+seg|ubarbert)/iu },
  { kind: "aging", re: /(år\s+senere|år\s+eldre|blitt\s+eldre|gråhåret|grått\s+hår)/iu },
  {
    kind: "carried_object",
    re: /(bærer\s+på|har\s+med\s+seg|tar\s+med\s+seg|plukker\s+opp|legger\s+fra\s+seg|mister\s+\p{L}+|henger\s+\p{L}+\s+på\s+ryggen)/iu,
  },
];

/** Typer som vanligvis varer for godt; resten foreslås for bare scenen. */
const PERMANENT_KINDS = new Set<ContinuityKind>([
  "haircut",
  "hair_color",
  "scar",
  "beard",
  "aging",
]);

export interface ContinuitySuggestion {
  /** Stabil nøkkel: ressurs, linje og type. */
  readonly key: string;
  readonly assetId: string;
  readonly kind: ContinuityKind;
  readonly sceneId: string;
  readonly occurrenceId: string;
  readonly number: string | null;
  readonly blockId: string;
  /** Linjen i manuset som utløste forslaget. */
  readonly text: string;
  readonly duration: ContinuityDuration;
}

/** Et kort utdrag av linjen (beskrivelsen i forslaget). */
export function excerpt(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Forslag til kontinuitetshendelser fra manuset i hovedfilmen: handlingslinjer der en karakter (eller et dyr
 * eller en gjenstand) nevnes ved navn og linjen beskriver en forandring (hårklipp, skade, våt, skitten …).
 * Forslag som allerede er godkjent eller avvist (samme ressurs, linje og type), vises ikke. Ingenting
 * lagres før brukeren velger (REQ-0158).
 */
export function continuitySuggestions(s: ProjectState, assetId?: string): ContinuitySuggestion[] {
  const main = Object.values(s.productions).find((p) => p.kind === "main");
  if (!main) return [];
  const assets = Object.values(s.assets).filter(
    (a) => !a.archived && hasContinuity(a) && (!assetId || a.id === assetId),
  );
  if (assets.length === 0) return [];
  // Hendelser som gjelder i produksjonen (lokale i andre spinoffer teller ikke, DEC-0060)
  const vp = viewProduction.get(s) ?? null;
  const known = new Set(
    Object.values(s.continuityEvents)
      .filter((e) => !e.removed && e.blockId && (!e.productionId || e.productionId === vp))
      .map((e) => `${e.assetId}:${e.blockId}:${e.kind}`),
  );
  const nameList = assets.map((a) => ({
    a,
    names: assetNames(a)
      .map((n) => nameKey(n))
      .filter((n) => n.length >= 2),
  }));
  const out: ContinuitySuggestion[] = [];
  const seenVariants = new Set<string>();
  for (const o of orderedOccurrences(s, vp ?? main.id)) {
    if (!o.active || seenVariants.has(o.variantId)) continue;
    seenVariants.add(o.variantId);
    const blocks = blocksOfVariant(s, o.variantId);
    for (const b of blocks) {
      if (b.kind !== "action") continue;
      const kinds = KEYWORDS.filter((k) => k.re.test(b.text)).map((k) => k.kind);
      if (kinds.length === 0) continue;
      for (const { a, names } of nameList) {
        if (!names.some((n) => mentions(b.text, n))) continue;
        for (const kind of kinds) {
          const key = `${a.id}:${b.id}:${kind}`;
          if (known.has(key)) continue;
          out.push({
            key,
            assetId: a.id,
            kind,
            sceneId: o.sceneId,
            occurrenceId: o.id,
            number: o.productionNumber,
            blockId: b.id,
            text: excerpt(b.text),
            duration: PERMANENT_KINDS.has(kind) ? "permanent" : "scene",
          });
        }
      }
    }
  }
  return out;
}

// ---------- Bruk i sceneeditoren og ved generering ----------

/**
 * Varianten som bør brukes for ressursen i en scene ifølge kontinuiteten, og om en valgt variant avviker.
 * `chosenVariantId` = varianten laget bruker nå (null = ukjent / ikke valgt).
 */
export function continuityCheck(
  s: ProjectState,
  assetId: string,
  sceneId: string,
  chosenVariantId: string | null,
  blockId: string | null = null,
): {
  readonly expected: AssetVariant | null;
  readonly mismatch: boolean;
  readonly appearance: Appearance;
} {
  const appearance = appearanceAt(s, assetId, sceneId, blockId);
  const expected = appearance.variantId ? (s.assetVariants[appearance.variantId] ?? null) : null;
  return {
    expected,
    mismatch: !!expected && chosenVariantId !== null && chosenVariantId !== expected.id,
    appearance,
  };
}

/**
 * Manuslinjene der en kontinuitetshendelse skjer midt i scenen (utseendet endres). Brukes
 * til å foreslå segmentgrenser før og etter endringen (REQ-0161), uten å endre manuset (REQ-0163).
 */
export function continuityCutBlocks(s: ProjectState, variantId: string): ScriptBlock[] {
  const v = s.variants[variantId];
  if (!v) return [];
  s = continuityForVariant(s, variantId);
  const blocks = blocksOfVariant(s, variantId);
  const first = blocks.find((b) => b.kind !== "heading");
  const ids = new Set(
    Object.values(s.continuityEvents)
      .filter(
        (e) =>
          eventApplies(s, e) &&
          eventSceneId(s, e) === v.sceneId &&
          e.blockId !== null &&
          e.toVariantId !== null,
      )
      .map((e) => e.blockId as string),
  );
  return blocks.filter((b) => ids.has(b.id) && b.id !== first?.id);
}

/** Varianten et lag faktisk viser ved begynnelsen (låst versjon, valgt variant, ellers forsidebildet). */
export function layerEffectiveVariant(
  s: ProjectState,
  l: Pick<CompositionLayer, "assetId" | "assetVariantId" | "versionId">,
): string | null {
  if (l.assetId === null) return null;
  if (l.versionId !== null) return s.assetVersions[l.versionId]?.variantId ?? null;
  if (l.assetVariantId !== null) return l.assetVariantId;
  return coverVersion(s, l.assetId)?.variantId ?? null;
}

/**
 * Kontinuiteten for et lag i en 2D-scene: varianten kontinuiteten sier skal brukes ved scenens begynnelse,
 * og om laget viser en annen (advarsel i sceneeditoren). Bildeskifter i laget brukes for endringer midt i
 * scenen og kontrolleres ikke her.
 */
export function layerContinuity(
  s: ProjectState,
  l: Pick<CompositionLayer, "assetId" | "assetVariantId" | "versionId"> & {
    readonly compositionId?: string;
  },
  sceneId: string,
): {
  readonly expected: AssetVariant | null;
  readonly mismatch: boolean;
  readonly appearance: Appearance;
} | null {
  if (l.assetId === null) return null;
  const a = s.assets[l.assetId];
  if (!a || !hasContinuity(a)) return null;
  // 2D-scenen i en avledet produksjons egen versjon følger den produksjonens kontinuitet (DEC-0060)
  const comp = l.compositionId ? s.compositions[l.compositionId] : undefined;
  const cs = comp ? continuityForVariant(s, comp.variantId) : s;
  return continuityCheck(cs, a.id, sceneId, layerEffectiveVariant(s, l));
}

/**
 * Varianten kontinuiteten sier skal brukes for ressursen ved begynnelsen av scenen (scenevarianten 2D-scenen
 * hører til). Brukes som standardvalg når ressursen legges inn i sceneeditoren. null = ikke bestemt.
 */
export function sceneContinuityVariant(
  s: ProjectState,
  assetId: string,
  sceneVariantId: string,
): string | null {
  const sceneId = s.variants[sceneVariantId]?.sceneId;
  const a = s.assets[assetId];
  if (!sceneId || !a || !hasContinuity(a)) return null;
  const id = appearanceAt(continuityForVariant(s, sceneVariantId), assetId, sceneId).variantId;
  return id && s.assetVariants[id] && !s.assetVariants[id]!.archived ? id : null;
}
