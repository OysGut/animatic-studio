/**
 * Tilbakeføring fra spinoff til hovedfilm (M7 del 4, DEC-0060, mandat kap. 25, REQ-0373–0383, REQ-0500).
 *
 * En scene som spinoffen har fått sin egen versjon av (eller en ny scene som bare finnes der), kan foreslås
 * ført tilbake til hovedfilmen. Ingenting skjer automatisk (REQ-0374): sammenligningen viser forskjellene i
 * manus, lyd, kamera, timing og bilde (REQ-0375), og brukeren velger hva som overføres (REQ-0376–0381).
 * Overføringen er vanlige kommandoer i én angregruppe; teksthistorikk, gamle versjoner og koblingen mellom
 * versjonene bevares (REQ-0383), og godkjent materiale i hovedfilmen byttes bare ut etter en eksplisitt
 * bekreftelse (REQ-0382).
 *
 * Linjer og lag i de to versjonene kjennes igjen på rekkefølgenøkkelen: en egen versjon (ForkVariant) og
 * en kopi av 2D-scenen beholder nøklene.
 */
import type {
  AudioClip,
  BlockRevision,
  Composition,
  CompositionLayer,
  ProjectState,
  SceneOccurrence,
  ScriptBlock,
  Take,
  TimeLink,
} from "../model";
import { mainProduction } from "../model";
import type { Command, LayerFields } from "../commands/types";
import { newId } from "../ids";
import { compareKeys, keyBetween } from "../order-key";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { formatHeading } from "../screenplay/paginate";
import { compositionOfVariant, layersOf } from "../composition/render";
import { layerFieldsOf } from "../composition";
import { audioClipFieldsOf } from "../commands/apply";
import { compositionCopyCommands } from "./index";

// ---------- Hva kan føres tilbake ----------

export interface PromotionCandidate {
  /** Spinoffens forekomst. */
  readonly occurrenceId: string;
  /** Hovedfilmens forekomst av samme scene, eller null for en ny scene som bare finnes i spinoffen. */
  readonly mainOccurrenceId: string | null;
  readonly heading: string;
  readonly number: string | null;
}

/** Scenene i produksjonen som har sin egen versjon (endret i spinoffen) eller bare finnes der. */
export function promotionCandidates(s: ProjectState, productionId: string): PromotionCandidate[] {
  const main = mainProduction(s);
  if (!main || main.id === productionId) return [];
  const mainOccs = orderedOccurrences(s, main.id);
  return orderedOccurrences(s, productionId)
    .filter((o) => s.variants[o.variantId]?.ownerProductionId === productionId)
    .map((o) => ({
      occurrenceId: o.id,
      mainOccurrenceId: mainOccs.find((m) => m.sceneId === o.sceneId)?.id ?? null,
      heading: formatHeading(s.variants[o.variantId]!.heading),
      number: o.productionNumber,
    }));
}

// ---------- Sammenligning (REQ-0375) ----------

export type LineStatus =
  /** Endret i spinoffen (kan overføres). */
  | "changed"
  /** Ny linje i spinoffen. */
  | "added"
  /** Fjernet i spinoffen. */
  | "removed"
  /** Endret både i spinoffen og i hovedfilmen etterpå (overføres bare når brukeren velger det). */
  | "conflict"
  /** Endret bare i hovedfilmen etter at spinoffen fikk sin versjon (ikke noe å overføre). */
  | "main_newer"
  | "same";

export interface LineDiff {
  /** Rekkefølgenøkkelen (felles for de to versjonene). */
  readonly key: string;
  readonly status: LineStatus;
  readonly main: ScriptBlock | null;
  readonly spin: ScriptBlock | null;
}

export type ItemStatus = "added" | "removed" | "changed" | "same";

export interface AudioDiff {
  readonly status: ItemStatus;
  readonly main: AudioClip | null;
  readonly spin: AudioClip | null;
}

export interface LayerDiff {
  readonly key: string;
  readonly status: ItemStatus;
  readonly main: CompositionLayer | null;
  readonly spin: CompositionLayer | null;
  /** Hva som er endret (norske navn). */
  readonly what: readonly string[];
}

export interface PromotionComparison {
  readonly spinOccurrence: SceneOccurrence;
  readonly mainOccurrence: SceneOccurrence | null;
  readonly heading: {
    readonly main: string | null;
    readonly spin: string;
    readonly changed: boolean;
  };
  readonly lines: readonly LineDiff[];
  readonly audio: readonly AudioDiff[];
  readonly camera: { readonly changed: boolean; readonly main: number; readonly spin: number };
  readonly timing: {
    /** 2D-scenens lengde (bilder) i hver versjon, eller null uten 2D-scene. */
    readonly mainFrames: number | null;
    readonly spinFrames: number | null;
    /** Tidskoblinger som er ulike. */
    readonly links: number;
    readonly changed: boolean;
  };
  readonly visual: {
    readonly mainComposition: Composition | null;
    readonly spinComposition: Composition | null;
    readonly layers: readonly LayerDiff[];
    readonly background: boolean;
  };
  /** Ferdig film / klipping (aktiv versjon og deler). */
  readonly film: {
    readonly changed: boolean;
    readonly mainTake: Take | null;
    readonly spinTake: Take | null;
    /** Hovedfilmens aktive versjon er godkjent: bytte krever bekreftelse (REQ-0382). */
    readonly mainApproved: boolean;
  };
}

function allBlocks(s: ProjectState, variantId: string): ScriptBlock[] {
  return Object.values(s.blocks)
    .filter((b) => b.variantId === variantId)
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
}

const historyCache = new WeakMap<object, Map<string, BlockRevision[]>>();
function historyOf(s: ProjectState, blockId: string): BlockRevision[] {
  let m = historyCache.get(s.blockRevisions);
  if (!m) {
    m = new Map();
    for (const r of s.blockRevisions) {
      const l = m.get(r.blockId);
      if (l) l.push(r);
      else m.set(r.blockId, [r]);
    }
    historyCache.set(s.blockRevisions, m);
  }
  return m.get(blockId) ?? [];
}

/**
 * Felles opphav for to linjer: den siste revisjonen (nummer og tekst) som finnes i begge historikkene. En
 * egen versjon kopierer historikken med samme revisjonsnumre.
 */
function ancestorText(s: ProjectState, main: ScriptBlock, spin: ScriptBlock): string | null {
  const m = new Map(historyOf(s, main.id).map((r) => [r.rev, r.text]));
  const sp = [...historyOf(s, spin.id)].sort((a, b) => b.rev - a.rev);
  for (const r of sp) if (m.get(r.rev) === r.text) return r.text;
  return null;
}

function lineStatus(
  s: ProjectState,
  main: ScriptBlock | null,
  spin: ScriptBlock | null,
): LineStatus {
  const mainLive = !!main && !main.removed;
  const spinLive = !!spin && !spin.removed;
  if (!spin) return "same"; // Bare i hovedfilmen (lagt til der etterpå): ikke spinoffens endring
  if (!main) return spinLive ? "added" : "same";
  if (mainLive && !spinLive) return "removed";
  if (!mainLive && !spinLive) return "same";
  if (!mainLive && spinLive) return "changed"; // fjernet i hovedfilmen, finnes i spinoffen
  if (main.text === spin.text && main.kind === spin.kind) return "same";
  const base = ancestorText(s, main, spin);
  if (base === null) return "conflict";
  const spinChanged = spin.text !== base || spin.kind !== main.kind;
  const mainChanged = main.text !== base;
  if (spinChanged && mainChanged) return "conflict";
  return spinChanged ? "changed" : "main_newer";
}

const audioKey = (a: AudioClip, block: string | null) =>
  `${a.assetId}|${a.kind}|${a.language ?? ""}|${block ?? ""}`;
const audioSame = (a: AudioClip, b: AudioClip) => {
  const x = { ...audioClipFieldsOf(a), occurrenceId: "", blockId: null };
  const y = { ...audioClipFieldsOf(b), occurrenceId: "", blockId: null };
  return JSON.stringify(x) === JSON.stringify(y);
};

const LAYER_FIELD_LABEL: Partial<Record<keyof LayerFields, string>> = {
  kind: "type",
  name: "navn",
  assetId: "bilde",
  assetVariantId: "variant",
  versionId: "versjon",
  fill: "farge",
  width: "størrelse",
  height: "størrelse",
  parallax: "parallakse",
  transform: "plassering",
  keyframes: "nøkkelbilder",
  visible: "synlighet",
  locked: "lås",
  groupId: "gruppe",
  swaps: "bildeskifter",
  path: "bevegelsesbane",
  anchor: "ankerpunkt",
  languageImages: "bilde per språk",
};

function layerChanges(
  main: CompositionLayer,
  spin: CompositionLayer,
  groupKey: (id: string | null, of: "main" | "spin") => string | null,
): string[] {
  const a = layerFieldsOf(main) as unknown as Record<string, unknown>;
  const b = layerFieldsOf(spin) as unknown as Record<string, unknown>;
  const out = new Set<string>();
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "groupId") {
      if (groupKey(main.groupId, "main") !== groupKey(spin.groupId, "spin")) out.add("gruppe");
      continue;
    }
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null))
      out.add(LAYER_FIELD_LABEL[k as keyof LayerFields] ?? k);
  }
  return [...out];
}

/** Hovedfilmens forekomst av samme scene (null når scenen bare finnes i spinoffen). */
export function mainOccurrenceOf(
  s: ProjectState,
  spinOccurrenceId: string,
): SceneOccurrence | null {
  const o = s.occurrences[spinOccurrenceId];
  const main = mainProduction(s);
  if (!o || !main) return null;
  return orderedOccurrences(s, main.id).find((m) => m.sceneId === o.sceneId) ?? null;
}

/** Sammenligningen av spinoffens versjon med hovedfilmens (REQ-0375). */
export function comparePromotion(
  s: ProjectState,
  spinOccurrenceId: string,
): PromotionComparison | null {
  const so = s.occurrences[spinOccurrenceId];
  if (!so) return null;
  const sv = s.variants[so.variantId]!;
  const mo = mainOccurrenceOf(s, so.id);
  const mv = mo ? s.variants[mo.variantId]! : null;

  // Manus
  const spinBlocks = allBlocks(s, sv.id).filter((b) => b.kind !== "heading");
  const mainBlocks = mv ? allBlocks(s, mv.id).filter((b) => b.kind !== "heading") : [];
  const byKeyMain = new Map(mainBlocks.map((b) => [b.orderKey, b]));
  const byKeySpin = new Map(spinBlocks.map((b) => [b.orderKey, b]));
  const keys = [...new Set([...byKeyMain.keys(), ...byKeySpin.keys()])].sort(compareKeys);
  const lines: LineDiff[] = keys.map((key) => {
    let main = byKeyMain.get(key) ?? null;
    const spin = byKeySpin.get(key) ?? null;
    // Samme plass, men uten felles historikk: to forskjellige linjer lagt til hver for seg (keyBetween
    // gir samme nøkkel). Spinoffens linje er da ny, og hovedfilmens røres ikke.
    if (main && spin && main.text !== spin.text && ancestorText(s, main, spin) === null)
      main = null;
    return {
      key,
      main,
      spin,
      status: mv ? lineStatus(s, main, spin) : spin && !spin.removed ? "added" : "same",
    };
  });
  // Spinoffens linje-ID → hovedfilmens (samme linje)
  const sameLine = new Map<string, string>();
  for (const l of lines) if (l.main && l.spin) sameLine.set(l.spin.id, l.main.id);
  const toMain = (id: string | null) => (id ? (sameLine.get(id) ?? null) : null);

  // Lyd
  const mainAudio = mo
    ? Object.values(s.audioClips).filter((a) => a.occurrenceId === mo.id && !a.removed)
    : [];
  const spinAudio = Object.values(s.audioClips).filter(
    (a) => a.occurrenceId === so.id && !a.removed,
  );
  const audio: AudioDiff[] = [];
  const freeMain = new Set(mainAudio.map((a) => a.id));
  for (const sa of spinAudio.sort((a, b) => a.offsetMs - b.offsetMs)) {
    const key = audioKey(sa, toMain(sa.blockId));
    const same = mainAudio.find(
      (m) => freeMain.has(m.id) && audioKey(m, m.blockId) === key && audioSame(m, sa),
    );
    const match =
      same ?? mainAudio.find((m) => freeMain.has(m.id) && audioKey(m, m.blockId) === key);
    if (match) {
      freeMain.delete(match.id);
      audio.push({ status: same ? "same" : "changed", main: match, spin: sa });
    } else audio.push({ status: "added", main: null, spin: sa });
  }
  // Lyd som bare finnes i hovedfilmen, er ikke fjernet i spinoffen (en gjenbrukt scene får ikke kopi av
  // lyden): den står uendret.

  // 2D-scenen: kamera, timing og lag
  const mc = mv ? compositionOfVariant(s, mv.id) : null;
  const sc = compositionOfVariant(s, sv.id);
  const mainLayers = mc ? layersOf(s, mc.id, { includeRemoved: true }) : [];
  // Spinoffens lag, også fjernede (et lag fjernet i spinoffen kan fjernes i hovedfilmen)
  const spinLayers = sc ? layersOf(s, sc.id, { includeRemoved: true }) : [];
  // Samme lag: samme plass (kopien beholder nøkkelen) og samme bilde/type
  const related = (m: CompositionLayer, x: CompositionLayer) =>
    m.orderKey === x.orderKey && m.assetId === x.assetId && m.kind === x.kind;
  const pairOf = new Map<string, CompositionLayer>();
  for (const x of spinLayers) {
    const m = mainLayers.find((y) => related(y, x));
    if (m) pairOf.set(x.id, m);
  }
  const groupKey = (id: string | null, of: "main" | "spin") => {
    if (!id) return null;
    if (of === "main") return id;
    return pairOf.get(id)?.id ?? `ny:${id}`;
  };
  const layers: LayerDiff[] = spinLayers
    .map((spin): LayerDiff => {
      const main = pairOf.get(spin.id) ?? null;
      const key = `s:${spin.id}`;
      if (!main) return { key, status: spin.removed ? "same" : "added", main, spin, what: [] };
      if (spin.removed)
        return { key, status: main.removed ? "same" : "removed", main, spin, what: [] };
      if (main.removed) return { key, status: "changed", main, spin, what: ["hentet tilbake"] };
      const what = layerChanges(main, spin, groupKey);
      return { key, status: what.length ? "changed" : "same", main, spin, what };
    })
    .sort((a, b) => compareKeys(a.spin!.orderKey, b.spin!.orderKey));
  const camA = JSON.stringify(mc?.camera ?? null);
  const camB = JSON.stringify(sc?.camera ?? null);

  // Tidskoblinger (bare koblinger i scenen, ikke hendelser i 2D-scenen som følger lagene)
  const linkSig = (l: TimeLink, block: string | null) => `${block}|${l.startMs}|${l.endMs}`;
  const mainLinks = mo
    ? Object.values(s.timeLinks)
        .filter((l) => l.occurrenceId === mo.id && !l.removed && !l.layerId)
        .map((l) => linkSig(l, l.blockId))
    : [];
  const spinLinks = Object.values(s.timeLinks)
    .filter((l) => l.occurrenceId === so.id && !l.removed && !l.layerId)
    .map((l) => linkSig(l, toMain(l.blockId)));
  const ml = new Set(mainLinks);
  const sl = new Set(spinLinks);
  // Bare når spinoffen har egne tidskoblinger (en gjenbrukt scene har ingen)
  const links = sl.size
    ? [...sl].filter((x) => !ml.has(x)).length + [...ml].filter((x) => !sl.has(x)).length
    : 0;

  // Ferdig film og klipping
  const partsSig = (occId: string) =>
    JSON.stringify(
      Object.values(s.clipParts)
        .filter((p) => p.occurrenceId === occId && !p.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey))
        .map((p) => [p.source, p.takeId, p.inMs, p.outMs]),
    );
  const mainTake = mo?.activeTakeId ? (s.takes[mo.activeTakeId] ?? null) : null;
  const spinTake = so.activeTakeId ? (s.takes[so.activeTakeId] ?? null) : null;
  // Bare når spinoffen har valgt en versjon eller klippet scenen selv
  const spinOwnFilm = so.activeTakeId !== null || partsSig(so.id) !== "[]";
  const filmChanged =
    spinOwnFilm &&
    ((mo?.activeTakeId ?? null) !== so.activeTakeId ||
      (mo ? partsSig(mo.id) : "[]") !== partsSig(so.id));

  return {
    spinOccurrence: so,
    mainOccurrence: mo,
    heading: {
      main: mv ? formatHeading(mv.heading) : null,
      spin: formatHeading(sv.heading),
      changed: !mv || formatHeading(mv.heading) !== formatHeading(sv.heading),
    },
    lines,
    audio,
    camera: {
      changed: !!sc && camA !== camB,
      main: mc?.camera.shots.length ?? 0,
      spin: sc?.camera.shots.length ?? 0,
    },
    timing: {
      mainFrames: mc?.durationFrames ?? null,
      spinFrames: sc?.durationFrames ?? null,
      links,
      changed: (!!sc && !!mc && sc.durationFrames !== mc.durationFrames) || links > 0,
    },
    visual: {
      mainComposition: mc,
      spinComposition: sc,
      layers,
      background: !!sc && !!mc && sc.background !== mc.background,
    },
    film: {
      changed: filmChanged,
      mainTake,
      spinTake,
      mainApproved: mainTake?.status === "approved",
    },
  };
}

// ---------- Overføring (REQ-0376–0382) ----------

export interface PromotionChoice {
  /** Linjene (rekkefølgenøkler) som overføres. */
  readonly lines: readonly string[];
  readonly heading: boolean;
  /** Lagene (nøkler) som overføres; for en 2D-scene som bare finnes i spinoffen: hele 2D-scenen. */
  readonly layers: readonly string[];
  readonly camera: boolean;
  readonly background: boolean;
  readonly audio: boolean;
  readonly timing: boolean;
  /** Spinoffens klipping og aktive versjon (ferdig film). */
  readonly film: boolean;
  /** Eksplisitt bekreftelse på å bytte godkjent materiale i hovedfilmen (REQ-0382). */
  readonly confirmApproved: boolean;
}

/**
 * Standardvalget: manuslinjene spinoffen har endret (sikkert: linjenes historikk viser hvem som endret hva),
 * ikke linjer som er endret i begge. Bilde, kamera, lyd, timing og film har ingen felles historikk å
 * sammenligne med, så de velges bare av brukeren (en endring i hovedfilmen etterpå skal ikke overskrives
 * uten at noen har sett på den).
 */
export function defaultChoice(c: PromotionComparison): PromotionChoice {
  return {
    ...KEEP_ALL,
    lines: c.lines
      .filter((l) => l.status === "changed" || l.status === "added" || l.status === "removed")
      .map((l) => l.key),
  };
}

/** Ingenting valgt: «Behold alt uendret» (REQ-0376). */
export const KEEP_ALL: PromotionChoice = {
  lines: [],
  heading: false,
  layers: [],
  camera: false,
  background: false,
  audio: false,
  timing: false,
  film: false,
  confirmApproved: false,
};

/** Bare manusendringene (REQ-0377). */
export function scriptOnlyChoice(c: PromotionComparison): PromotionChoice {
  return { ...KEEP_ALL, lines: defaultChoice(c).lines, heading: c.heading.changed };
}

export interface PromotionPlan {
  readonly commands: readonly Command[];
  /** Hvorfor valget ikke kan gjennomføres (f.eks. godkjent materiale uten bekreftelse). */
  readonly blocked: string | null;
}

/**
 * Kommandoene som fører valgte endringer fra spinoffens versjon inn i hovedfilmens (REQ-0377–0379). Alt
 * annet i hovedfilmen er uendret; endringene lagres med historikk og kan angres samlet.
 */
export function promotionCommands(
  s: ProjectState,
  spinOccurrenceId: string,
  choice: PromotionChoice,
): PromotionPlan {
  const c = comparePromotion(s, spinOccurrenceId);
  const main = mainProduction(s);
  if (!c || !main) return { commands: [], blocked: "Fant ikke scenen." };
  const mo = c.mainOccurrence;
  if (!mo)
    return {
      commands: [],
      blocked: "Scenen finnes ikke i hovedfilmen. Bruk «Overfør scenen til hovedfilmen».",
    };
  if (choice.film && c.film.changed && c.film.mainApproved && !choice.confirmApproved)
    return {
      commands: [],
      blocked:
        "Hovedfilmen bruker en godkjent versjon av scenen. Bekreft at den skal byttes, eller la klippingen stå.",
    };
  const so = c.spinOccurrence;
  const mv = s.variants[mo.variantId]!;
  const sv = s.variants[so.variantId]!;
  const pid = main.id as never;
  const out: Command[] = [];
  // Spinoffens linje-ID → hovedfilmens (også linjer som legges til nå)
  const blockMap = new Map<string, string>();
  for (const l of c.lines) if (l.spin && l.main) blockMap.set(l.spin.id, l.main.id);

  // Manus (REQ-0377)
  if (choice.heading && c.heading.changed)
    out.push({
      type: "EditSceneHeading",
      productionId: pid,
      variantId: mv.id,
      heading: sv.heading,
    });
  const chosen = new Set(choice.lines);
  const mainKeys = allBlocks(s, mv.id).map((b) => b.orderKey);
  const taken = new Set(mainKeys);
  for (const l of c.lines) {
    if (!chosen.has(l.key) || !l.spin) continue;
    if (l.status === "same" || l.status === "main_newer") continue;
    const spin = l.spin;
    if (l.main) {
      if (spin.removed) {
        if (!l.main.removed)
          out.push({ type: "RemoveBlock", productionId: pid, blockId: l.main.id });
        continue;
      }
      if (l.main.removed) out.push({ type: "RestoreBlock", productionId: pid, blockId: l.main.id });
      if (l.main.kind !== spin.kind)
        out.push({ type: "SetBlockKind", productionId: pid, blockId: l.main.id, kind: spin.kind });
      if (l.main.text !== spin.text)
        out.push({ type: "EditBlockText", productionId: pid, blockId: l.main.id, text: spin.text });
    } else if (!spin.removed) {
      // Ny linje: samme plass (nøkkel) hvis den er ledig, ellers mellom naboene i hovedfilmen
      let key = spin.orderKey;
      if (taken.has(key)) {
        const sorted = [...taken].sort(compareKeys);
        const after = sorted.filter((k) => compareKeys(k, key) < 0).pop() ?? null;
        const before = sorted.find((k) => compareKeys(k, key) > 0) ?? null;
        key = keyBetween(after, before);
      }
      taken.add(key);
      const blockId = newId<"script_block">();
      blockMap.set(spin.id, blockId);
      out.push({
        type: "InsertBlock",
        productionId: pid,
        variantId: mv.id,
        block: { blockId, kind: spin.kind, text: spin.text, orderKey: key },
      });
    }
  }
  const mapBlock = (id: string | null) => (id ? (blockMap.get(id) ?? null) : null);

  // Bilde (REQ-0378): lag, bakgrunn og kamera
  const mc = c.visual.mainComposition;
  const sc = c.visual.spinComposition;
  const layerKeys = new Set(choice.layers);
  if (sc && !mc && layerKeys.size > 0) {
    // Hovedfilmen har ingen 2D-scene: hele 2D-scenen kopieres
    out.push(...compositionCopyCommands(s, sc.id, mv.id, Object.fromEntries(blockMap)));
  } else if (sc && mc) {
    const fields = {
      name: mc.name,
      width: mc.width,
      height: mc.height,
      durationFrames: choice.timing ? sc.durationFrames : mc.durationFrames,
      background: choice.background ? sc.background : mc.background,
    };
    const compChanged =
      (choice.timing && sc.durationFrames !== mc.durationFrames) ||
      (choice.background && sc.background !== mc.background) ||
      (choice.camera && c.camera.changed);
    if (compChanged)
      out.push({
        type: "UpdateComposition",
        compositionId: mc.id,
        fields,
        ...(choice.camera && c.camera.changed ? { camera: sc.camera } : {}),
      });
    // Lag: spinoffens lag-ID → hovedfilmens (eksisterende eller nye)
    const layerMap = new Map<string, string>();
    for (const d of c.visual.layers) if (d.main && d.spin) layerMap.set(d.spin.id, d.main.id);
    for (const d of c.visual.layers)
      if (layerKeys.has(d.key) && d.status === "added" && d.spin)
        layerMap.set(d.spin.id, newId<"composition_layer">());
    const fieldsFor = (l: CompositionLayer): LayerFields => {
      const f = layerFieldsOf(l);
      const g = f.groupId ? (layerMap.get(f.groupId) ?? null) : null;
      // Bilder per språk alltid med (tom liste = ingen), ellers beholdes hovedfilmens
      return { ...f, groupId: g as never, languageImages: l.languageImages ?? [] };
    };
    const added = c.visual.layers.filter(
      (d) => layerKeys.has(d.key) && d.status === "added" && d.spin,
    );
    // Grupper før lagene i dem
    added.sort((a, b) => (a.spin!.kind === "group" ? 0 : 1) - (b.spin!.kind === "group" ? 0 : 1));
    const existingKeys = new Set(
      layersOf(s, mc.id, { includeRemoved: true }).map((l) => l.orderKey),
    );
    if (added.length)
      out.push({
        type: "AddLayers",
        layers: added.map((d) => ({
          layerId: layerMap.get(d.spin!.id)! as never,
          compositionId: mc.id,
          ...(existingKeys.has(d.spin!.orderKey) ? {} : { orderKey: d.spin!.orderKey }),
          fields: fieldsFor(d.spin!),
        })),
      });
    const changed = c.visual.layers.filter(
      (d) => layerKeys.has(d.key) && d.status === "changed" && d.main && d.spin,
    );
    // Lag som er fjernet i hovedfilmen, men finnes i spinoffen: hentes tilbake først
    const restore = changed.filter((d) => d.main!.removed);
    if (restore.length)
      out.push({
        type: "SetLayersRemoved",
        layerIds: restore.map((d) => d.main!.id),
        removed: false,
      });
    if (changed.length)
      out.push({
        type: "UpdateLayers",
        layers: changed.map((d) => ({ layerId: d.main!.id, fields: fieldsFor(d.spin!) })),
      });
    const removed = c.visual.layers.filter(
      (d) => layerKeys.has(d.key) && d.status === "removed" && d.main,
    );
    if (removed.length)
      out.push({
        type: "SetLayersRemoved",
        layerIds: removed.map((d) => d.main!.id),
        removed: true,
      });
  }

  // Lyd (REQ-0379)
  if (choice.audio) {
    const add = c.audio.filter((a) => a.status === "added" && a.spin);
    if (add.length)
      out.push({
        type: "AddAudioClips",
        clips: add.map((a) => ({
          clipId: newId<"audio_clip">() as never,
          fields: {
            ...audioClipFieldsOf(a.spin!),
            occurrenceId: mo.id,
            blockId: mapBlock(a.spin!.blockId) as never,
          },
        })),
      });
    const upd = c.audio.filter((a) => a.status === "changed" && a.spin && a.main);
    if (upd.length)
      out.push({
        type: "UpdateAudioClips",
        clips: upd.map((a) => ({
          clipId: a.main!.id,
          fields: {
            ...audioClipFieldsOf(a.spin!),
            occurrenceId: mo.id,
            blockId: (mapBlock(a.spin!.blockId) ?? a.main!.blockId) as never,
          },
        })),
      });
    const rem = c.audio.filter((a) => a.status === "removed" && a.main);
    if (rem.length)
      out.push({
        type: "SetAudioClipsRemoved",
        clipIds: rem.map((a) => a.main!.id),
        removed: true,
      });
  }

  // Timing (REQ-0379): tidskoblingene for replikkene
  if (choice.timing && c.timing.links > 0) {
    const old = Object.values(s.timeLinks).filter(
      (l) => l.occurrenceId === mo.id && !l.removed && !l.layerId,
    );
    if (old.length)
      out.push({ type: "SetTimeLinksRemoved", linkIds: old.map((l) => l.id), removed: true });
    const fresh = Object.values(s.timeLinks).filter(
      (l) => l.occurrenceId === so.id && !l.removed && !l.layerId && mapBlock(l.blockId),
    );
    if (fresh.length)
      out.push({
        type: "AddTimeLinks",
        links: fresh.map((l) => ({
          linkId: newId<"time_link">() as never,
          fields: {
            occurrenceId: mo.id,
            blockId: mapBlock(l.blockId)! as never,
            startMs: l.startMs,
            endMs: l.endMs,
          },
        })),
      });
  }

  // Ferdig film og klipping (REQ-0378/0382)
  if (choice.film && c.film.changed) {
    const parts = Object.values(s.clipParts)
      .filter((p) => p.occurrenceId === so.id && !p.removed)
      .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
    // 2D-deler forutsetter at hovedfilmen har en 2D-scene som er lang nok
    const compParts = parts.filter((p) => p.source === "composition");
    const compCopied = !mc && !!sc && layerKeys.size > 0;
    if (compParts.length && !mc && !compCopied)
      return {
        commands: [],
        blocked:
          "Spinoffens klipping bruker 2D-scenen, men hovedfilmen har ingen 2D-scene. Velg også lagene (da kopieres 2D-scenen).",
      };
    const mainFrames = mc
      ? choice.timing && sc
        ? sc.durationFrames
        : mc.durationFrames
      : (sc?.durationFrames ?? 0);
    const maxMs = Math.round((mainFrames / (s.project.fps.num / s.project.fps.den)) * 1000);
    if (mainFrames > 0 && compParts.some((p) => p.outMs > maxMs))
      return {
        commands: [],
        blocked:
          "Spinoffens klipping går lenger enn hovedfilmens 2D-scene. Velg også «Timing» (lengden på 2D-scenen).",
      };
    const usable = parts;
    out.push({
      type: "SetSceneEdit",
      occurrenceId: mo.id,
      activeTakeId: so.activeTakeId,
      parts: usable.map((p) => ({
        partId: newId<"clip_part">() as never,
        source: p.source,
        takeId: p.takeId,
        inMs: p.inMs,
        outMs: p.outMs,
      })),
    });
  }
  return { commands: out, blocked: null };
}

/**
 * «Ny hovedfilmvariant fra spinoff-versjonen» (REQ-0380): hovedfilmen får en egen kopi av spinoffens versjon
 * (manus med historikk, oversettelser og 2D-scene). Hovedfilmens gamle versjon og spinoffens versjon finnes
 * fortsatt, og den nye peker til spinoffens (REQ-0383). Lyd, tidskoblinger og ferdig film i hovedfilmen
 * beholdes og følger linjene; koblinger til linjer som ikke finnes i den nye versjonen, løses først.
 */
export function newMainVariantCommands(s: ProjectState, spinOccurrenceId: string): PromotionPlan {
  const so = s.occurrences[spinOccurrenceId];
  const mo = so ? mainOccurrenceOf(s, so.id) : null;
  if (!so || !mo) return { commands: [], blocked: "Scenen finnes ikke i hovedfilmen." };
  const sv = s.variants[so.variantId]!;
  const out: Command[] = [];
  const spinBlocks = allBlocks(s, sv.id);
  const byKey = new Map(spinBlocks.map((b) => [b.orderKey, b]));
  const lost = new Set(
    allBlocks(s, mo.variantId)
      .filter((b) => {
        const x = byKey.get(b.orderKey);
        return !x || x.kind !== b.kind;
      })
      .map((b) => b.id as string),
  );
  if (
    Object.values(s.segments).some(
      (g) =>
        g.occurrenceId === mo.id &&
        ((g.startBlockId && lost.has(g.startBlockId)) || (g.endBlockId && lost.has(g.endBlockId))),
    )
  )
    return {
      commands: [],
      blocked:
        "Hovedfilmens inndeling for generering bruker linjer som ikke finnes i spinoffens versjon. Lag ny inndeling først.",
    };
  // Lyd koblet til linjer som forsvinner: koblingen til linjen løses (lyden beholdes)
  const audio = Object.values(s.audioClips).filter(
    (a) => a.occurrenceId === mo.id && a.blockId && lost.has(a.blockId),
  );
  if (audio.length)
    out.push({
      type: "UpdateAudioClips",
      clips: audio.map((a) => ({
        clipId: a.id,
        fields: { ...audioClipFieldsOf(a), blockId: null },
      })),
    });
  const links = Object.values(s.timeLinks).filter(
    (l) => l.occurrenceId === mo.id && !l.removed && lost.has(l.blockId),
  );
  if (links.length)
    out.push({ type: "SetTimeLinksRemoved", linkIds: links.map((l) => l.id), removed: true });
  const newVariantId = newId<"scene_variant">();
  const blockIdMap: Record<string, string> = {};
  for (const b of spinBlocks) blockIdMap[b.id] = newId<"script_block">();
  const translationIdMap: Record<string, string> = {};
  for (const t of Object.values(s.translations))
    if (!t.removed && ((t.blockId && blockIdMap[t.blockId]) || t.variantId === sv.id))
      translationIdMap[t.id] = newId<"translation">();
  out.push({
    type: "ForkVariant",
    occurrenceId: mo.id,
    newVariantId: newVariantId as never,
    blockIdMap: blockIdMap as never,
    translationIdMap: translationIdMap as never,
    sourceVariantId: sv.id,
  });
  // 2D-scenen: spinoffens, ellers en kopi av hovedfilmens (så bildet ikke forsvinner)
  const sc = compositionOfVariant(s, sv.id);
  const mc = compositionOfVariant(s, mo.variantId);
  if (sc) out.push(...compositionCopyCommands(s, sc.id, newVariantId, blockIdMap));
  else if (mc) {
    // Hovedfilmens linjer → de nye (samme nøkkel)
    const map: Record<string, string> = {};
    for (const b of allBlocks(s, mo.variantId)) {
      const x = byKey.get(b.orderKey);
      if (x && blockIdMap[x.id]) map[b.id] = blockIdMap[x.id]!;
    }
    out.push(...compositionCopyCommands(s, mc.id, newVariantId, map));
  }
  return { commands: out, blocked: null };
}

/**
 * «Overfør ny spinoff-scene til hovedfilmen» (REQ-0381): scenen legges inn i hovedfilmen med egen kopi av
 * spinoffens versjon og 2D-scene, etter scenen som kommer før den i spinoffen (hvis den finnes i
 * hovedfilmen), ellers sist. Lyd og tidskoblinger følger med når `withAudio`.
 */
export function transferSceneCommands(
  s: ProjectState,
  spinOccurrenceId: string,
  opts: { readonly withAudio?: boolean; readonly afterMainOccurrenceId?: string | null } = {},
): PromotionPlan {
  const so = s.occurrences[spinOccurrenceId];
  const main = mainProduction(s);
  if (!so || !main) return { commands: [], blocked: "Fant ikke scenen." };
  if (mainOccurrenceOf(s, so.id))
    return { commands: [], blocked: "Scenen finnes allerede i hovedfilmen." };
  const sv = s.variants[so.variantId]!;
  const mainOccs = orderedOccurrences(s, main.id);
  // Plassen: etter forrige scene i spinoffen som også er i hovedfilmen
  let after: SceneOccurrence | null = null;
  if (opts.afterMainOccurrenceId !== undefined)
    after = opts.afterMainOccurrenceId ? (s.occurrences[opts.afterMainOccurrenceId] ?? null) : null;
  else {
    const spinOccs = orderedOccurrences(s, so.productionId);
    const i = spinOccs.findIndex((o) => o.id === so.id);
    for (let j = i - 1; j >= 0 && !after; j--)
      after = mainOccs.find((m) => m.sceneId === spinOccs[j]!.sceneId) ?? null;
    if (!after) after = i === 0 ? null : (mainOccs[mainOccs.length - 1] ?? null);
  }
  const idx = after ? mainOccs.findIndex((m) => m.id === after!.id) : -1;
  const orderKey = keyBetween(
    idx >= 0 ? mainOccs[idx]!.orderKey : null,
    mainOccs[idx + 1]?.orderKey ?? null,
  );
  const occurrenceId = newId<"scene_occurrence">();
  const newVariantId = newId<"scene_variant">();
  const blocks = allBlocks(s, sv.id);
  const blockIdMap: Record<string, string> = {};
  for (const b of blocks) blockIdMap[b.id] = newId<"script_block">();
  const translationIdMap: Record<string, string> = {};
  for (const t of Object.values(s.translations))
    if (!t.removed && ((t.blockId && blockIdMap[t.blockId]) || t.variantId === sv.id))
      translationIdMap[t.id] = newId<"translation">();
  const out: Command[] = [
    {
      type: "TransferScene",
      productionId: main.id as never,
      occurrenceId: occurrenceId as never,
      orderKey,
      sourceVariantId: sv.id,
      newVariantId: newVariantId as never,
      blockIdMap: blockIdMap as never,
      translationIdMap: translationIdMap as never,
    },
  ];
  const sc = compositionOfVariant(s, sv.id);
  if (sc) out.push(...compositionCopyCommands(s, sc.id, newVariantId, blockIdMap));
  if (opts.withAudio !== false) {
    const audio = Object.values(s.audioClips).filter((a) => a.occurrenceId === so.id && !a.removed);
    if (audio.length)
      out.push({
        type: "AddAudioClips",
        clips: audio.map((a) => ({
          clipId: newId<"audio_clip">() as never,
          fields: {
            ...audioClipFieldsOf(a),
            occurrenceId: occurrenceId as never,
            blockId: (a.blockId ? (blockIdMap[a.blockId] ?? null) : null) as never,
          },
        })),
      });
    const links = Object.values(s.timeLinks).filter(
      (l) => l.occurrenceId === so.id && !l.removed && !l.layerId && blockIdMap[l.blockId],
    );
    if (links.length)
      out.push({
        type: "AddTimeLinks",
        links: links.map((l) => ({
          linkId: newId<"time_link">() as never,
          fields: {
            occurrenceId: occurrenceId as never,
            blockId: blockIdMap[l.blockId]! as never,
            startMs: l.startMs,
            endMs: l.endMs,
          },
        })),
      });
  }
  return { commands: out, blocked: null };
}

/** Teller endringene som et valg fører over (for knappen «Overfør …»). */
export function choiceSize(c: PromotionComparison, ch: PromotionChoice): number {
  return (
    ch.lines.length +
    (ch.heading && c.heading.changed ? 1 : 0) +
    ch.layers.length +
    (ch.camera && c.camera.changed ? 1 : 0) +
    (ch.background && c.visual.background ? 1 : 0) +
    (ch.audio ? c.audio.filter((a) => a.status !== "same").length : 0) +
    (ch.timing && c.timing.changed ? 1 : 0) +
    (ch.film && c.film.changed ? 1 : 0)
  );
}

/**
 * Ta med en av hovedfilmens scener i en avledet produksjon (fra kontinuitetsanalysen, DEC-0060): scenen
 * legges inn der den hører hjemme etter hovedfilmens rekkefølge, som referanse til samme versjon.
 */
export function includeSceneCommands(
  s: ProjectState,
  productionId: string,
  mainOccurrenceId: string,
): Command[] {
  const m = s.occurrences[mainOccurrenceId];
  const main = mainProduction(s);
  if (!m || !main || m.productionId !== main.id) return [];
  const own = orderedOccurrences(s, productionId);
  const there = own.find((o) => o.sceneId === m.sceneId);
  // Scenen er med, men deaktivert: slå den på
  if (there)
    return there.active
      ? []
      : [{ type: "SetOccurrenceActive", occurrenceId: there.id, active: true }];
  const mainOrder = new Map(orderedOccurrences(s, main.id).map((o, i) => [o.sceneId, i]));
  const at = mainOrder.get(m.sceneId) ?? Number.MAX_SAFE_INTEGER;
  // Etter den siste scenen i produksjonen som kommer før i hovedfilmen
  let prev: SceneOccurrence | null = null;
  let next: SceneOccurrence | null = null;
  for (const o of own) {
    const i = mainOrder.get(o.sceneId);
    if (i === undefined) continue;
    if (i < at) prev = o;
    else if (!next) next = o;
  }
  const after = prev ? own.indexOf(prev) : -1;
  const before = next ? own.indexOf(next) : own.length;
  const lo = after >= 0 ? own[after]!.orderKey : null;
  const hi = before < own.length ? own[before]!.orderKey : null;
  // Spinoffens egne scener mellom: legg den rett etter forgjengeren
  const hi2 = after + 1 < own.length && after + 1 <= before ? own[after + 1]!.orderKey : hi;
  return [
    {
      type: "AddOccurrence",
      productionId: productionId as never,
      occurrenceId: newId<"scene_occurrence">() as never,
      sceneId: m.sceneId,
      variantId: m.variantId,
      orderKey: keyBetween(lo, hi2 ?? null),
    },
  ];
}
