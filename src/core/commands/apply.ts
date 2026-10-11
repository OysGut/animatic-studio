/**
 * Utfører én kommando mot prosjekttilstanden. Ren funksjon: (tilstand, kommando) → ny tilstand + invers.
 * Samme funksjon brukes i klienten (rask tilbakemelding) og på serveren (autoritativ, DEC-0022).
 */
import {
  isUuid,
  type AssetVariantId,
  type BlockId,
  type ContinuityEventId,
  type TranslationId,
  type LayerId,
  type SceneId,
  type TakeId,
  type VariantId,
} from "../ids";
import { checkInvariants } from "../invariants";
import {
  formatMapping,
  isAllowedFps,
  rescaleComposition,
  rescaleLayer,
  sameFps,
} from "../composition/format";
import {
  normalizeCamera,
  normalizeCompositionFields,
  normalizeLayerFields,
} from "../composition/fields";
import { compareKeys, isValidOrderKey, keyBetween, keysEvenly } from "../order-key";
import { compositionOfVariant } from "../composition/render";
import {
  MAX_TRANSITION_FRAMES,
  TRANSITION_KINDS,
  CONTINUITY_KINDS,
  type ContinuityEvent,
  type Translation,
  PRIMARY_LANGUAGE,
  type Annotation,
  type AudioClip,
  type BlockRevision,
  type CompositionLayer,
  type ProjectState,
  type ScriptBlock,
  type ClipPart,
  type Take,
  type TakeMedia,
  type TimeLink,
  type Transition,
  type TransitionKind,
  type ProductionSegment,
  type SegmentReason,
} from "../model";
import { MAX_PROMPT_CHARS } from "../generation/prompt";
import type {
  NewAnnotation,
  AssetFields,
  AudioClipFields,
  AssetVariantFields,
  ClipPartFields,
  Command,
  CompositionFields,
  TimeLinkFields,
  ContinuityEventFields,
  TranslationFields,
  LayerFields,
  CommandEnvelope,
  CommandError,
  CommandErrorCode,
} from "./types";

export type ApplyResult =
  | {
      readonly ok: true;
      readonly state: ProjectState;
      /** Kommandoen som reverserer denne (for angre per bruker, ADR-0005). */
      readonly inverse: Command;
      /** ID-er for entiteter som ble opprettet eller endret. */
      readonly affected: readonly string[];
    }
  | { readonly ok: false; readonly error: CommandError };

class CommandFailure extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string,
    readonly details?: readonly string[],
  ) {
    super(message);
  }
}

function fail(code: CommandErrorCode, message: string, details?: readonly string[]): never {
  throw new CommandFailure(code, message, details);
}

function need<T>(value: T | undefined, what: string): T {
  // Samlingene er vanlige objekter: «__proto__» eller «constructor» som ID må ikke gi treff
  if (
    value === undefined ||
    value === null ||
    typeof value === "function" ||
    (typeof value === "object" && !Object.prototype.hasOwnProperty.call(value, "id"))
  )
    fail("not_found", `${what} finnes ikke`);
  return value;
}

function assertNewId(s: ProjectState, id: string) {
  if (!isUuid(id)) fail("invalid", `Ugyldig ID ${id}`);
  const all = [
    s.productions,
    s.scenes,
    s.variants,
    s.blocks,
    s.occurrences,
    s.segments,
    s.takes,
    s.assets,
    s.assetVariants,
    s.assetVersions,
    s.annotations,
    s.compositions,
    s.layers,
    s.audioClips,
    s.clipParts,
    s.timeLinks,
    s.generationPrompts,
    s.continuityEvents,
    s.translations,
  ];
  if (all.some((c) => c[id] !== undefined)) fail("duplicate_id", `ID ${id} er allerede i bruk`);
}

// ---------- Ressursbiblioteket ----------

export const ASSET_KINDS = [
  "character",
  "object",
  "location",
  "animal",
  "environment",
  "other",
  "sound",
] as const;
export const ASSET_NAME_KINDS = ["alias", "nickname", "former", "language"] as const;
export const VISUAL_STYLES = [
  "reference",
  "illustrated",
  "realistic",
  "animatic",
  "poster",
  "other",
] as const;
export const ASSET_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
/** Lydformater for ressurser av typen «sound» (DEC-0044). */
export const AUDIO_MIME_TYPES: readonly string[] = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "audio/x-flac",
];
/** Lengste lydfil og lengste lydklipp: 10 timer. */
export const AUDIO_MAX_MS = 36_000_000;
/** Maks filstørrelse for et bilde: 2 GB (Lovable Clouds standard per fil, DEC-0032). */
export const ASSET_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Kontrollerer og rydder feltene (trimmer, fjerner duplikater). Samme regler i klient og server. */
function normalizeAssetFields(f: AssetFields): AssetFields {
  if (
    !f ||
    typeof f.name !== "string" ||
    typeof f.description !== "string" ||
    typeof f.category !== "string" ||
    !Array.isArray(f.names) ||
    !Array.isArray(f.tags) ||
    f.names.some(
      (n) =>
        !n ||
        typeof n.name !== "string" ||
        (n.language !== null && n.language !== undefined && typeof n.language !== "string"),
    ) ||
    f.tags.some((t) => typeof t !== "string")
  )
    fail("invalid", "Ufullstendige ressursfelter");
  if (!(ASSET_KINDS as readonly string[]).includes(f.kind)) fail("invalid", "Ukjent ressurstype");
  const name = f.name.trim();
  if (!name || name.length > 200) fail("invalid", "Ressursen må ha et navn (maks 200 tegn)");
  if (f.description.length > 5000) fail("invalid", "Beskrivelsen er for lang");
  if (f.category.trim().length > 100) fail("invalid", "Kategorien er for lang");
  if (f.names.length > 50) fail("invalid", "For mange alternative navn");
  if (f.tags.length > 30) fail("invalid", "For mange stikkord");
  const seenNames = new Set([name.toLocaleLowerCase("nb")]);
  const names = [];
  for (const n of f.names) {
    const t = n.name.trim();
    if (!t) continue;
    if (t.length > 200) fail("invalid", "Et alternativt navn er for langt");
    if (!(ASSET_NAME_KINDS as readonly string[]).includes(n.kind))
      fail("invalid", "Ukjent navnetype");
    const key = t.toLocaleLowerCase("nb");
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const language = n.language?.trim() || null;
    if (language !== null && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language))
      fail("invalid", "Ugyldig språkkode");
    names.push({ name: t, kind: n.kind, language });
  }
  const tags: string[] = [];
  for (const t of f.tags) {
    const x = t.trim();
    if (!x) continue;
    if (x.length > 50) fail("invalid", "Et stikkord er for langt");
    if (!tags.some((y) => y.toLocaleLowerCase("nb") === x.toLocaleLowerCase("nb"))) tags.push(x);
  }
  return {
    kind: f.kind,
    name,
    names,
    description: f.description.trim(),
    category: f.category.trim(),
    tags,
  };
}

function normalizeVariantFields(f: AssetVariantFields): AssetVariantFields {
  if (!f || typeof f.name !== "string" || typeof f.appearance !== "string")
    fail("invalid", "Ufullstendige variantfelter");
  const name = f.name.trim();
  if (!name || name.length > 200) fail("invalid", "Varianten må ha et navn (maks 200 tegn)");
  if (!(VISUAL_STYLES as readonly string[]).includes(f.style)) fail("invalid", "Ukjent stil");
  if (f.appearance.trim().length > 500) fail("invalid", "Utseendebeskrivelsen er for lang");
  return { name, style: f.style, appearance: f.appearance.trim() };
}

// ---------- Notater ----------

function normalizeAnnotation(s: ProjectState, n: NewAnnotation, now: string): Annotation {
  const text = n.text.trim();
  if (!text || text.length > 10_000) fail("invalid", "Notatet må ha tekst (maks 10 000 tegn)");
  const authorName = n.authorName.trim().slice(0, 100);
  const stampAt = n.stampAt ?? now;
  if (typeof stampAt !== "string" || Number.isNaN(Date.parse(stampAt)))
    fail("invalid", "Ugyldig tidspunkt for notatet");
  if (typeof n.quote !== "string" || n.quote.length > 5000) fail("invalid", "Ugyldig sitat");
  if (n.blockId !== null) {
    const b = need(s.blocks[n.blockId], "Blokken");
    if (b.removed) fail("invalid", "Blokken er fjernet");
    if (n.variantId !== null) fail("invalid", "Et notat på tekst har ikke scene i tillegg");
    if (n.quote === "") {
      // Notat på hele elementet: ingen tekstområde, følger hele teksten også etter endringer
      if (n.start !== 0 || n.end !== 0) fail("invalid", "Ugyldig tekstområde for notatet");
    } else {
      if (!Number.isInteger(n.start) || !Number.isInteger(n.end) || n.start < 0 || n.end <= n.start)
        fail("invalid", "Ugyldig tekstområde for notatet");
      if (b.text.slice(n.start, n.end) !== n.quote) {
        // Teksten er endret siden (f.eks. gjør om etter angre): finn det markerte nærmest samme sted
        let best = -1;
        for (let i = b.text.indexOf(n.quote); i >= 0; i = b.text.indexOf(n.quote, i + 1))
          if (best < 0 || Math.abs(i - n.start) < Math.abs(best - n.start)) best = i;
        if (best < 0) fail("invalid", "Den markerte teksten finnes ikke i manuset");
        return {
          ...base(),
          start: best,
          end: best + n.quote.length,
        };
      }
    }
  } else {
    if (n.variantId === null) fail("invalid", "Notatet må høre til en scene eller tekst");
    need(s.variants[n.variantId], "Scenen");
    if (n.start !== 0 || n.end !== 0 || n.quote !== "")
      fail("invalid", "En nål på scenen har ikke tekstområde");
  }
  return base();

  function base(): Annotation {
    return {
      id: n.annotationId,
      revision: 1,
      variantId: n.variantId,
      blockId: n.blockId,
      start: n.start,
      end: n.end,
      quote: n.quote,
      text,
      authorName: authorName || "Ukjent",
      stampAt: new Date(stampAt as string).toISOString(),
      editedByName: null,
      editedAt: null,
      removed: false,
    };
  }
}

function assertKey(key: string) {
  if (!isValidOrderKey(key)) fail("invalid", `Ugyldig sorteringsnøkkel ${key}`);
}

/** Finn revisjonen til en entitet uansett samling. */
/** Revisjon per entitet (for baseRevisions ved angre/gjør om, INV-C1). Entiteter som ikke finnes, utelates. */
export function revisionsOf(s: ProjectState, ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const r = revisionOf(s, id);
    if (r !== undefined) out[id] = r;
  }
  return out;
}

export function revisionOf(s: ProjectState, id: string): number | undefined {
  if (id === s.project.id) return s.project.revision;
  for (const c of [
    s.productions,
    s.scenes,
    s.variants,
    s.blocks,
    s.occurrences,
    s.segments,
    s.takes,
    s.assets,
    s.assetVariants,
    s.assetVersions,
    s.annotations,
    s.compositions,
    s.layers,
    s.audioClips,
    s.clipParts,
    s.timeLinks,
    s.generationPrompts,
    s.continuityEvents,
    s.translations,
  ]) {
    const e = c[id];
    if (e) return e.revision;
  }
  return undefined;
}

function currentBlockRevisions(s: ProjectState, variantId: VariantId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of Object.values(s.blocks))
    if (b.variantId === variantId && !b.removed) out[b.id] = b.currentRev;
  return out;
}

/** Kan blokker i denne varianten redigeres i produksjonen? (INV-04, mandat 24.5) */
function assertCanEditVariant(s: ProjectState, productionId: string, variantId: VariantId) {
  const variant = need(s.variants[variantId], "Varianten");
  const production = need(s.productions[productionId], "Produksjonen");
  if (variant.ownerProductionId === null) {
    if (production.kind !== "main") {
      fail(
        "must_fork_variant",
        "Scenen deles med hovedfilmen. Endringer i denne produksjonen lagres som egen versjon av scenen.",
      );
    }
  } else if (variant.ownerProductionId !== productionId) {
    fail("must_fork_variant", "Denne versjonen av scenen tilhører en annen produksjon");
  }
}

// ---------- 2D-sceneeditor (M3 del 2, DEC-0035) ----------

function compositionFields(f: CompositionFields): CompositionFields {
  const r = normalizeCompositionFields(f);
  if (!r.ok) fail("invalid", r.error);
  return r.value;
}

/**
 * Brukes ressursen, varianten eller versjonen av et lag (eget bilde eller bildeskifte, også slettede lag som
 * kan hentes tilbake)? Da kan den ikke angres bort (DEC-0052).
 */
function usedByLayer(
  s: ProjectState,
  key: "assetId" | "assetVariantId" | "versionId",
  id: string,
): boolean {
  return Object.values(s.layers).some(
    (l) =>
      l[key] === id ||
      l.swaps.some((w) => w[key] === id) ||
      (key !== "assetId" && (l.languageImages ?? []).some((li) => li[key] === id)),
  );
}

function layerFields(s: ProjectState, f: LayerFields, prev?: CompositionLayer): LayerFields {
  // En eldre klient uten feltene for bildeskifte, bane og ankerpunkt skal ikke slette dem (DEC-0052)
  if (prev)
    f = {
      ...f,
      swaps: f.swaps ?? prev.swaps,
      path: f.path === undefined ? prev.path : f.path,
      anchor: f.anchor === undefined ? prev.anchor : f.anchor,
      // Språkavhengige bilder (DEC-0059): utelatt = uendret
      languageImages: f.languageImages ?? prev.languageImages ?? [],
    };
  // Nytt bilde i laget (annen ressurs): bilder per språk av den gamle ressursen passer ikke lenger
  if (prev && f.assetId !== prev.assetId)
    f = {
      ...f,
      languageImages: (f.languageImages ?? []).filter(
        (li) => f.assetId !== null && s.assetVariants[li.assetVariantId]?.assetId === f.assetId,
      ),
    };
  const r = normalizeLayerFields(f);
  if (!r.ok) fail("invalid", r.error);
  const v = r.value;
  if (v.assetId !== null && need(s.assets[v.assetId], "Ressursen").kind === "sound")
    fail("invalid", "En lydfil kan ikke vises som lag");
  if (v.assetVariantId !== null) {
    const va = need(s.assetVariants[v.assetVariantId], "Varianten av ressursen");
    if (va.assetId !== v.assetId) fail("invalid", "Varianten hører til en annen ressurs");
  }
  if (v.versionId !== null) {
    const ve = need(s.assetVersions[v.versionId], "Bildeversjonen");
    if (ve.variantId !== v.assetVariantId) fail("invalid", "Versjonen hører til en annen variant");
  }
  // Bildeskifter: samme kontroll som lagets eget bilde (uendrede skifter kontrolleres ikke på nytt)
  const old = new Set((prev?.swaps ?? []).map((w) => JSON.stringify(w)));
  for (const w of v.swaps) {
    if (old.has(JSON.stringify(w))) continue;
    if (need(s.assets[w.assetId], "Bildet i bildeskiftet").kind === "sound")
      fail("invalid", "En lydfil kan ikke vises som lag");
    if (w.assetVariantId !== null) {
      const va = need(s.assetVariants[w.assetVariantId], "Varianten av ressursen");
      if (va.assetId !== w.assetId) fail("invalid", "Varianten hører til en annen ressurs");
    }
    if (w.versionId !== null) {
      const ve = need(s.assetVersions[w.versionId], "Bildeversjonen");
      if (ve.variantId !== w.assetVariantId)
        fail("invalid", "Versjonen hører til en annen variant");
    }
  }
  // Språkavhengige bilder (DEC-0059, REQ-0337): en variant av lagets egen ressurs (uendrede kontrolleres
  // ikke på nytt, som bildeskifter)
  const oldLang = new Set((prev?.languageImages ?? []).map((x) => JSON.stringify(x)));
  for (const li of v.languageImages ?? []) {
    if (prev && prev.assetId === v.assetId && oldLang.has(JSON.stringify(li))) continue;
    const va = need(s.assetVariants[li.assetVariantId], "Varianten for språket");
    if (va.assetId !== v.assetId)
      fail("invalid", "Bildet for et språk må være en variant av samme ressurs som laget");
    if (li.versionId !== null) {
      const ve = need(s.assetVersions[li.versionId], "Bildeversjonen for språket");
      if (ve.variantId !== li.assetVariantId)
        fail("invalid", "Versjonen hører til en annen variant");
    }
  }
  return v;
}

function fieldsOfLayer(l: CompositionLayer): LayerFields {
  return {
    kind: l.kind,
    name: l.name,
    assetId: l.assetId,
    assetVariantId: l.assetVariantId,
    versionId: l.versionId,
    fill: l.fill,
    width: l.width,
    height: l.height,
    parallax: l.parallax,
    transform: l.transform,
    keyframes: l.keyframes,
    visible: l.visible,
    locked: l.locked,
    groupId: l.groupId,
    swaps: l.swaps,
    path: l.path,
    anchor: l.anchor,
    ...(l.languageImages?.length ? { languageImages: l.languageImages } : {}),
  };
}

/**
 * Grupper (DEC-0052): et lag som legges i en gruppe, må peke på et gruppelag i samme 2D-scene som ikke er
 * slettet. Bare lag som får ny gruppe kontrolleres (en slettet gruppe gjør bare at lagene står fritt).
 */
function checkGroups(before: ProjectState, after: ProjectState, ids: readonly string[]): void {
  for (const id of ids) {
    const l = after.layers[id];
    if (!l || l.groupId === null || before.layers[id]?.groupId === l.groupId) continue;
    const g = after.layers[l.groupId];
    if (!g || g.kind !== "group" || g.compositionId !== l.compositionId || g.id === l.id)
      fail("invalid", "Gruppen finnes ikke i denne 2D-scenen");
    if (g.removed) fail("invalid", "Gruppen er slettet");
  }
}

function sortedLayerKeys(s: ProjectState, compositionId: string, except?: string): string[] {
  return Object.values(s.layers)
    .filter((l) => l.compositionId === compositionId && l.id !== except)
    .map((l) => l.orderKey)
    .sort(compareKeys);
}

const MAX_CAMERA_JSON = 64 * 1024;

/** Flest deler i ett klipp (DEC-0048). */
export const MAX_CLIP_PARTS = 200;

function partFieldsOf(p: ClipPartFields): ClipPartFields {
  if (!p || typeof p !== "object" || !isUuid(String(p.partId))) fail("invalid", "Ugyldig del");
  if (p.source !== "take" && p.source !== "composition") fail("invalid", "Ugyldig kilde for delen");
  if ((p.source === "take") !== (p.takeId !== null && p.takeId !== undefined))
    fail("invalid", "Delen må ha versjon bare når kilden er film");
  if (
    !Number.isInteger(p.inMs) ||
    !Number.isInteger(p.outMs) ||
    p.inMs < 0 ||
    p.outMs <= p.inMs ||
    p.outMs > AUDIO_MAX_MS
  )
    fail("invalid", "Inn- og utpunkt må være hele millisekunder, og ut må være etter inn");
  return {
    partId: p.partId,
    source: p.source,
    takeId: p.source === "take" ? p.takeId : null,
    inMs: p.inMs,
    outMs: p.outMs,
  };
}

/** Lengste beskrivelse av en kontinuitetshendelse. */
export const CONTINUITY_DESCRIPTION_MAX = 2000;

function continuityFieldsOf(
  s: ProjectState,
  f: ContinuityEventFields,
  prev?: ContinuityEvent,
): Omit<ContinuityEvent, "id" | "revision" | "removed" | "disabledIn"> {
  if (!f || typeof f !== "object") fail("invalid", "Ugyldig kontinuitetshendelse");
  const a = need(s.assets[f.assetId], "Ressursen");
  if (a.kind === "sound" || a.kind === "location" || a.kind === "environment")
    fail("invalid", "Denne typen ressurs har ikke kontinuitet");
  if (!(CONTINUITY_KINDS as readonly string[]).includes(f.kind))
    fail("invalid", "Ukjent type kontinuitetshendelse");
  if (f.duration !== "permanent" && f.duration !== "temporary" && f.duration !== "scene")
    fail("invalid", "Ukjent varighet");
  if (f.status !== "approved" && f.status !== "dismissed") fail("invalid", "Ugyldig status");
  if (typeof f.description !== "string" || f.description.length > CONTINUITY_DESCRIPTION_MAX)
    fail("invalid", "Beskrivelsen er for lang");
  const variant = (id: AssetVariantId | null, what: string) => {
    if (id === null || id === undefined) return null;
    const v = need(s.assetVariants[id], what);
    if (v.assetId !== a.id) fail("invalid", `${what} hører ikke til ressursen`);
    return v.id;
  };
  let scene = need(s.scenes[f.sceneId], "Scenen");
  let blockId: BlockId | null = null;
  if (f.blockId !== null && f.blockId !== undefined) {
    const b = need(s.blocks[f.blockId], "Manusblokken");
    const lineScene = s.variants[b.variantId]?.sceneId;
    if (!lineScene) fail("invalid", "Manuslinjen hører ikke til en scene");
    // Scenen følger linjen (den kan ha flyttet ved deling eller sammenslåing siden hendelsen ble laget)
    scene = need(s.scenes[lineScene], "Scenen");
    blockId = b.id;
  }
  let untilSceneId: SceneId | null = null;
  if (f.duration === "temporary") {
    if (f.untilSceneId === null || f.untilSceneId === undefined)
      fail("invalid", "Velg scenen der endringen er over");
    untilSceneId = need(s.scenes[f.untilSceneId], "Scenen der endringen er over").id;
    if (untilSceneId === scene.id) fail("invalid", "Endringen må vare til en senere scene");
  }
  // Lokal for en avledet produksjon (DEC-0060); utelatt ved endring = uendret
  const productionId = f.productionId === undefined ? (prev?.productionId ?? null) : f.productionId;
  if (productionId !== null) {
    const p = need(s.productions[productionId], "Produksjonen");
    if (p.kind === "main") fail("invalid", "Hovedfilmens hendelser er ikke lokale");
    if (prev && !prev.productionId)
      fail(
        "invalid",
        "En hendelse fra hovedfilmen kan ikke gjøres lokal. Slå den av i spinoffen i stedet.",
      );
  } else if (prev?.productionId)
    fail("invalid", "En lokal hendelse kan ikke flyttes til hovedfilmen");
  return {
    ...(productionId !== null ? { productionId: productionId as never } : {}),
    assetId: a.id,
    kind: f.kind,
    description: f.description.trim(),
    fromVariantId: variant(f.fromVariantId, "Utseendet før"),
    toVariantId: variant(f.toVariantId, "Utseendet etter"),
    duration: f.duration,
    sceneId: scene.id,
    blockId,
    untilSceneId,
    status: f.status,
  };
}

/** Lengste oversatte tekst (som manusblokker). */
const TRANSLATION_MAX = 20000;

function translationFieldsOf(
  s: ProjectState,
  f: TranslationFields,
): Omit<Translation, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object") fail("invalid", "Ugyldig oversettelse");
  if (typeof f.language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(f.language))
    fail("invalid", "Ugyldig språkkode");
  if (f.language === "nb" || f.language === "no")
    fail("invalid", "Norsk er hovedmanuset og oversettes ikke");
  if (typeof f.text !== "string" || f.text.length > TRANSLATION_MAX)
    fail("invalid", "Oversettelsen er for lang");
  if (!f.text.trim()) fail("invalid", "Oversettelsen er tom. Fjern den i stedet.");
  if (f.status !== "approved" && f.status !== "uncertain") fail("invalid", "Ugyldig status");
  const hasBlock = f.blockId !== null && f.blockId !== undefined;
  const hasVariant = f.variantId !== null && f.variantId !== undefined;
  if (hasBlock === hasVariant)
    fail("invalid", "En oversettelse gjelder én linje eller ett scenehode");
  if (!Number.isInteger(f.basedOnRev) || f.basedOnRev < 0) fail("invalid", "Ugyldig revisjon");
  if (hasBlock) {
    const b = need(s.blocks[f.blockId!], "Manusblokken");
    if (f.basedOnRev > b.currentRev) fail("invalid", "Revisjonen finnes ikke");
    return {
      blockId: b.id,
      variantId: null,
      language: f.language,
      text: f.text,
      basedOnRev: f.basedOnRev,
      status: f.status,
    };
  }
  const v = need(s.variants[f.variantId!], "Scenen");
  // Scenehodet: revisjonen av scenevarianten da det ble oversatt (endret hode → gjennomgå)
  if (f.basedOnRev > v.revision) fail("invalid", "Revisjonen finnes ikke");
  return {
    blockId: null,
    variantId: v.id,
    language: f.language,
    text: f.text,
    basedOnRev: f.basedOnRev,
    status: f.status,
  };
}

const translationKey = (t: Pick<Translation, "blockId" | "variantId" | "language">) =>
  `${t.blockId ?? t.variantId}:${t.language}`;

function continuityFieldsFrom(e: ContinuityEvent): ContinuityEventFields {
  return {
    assetId: e.assetId,
    kind: e.kind,
    description: e.description,
    fromVariantId: e.fromVariantId,
    toVariantId: e.toVariantId,
    duration: e.duration,
    sceneId: e.sceneId,
    blockId: e.blockId,
    untilSceneId: e.untilSceneId,
    status: e.status,
    ...(e.productionId ? { productionId: e.productionId } : {}),
  };
}

/**
 * Når en forekomst får egen scenevariant (ForkVariant) eller går tilbake (angre), følger forekomstens
 * lydkoblinger, tidskoblinger og produksjonssegmenter med til de tilsvarende blokkene (DEC-0057).
 */
function remapOccurrenceBlocks(
  s: ProjectState,
  occurrenceId: string,
  map: Readonly<Record<string, BlockId>>,
): {
  state: Pick<ProjectState, "audioClips" | "timeLinks" | "segments" | "takes">;
  affected: string[];
} {
  const affected: string[] = [];
  // Godkjent grunnlag for forekomstens versjoner (DEC-0054) følger blokkene
  const takes = { ...s.takes };
  for (const t of Object.values(s.takes)) {
    if (t.occurrenceId !== occurrenceId) continue;
    const base = (t.acceptedFrom ?? t.producedFrom).blockRevisions;
    if (!Object.keys(base).some((k) => map[k])) continue;
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(base)) next[map[k] ?? k] = v;
    // Tilbake til det opprinnelige grunnlaget (angre): ingen egen godkjenning
    const pf = t.producedFrom.blockRevisions;
    const back =
      Object.keys(next).length === Object.keys(pf).length &&
      Object.entries(next).every(([k, v]) => pf[k] === v);
    const { acceptedFrom: _a, ...rest } = t;
    takes[t.id] = back
      ? { ...rest, revision: t.revision + 1 }
      : { ...t, acceptedFrom: { blockRevisions: next }, revision: t.revision + 1 };
    affected.push(t.id);
  }
  const to = (id: BlockId | null) => (id && map[id] ? map[id]! : id);
  const audioClips = { ...s.audioClips };
  for (const a of Object.values(s.audioClips))
    if (a.occurrenceId === occurrenceId && a.blockId && map[a.blockId]) {
      audioClips[a.id] = { ...a, blockId: to(a.blockId), revision: a.revision + 1 };
      affected.push(a.id);
    }
  const timeLinks = { ...s.timeLinks };
  for (const t of Object.values(s.timeLinks))
    if (t.occurrenceId === occurrenceId && map[t.blockId]) {
      timeLinks[t.id] = { ...t, blockId: to(t.blockId)!, revision: t.revision + 1 };
      affected.push(t.id);
    }
  const segments = { ...s.segments };
  for (const g of Object.values(s.segments))
    if (
      g.occurrenceId === occurrenceId &&
      ((g.startBlockId && map[g.startBlockId]) || (g.endBlockId && map[g.endBlockId]))
    ) {
      segments[g.id] = {
        ...g,
        startBlockId: to(g.startBlockId),
        endBlockId: to(g.endBlockId),
        revision: g.revision + 1,
      };
      affected.push(g.id);
    }
  return { state: { audioClips, timeLinks, segments, takes }, affected };
}

function timeLinkFieldsOf(
  s: ProjectState,
  f: TimeLinkFields,
): Omit<TimeLink, "id" | "revision" | "removed"> {
  if (!f || typeof f !== "object") fail("invalid", "Ugyldig tidskobling");
  const o = need(s.occurrences[f.occurrenceId], "Forekomsten");
  const b = need(s.blocks[f.blockId], "Manusblokken");
  if (b.variantId !== o.variantId) fail("invalid", "Blokken hører ikke til scenen");
  if (!Number.isInteger(f.startMs) || f.startMs < 0 || f.startMs > AUDIO_MAX_MS)
    fail("invalid", "Ugyldig tid for tidskoblingen");
  if (
    f.endMs !== null &&
    (!Number.isInteger(f.endMs) || f.endMs <= f.startMs || f.endMs > AUDIO_MAX_MS)
  )
    fail("invalid", "Slutten på tidskoblingen må være etter starten");
  let layerId: LayerId | null = null;
  if (f.layerId !== undefined && f.layerId !== null) {
    const l = need(s.layers[f.layerId], "Laget");
    const comp = compositionOfVariant(s, o.variantId);
    if (!comp || l.compositionId !== comp.id)
      fail("invalid", "Laget hører ikke til scenens 2D-scene");
    layerId = l.id;
  }
  return { occurrenceId: o.id, blockId: b.id, startMs: f.startMs, endMs: f.endMs, layerId };
}

/** Filmformater som kan importeres (DEC-0047). */
export const FILM_MIME_TYPES: readonly string[] = ["video/mp4", "video/quicktime", "video/webm"];

/** Kontroll av filinformasjonen for importert film. */
function takeMediaOf(m: unknown): TakeMedia {
  if (!m || typeof m !== "object") fail("invalid", "Ugyldig filinformasjon for filmen");
  const x = m as Record<string, unknown>;
  const optPos = (v: unknown, max: number) =>
    v === null || (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max);
  if (
    typeof x["fileName"] !== "string" ||
    x["fileName"].length < 1 ||
    x["fileName"].length > 255 ||
    typeof x["mimeType"] !== "string" ||
    !FILM_MIME_TYPES.includes(x["mimeType"]) ||
    !Number.isInteger(x["byteSize"]) ||
    (x["byteSize"] as number) <= 0 ||
    (x["byteSize"] as number) > ASSET_MAX_BYTES ||
    !optPos(x["width"], 16384) ||
    !optPos(x["height"], 16384) ||
    !optPos(x["fps"], 1000) ||
    !Number.isInteger(x["durationMs"]) ||
    (x["durationMs"] as number) <= 0 ||
    (x["durationMs"] as number) > AUDIO_MAX_MS ||
    !(
      x["videoCodec"] === null ||
      (typeof x["videoCodec"] === "string" && x["videoCodec"].length <= 40)
    ) ||
    typeof x["hasAudio"] !== "boolean"
  )
    fail("invalid", "Ugyldig filinformasjon for filmen");
  return {
    fileName: x["fileName"] as string,
    mimeType: x["mimeType"] as string,
    byteSize: x["byteSize"] as number,
    width: x["width"] as number | null,
    height: x["height"] as number | null,
    fps: x["fps"] as number | null,
    durationMs: x["durationMs"] as number,
    videoCodec: x["videoCodec"] as string | null,
    hasAudio: x["hasAudio"] as boolean,
  };
}

function transitionOf(t: unknown): Transition {
  if (!t || typeof t !== "object") fail("invalid", "Ugyldig overgang");
  const x = t as Record<string, unknown>;
  const kind = x["kind"];
  if (!(TRANSITION_KINDS as readonly unknown[]).includes(kind)) fail("invalid", "Ugyldig overgang");
  if (kind === "cut") return { kind: "cut", frames: 0 };
  const frames = x["frames"];
  if (
    !Number.isInteger(frames) ||
    (frames as number) < 1 ||
    (frames as number) > MAX_TRANSITION_FRAMES
  )
    fail("invalid", `Overgangen må vare mellom 1 og ${MAX_TRANSITION_FRAMES} bilder`);
  if (x["overlap"] !== undefined && typeof x["overlap"] !== "boolean")
    fail("invalid", "Ugyldig overgang");
  return x["overlap"] === true
    ? { kind: kind as TransitionKind, frames: frames as number, overlap: true }
    : { kind: kind as TransitionKind, frames: frames as number };
}

export const AUDIO_KINDS = ["dialogue", "narration", "sfx", "ambience", "music"] as const;

/** Kontroll av et lydklipp (DEC-0044). */
function audioFields(
  s: ProjectState,
  f: AudioClipFields,
): Omit<AudioClipFields, "language"> & { language?: string } {
  if (!f || typeof f !== "object") fail("invalid", "Ugyldig lydklipp");
  if (!(AUDIO_KINDS as readonly string[]).includes(f.kind)) fail("invalid", "Ukjent lydtype");
  if (typeof f.name !== "string" || f.name.length > 200) fail("invalid", "Navnet er for langt");
  need(s.occurrences[f.occurrenceId], "Scenen");
  const asset = need(s.assets[f.assetId], "Lydfilen");
  if (asset.kind !== "sound") fail("invalid", "Ressursen er ikke en lydfil");
  if (f.assetVariantId !== null) {
    const va = need(s.assetVariants[f.assetVariantId], "Varianten av lydfilen");
    if (va.assetId !== f.assetId) fail("invalid", "Varianten hører til en annen ressurs");
  }
  if (f.versionId !== null) {
    const ve = need(s.assetVersions[f.versionId], "Lydversjonen");
    if (ve.variantId !== f.assetVariantId) fail("invalid", "Versjonen hører til en annen variant");
  }
  if (f.blockId !== null) {
    const b = need(s.blocks[f.blockId], "Replikken");
    const occ = s.occurrences[f.occurrenceId]!;
    if (b.variantId !== occ.variantId) fail("invalid", "Replikken hører til en annen scene");
  }
  const int = (v: number, lo: number, hi: number, what: string) => {
    if (!Number.isInteger(v) || v < lo || v > hi) fail("invalid", `Ugyldig ${what}`);
  };
  int(f.offsetMs, 0, AUDIO_MAX_MS, "start i scenen");
  int(f.sourceInMs, 0, AUDIO_MAX_MS, "start i lydfilen");
  int(f.lengthMs, 1, AUDIO_MAX_MS, "lengde");
  int(f.fadeInMs, 0, 600_000, "inntoning");
  int(f.fadeOutMs, 0, 600_000, "uttoning");
  if (typeof f.gainDb !== "number" || !Number.isFinite(f.gainDb) || f.gainDb < -60 || f.gainDb > 12)
    fail("invalid", "Volumet må være mellom −60 og +12 dB");
  if (typeof f.muted !== "boolean") fail("invalid", "Ugyldig demping");
  if (typeof f.continues !== "boolean") fail("invalid", "Ugyldig valg for «løper videre»");
  if (!Array.isArray(f.volumeKeys) || f.volumeKeys.length > 500)
    fail("invalid", "For mange volumpunkter (maks 500)");
  const keys = [...f.volumeKeys]
    .map((k) => {
      if (
        !k ||
        !Number.isInteger(k.t) ||
        k.t < 0 ||
        k.t > AUDIO_MAX_MS ||
        typeof k.db !== "number" ||
        !Number.isFinite(k.db) ||
        k.db < -60 ||
        k.db > 12
      )
        fail("invalid", "Ugyldig volumpunkt (tid i ms, nivå mellom −60 og +12 dB)");
      return { t: k.t, db: Math.round(k.db * 10) / 10 };
    })
    .sort((a, b) => a.t - b.t);
  for (let i = 1; i < keys.length; i++)
    if (keys[i]!.t === keys[i - 1]!.t) fail("invalid", "To volumpunkter på samme tid");
  // Språk (DEC-0059): språkkode eller «*» (felles); utelatt = standard for lydtypen
  const language = f.language ?? null;
  if (language !== null && language !== "*" && !LANGUAGE_CODE.test(String(language)))
    fail("invalid", "Ugyldig språk for lyden");
  return {
    occurrenceId: f.occurrenceId,
    kind: f.kind,
    name: f.name.trim(),
    assetId: f.assetId,
    assetVariantId: f.assetVariantId,
    versionId: f.versionId,
    blockId: f.blockId,
    offsetMs: f.offsetMs,
    sourceInMs: f.sourceInMs,
    lengthMs: f.lengthMs,
    gainDb: Math.round(f.gainDb * 10) / 10,
    fadeInMs: f.fadeInMs,
    fadeOutMs: f.fadeOutMs,
    muted: f.muted,
    continues: f.continues,
    volumeKeys: keys,
    ...(language !== null ? { language } : {}),
  };
}

/** Språkkode (DEC-0058/0059), f.eks. «nb», «en» eller «en-GB». */
const LANGUAGE_CODE = /^[a-z]{2}(-[A-Z]{2})?$/;

export function audioClipFieldsOf(a: AudioClip): AudioClipFields {
  return {
    occurrenceId: a.occurrenceId,
    kind: a.kind,
    name: a.name,
    assetId: a.assetId,
    assetVariantId: a.assetVariantId,
    versionId: a.versionId,
    blockId: a.blockId,
    offsetMs: a.offsetMs,
    sourceInMs: a.sourceInMs,
    lengthMs: a.lengthMs,
    gainDb: a.gainDb,
    fadeInMs: a.fadeInMs,
    fadeOutMs: a.fadeOutMs,
    muted: a.muted,
    continues: a.continues,
    volumeKeys: a.volumeKeys,
    ...(a.language !== undefined ? { language: a.language } : {}),
  };
}

function run(
  s: ProjectState,
  env: CommandEnvelope,
): { state: ProjectState; inverse: Command; affected: string[] } {
  const c = env.command;
  const rev = (e: { revision: number }) => e.revision + 1;
  const newRevision = (blockId: BlockId, revNo: number, text: string): BlockRevision => ({
    blockId,
    rev: revNo,
    text,
    author: env.actor,
    createdAt: env.at,
  });

  switch (c.type) {
    case "CreateProduction": {
      assertNewId(s, c.productionId);
      if (!c.name.trim()) fail("invalid", "Produksjonen må ha et navn");
      if (c.kind === "main" && Object.values(s.productions).some((p) => p.kind === "main")) {
        fail("invalid", "Prosjektet har allerede en hovedproduksjon");
      }
      if (c.parentProductionId !== null)
        need(s.productions[c.parentProductionId], "Overordnet produksjon");
      return {
        state: {
          ...s,
          productions: {
            ...s.productions,
            [c.productionId]: {
              id: c.productionId,
              revision: 1,
              kind: c.kind,
              name: c.name.trim(),
              parentProductionId: c.parentProductionId,
              fps: s.project.fps,
            },
          },
        },
        inverse: { type: "UndoCreateProduction", productionId: c.productionId },
        affected: [c.productionId],
      };
    }

    case "UndoCreateProduction": {
      need(s.productions[c.productionId], "Produksjonen");
      if (Object.values(s.occurrences).some((o) => o.productionId === c.productionId)) {
        fail("referenced", "Produksjonen inneholder scener og kan ikke angres");
      }
      if (
        Object.values(s.continuityEvents).some(
          (e) => e.productionId === c.productionId || e.disabledIn?.includes(c.productionId),
        )
      )
        fail("referenced", "Produksjonen har egen kontinuitet og kan ikke angres");
      const { [c.productionId]: _removed, ...productions } = s.productions;
      return {
        state: { ...s, productions },
        inverse: {
          type: "CreateProduction",
          productionId: c.productionId,
          kind: _removed!.kind,
          name: _removed!.name,
          parentProductionId: _removed!.parentProductionId,
        },
        affected: [c.productionId],
      };
    }

    case "CreateScene": {
      const production = need(s.productions[c.productionId], "Produksjonen");
      for (const id of [c.sceneId, c.variantId, c.occurrenceId, ...c.blocks.map((b) => b.blockId)])
        assertNewId(s, id);
      if (new Set(c.blocks.map((b) => b.blockId)).size !== c.blocks.length)
        fail("duplicate_id", "Blokk-ID-er gjentas");
      assertKey(c.orderKey);
      c.blocks.forEach((b) => assertKey(b.orderKey));
      const owner = production.kind === "main" ? null : production.id;
      const blocks: Record<string, ScriptBlock> = { ...s.blocks };
      const revisions: BlockRevision[] = [...s.blockRevisions];
      for (const b of c.blocks) {
        blocks[b.blockId] = {
          id: b.blockId,
          revision: 1,
          variantId: c.variantId,
          kind: b.kind,
          orderKey: b.orderKey,
          currentRev: 1,
          text: b.text,
          language: PRIMARY_LANGUAGE,
          sourceRef: b.sourceRef ?? null,
          uncertainty: b.uncertainty ?? null,
          removed: b.removed ?? false,
        };
        revisions.push(newRevision(b.blockId, 1, b.text));
      }
      return {
        state: {
          ...s,
          scenes: {
            ...s.scenes,
            [c.sceneId]: {
              id: c.sceneId,
              revision: 1,
              originProductionId: production.id,
              storyTime: c.storyTime ?? { kind: "linear", anchorSceneId: null, offset: 0 },
              derivedFromSceneId: null,
              mergedIntoSceneId: null,
            },
          },
          variants: {
            ...s.variants,
            [c.variantId]: {
              id: c.variantId,
              revision: 1,
              sceneId: c.sceneId,
              ownerProductionId: owner,
              basedOnVariantId: null,
              heading: c.heading,
              uncertainty: c.headingUncertainty ?? null,
            },
          },
          blocks,
          blockRevisions: revisions,
          occurrences: {
            ...s.occurrences,
            [c.occurrenceId]: {
              id: c.occurrenceId,
              revision: 1,
              productionId: production.id,
              sceneId: c.sceneId,
              variantId: c.variantId,
              orderKey: c.orderKey,
              active: true,
              excerpt: null,
              activeTakeId: null,
              productionNumber: c.productionNumber ?? null,
            },
          },
        },
        inverse: {
          type: "UndoCreateScene",
          sceneId: c.sceneId,
          variantId: c.variantId,
          occurrenceId: c.occurrenceId,
          blockIds: c.blocks.map((b) => b.blockId),
        },
        affected: [c.sceneId, c.variantId, c.occurrenceId, ...c.blocks.map((b) => b.blockId)],
      };
    }

    case "UndoCreateScene": {
      need(s.scenes[c.sceneId], "Scenen");
      const otherUse = Object.values(s.occurrences).some(
        (o) => o.sceneId === c.sceneId && o.id !== c.occurrenceId,
      );
      const otherVariants = Object.values(s.variants).some(
        (v) => v.sceneId === c.sceneId && v.id !== c.variantId,
      );
      const hasTakes = Object.values(s.takes).some((t) => t.occurrenceId === c.occurrenceId);
      const hasSegments = Object.values(s.segments).some((g) => g.occurrenceId === c.occurrenceId);
      const referencedByScenes = Object.values(s.scenes).some(
        (x) =>
          x.id !== c.sceneId &&
          (x.mergedIntoSceneId === c.sceneId || x.derivedFromSceneId === c.sceneId),
      );
      if (otherUse || otherVariants || hasTakes || hasSegments || referencedByScenes) {
        fail("referenced", "Scenen er tatt i bruk og kan ikke angres. Deaktiver den i stedet.");
      }
      const occ = need(s.occurrences[c.occurrenceId], "Forekomsten");
      const variant = need(s.variants[c.variantId], "Varianten");
      if (
        occ.sceneId !== c.sceneId ||
        variant.sceneId !== c.sceneId ||
        occ.variantId !== c.variantId
      ) {
        fail("invalid", "Scene, variant og forekomst hører ikke sammen");
      }
      {
        const now = Object.values(s.blocks)
          .filter((b) => b.variantId === c.variantId)
          .map((b) => b.id as string);
        const created = new Set(c.blockIds as readonly string[]);
        if (now.length !== created.size || now.some((id) => !created.has(id))) {
          fail(
            "referenced",
            "Scenen har fått eller mistet tekst etter at den ble laget, og kan ikke angres. Deaktiver den i stedet.",
          );
        }
      }
      const blockList = Object.values(s.blocks).filter((b) => b.variantId === c.variantId);
      const blocks = { ...s.blocks };
      for (const b of blockList) delete blocks[b.id];
      const { [c.sceneId]: scene, ...scenes } = s.scenes;
      const { [c.variantId]: _v, ...variants } = s.variants;
      const { [c.occurrenceId]: _o, ...occurrences } = s.occurrences;
      const ids = new Set(blockList.map((b) => b.id as string));
      return {
        state: {
          ...s,
          scenes,
          variants,
          occurrences,
          blocks,
          blockRevisions: s.blockRevisions.filter((r) => !ids.has(r.blockId)),
        },
        inverse: {
          type: "CreateScene",
          productionId: occ.productionId,
          sceneId: c.sceneId,
          variantId: c.variantId,
          occurrenceId: c.occurrenceId,
          orderKey: occ.orderKey,
          heading: variant.heading,
          blocks: blockList.map((b) => ({
            blockId: b.id,
            kind: b.kind,
            text: b.text,
            orderKey: b.orderKey,
            sourceRef: b.sourceRef,
            uncertainty: b.uncertainty,
            removed: b.removed,
          })),
          storyTime: scene!.storyTime,
          productionNumber: occ.productionNumber,
          headingUncertainty: variant.uncertainty,
        },
        affected: [c.sceneId, c.variantId, c.occurrenceId, ...ids],
      };
    }

    case "MoveOccurrence": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      assertKey(c.orderKey);
      return {
        state: {
          ...s,
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, orderKey: c.orderKey, revision: rev(o) },
          },
        },
        inverse: { type: "MoveOccurrence", occurrenceId: o.id, orderKey: o.orderKey },
        affected: [o.id],
      };
    }

    case "SetOccurrenceActive": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      return {
        state: {
          ...s,
          occurrences: { ...s.occurrences, [o.id]: { ...o, active: c.active, revision: rev(o) } },
        },
        inverse: { type: "SetOccurrenceActive", occurrenceId: o.id, active: o.active },
        affected: [o.id],
      };
    }

    case "EditBlockText": {
      const b = need(s.blocks[c.blockId], "Manusblokken");
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.text === c.text) fail("invalid", "Teksten er uendret");
      const next = b.currentRev + 1;
      return {
        state: {
          ...s,
          blocks: {
            ...s.blocks,
            [b.id]: { ...b, text: c.text, currentRev: next, revision: rev(b) },
          },
          blockRevisions: [...s.blockRevisions, newRevision(b.id, next, c.text)],
        },
        inverse: {
          type: "EditBlockText",
          productionId: c.productionId,
          blockId: b.id,
          text: b.text,
        },
        affected: [b.id],
      };
    }

    case "InsertBlock": {
      assertCanEditVariant(s, c.productionId, c.variantId);
      assertNewId(s, c.block.blockId);
      assertKey(c.block.orderKey);
      if (
        Object.values(s.blocks).some(
          (b) => b.variantId === c.variantId && b.orderKey === c.block.orderKey,
        )
      ) {
        fail("invalid", "To blokker kan ikke ha samme plass");
      }
      return {
        state: {
          ...s,
          blocks: {
            ...s.blocks,
            [c.block.blockId]: {
              id: c.block.blockId,
              revision: 1,
              variantId: c.variantId,
              kind: c.block.kind,
              orderKey: c.block.orderKey,
              currentRev: 1,
              text: c.block.text,
              language: PRIMARY_LANGUAGE,
              sourceRef: c.block.sourceRef ?? null,
              uncertainty: c.block.uncertainty ?? null,
              removed: c.block.removed ?? false,
            },
          },
          blockRevisions: [...s.blockRevisions, newRevision(c.block.blockId, 1, c.block.text)],
        },
        inverse: { type: "UndoInsertBlock", blockId: c.block.blockId },
        affected: [c.block.blockId],
      };
    }

    case "UndoInsertBlock": {
      const b = need(s.blocks[c.blockId], "Manusblokken");
      if (Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)) {
        fail("referenced", "Blokken brukes av et produksjonssegment");
      }
      const { [b.id]: _b, ...blocks } = s.blocks;
      const owner = s.variants[b.variantId]?.ownerProductionId;
      const ctx = owner ?? Object.values(s.productions).find((p) => p.kind === "main")?.id;
      return {
        state: { ...s, blocks, blockRevisions: s.blockRevisions.filter((r) => r.blockId !== b.id) },
        inverse: {
          type: "InsertBlock",
          productionId: need(ctx, "Produksjon for blokken"),
          variantId: b.variantId,
          block: {
            blockId: b.id,
            kind: b.kind,
            text: b.text,
            orderKey: b.orderKey,
            sourceRef: b.sourceRef,
            uncertainty: b.uncertainty,
            removed: b.removed,
          },
        },
        affected: [b.id],
      };
    }

    case "ForkVariant": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      // Tilbakeføring (DEC-0060): innholdet kopieres fra en annen variant av scenen (spinoffens versjon)
      const source = need(s.variants[c.sourceVariantId ?? o.variantId], "Varianten");
      if (source.sceneId !== o.sceneId) fail("invalid", "Varianten tilhører en annen scene");
      if (source.ownerProductionId === o.productionId)
        fail("invalid", "Varianten eies allerede av produksjonen");
      if (c.sourceVariantId && c.sourceVariantId === o.variantId)
        fail("invalid", "Forekomsten bruker allerede denne varianten");
      assertNewId(s, c.newVariantId);
      const sourceBlocks = Object.values(s.blocks).filter((b) => b.variantId === source.id);
      const blocks = { ...s.blocks };
      const revisions = [...s.blockRevisions];
      // Teksthistorikken følger med (samme revisjonsnumre), så avvikskontroll og «gammel tekst» virker
      // også i den nye versjonen (DEC-0057)
      const history = new Map<string, BlockRevision[]>();
      for (const r of s.blockRevisions) {
        const list = history.get(r.blockId);
        if (list) list.push(r);
        else history.set(r.blockId, [r]);
      }
      for (const b of sourceBlocks) {
        const nid = c.blockIdMap[b.id];
        if (!nid)
          fail(
            "invalid",
            "Scenen er endret i den andre produksjonen i mellomtiden. Lag egen versjon på nytt.",
          );
        assertNewId(s, nid);
        blocks[nid] = { ...b, id: nid, revision: 1, variantId: c.newVariantId };
        const old = history.get(b.id) ?? [];
        // Historikken kopieres som nye rader skrevet av den som lager versjonen (teksten er den samme)
        if (old.length) for (const r of old) revisions.push(newRevision(nid, r.rev, r.text));
        else revisions.push(newRevision(nid, b.currentRev, b.text));
      }
      if (new Set(Object.values(c.blockIdMap)).size !== sourceBlocks.length)
        fail("invalid", "Blokk-ID-kartet er ufullstendig");
      // Forekomstens koblinger (lyd, tid, segmenter, godkjent grunnlag) følger blokkene. Kommer innholdet fra
      // en annen variant, finnes de tilsvarende blokkene via rekkefølgenøkkelen (samme opphav)
      let occMap: Record<string, BlockId> = { ...c.blockIdMap };
      if (c.sourceVariantId) {
        const byKey = new Map(sourceBlocks.map((b) => [b.orderKey, b]));
        occMap = {};
        for (const b of Object.values(s.blocks)) {
          if (b.variantId !== o.variantId) continue;
          const src = byKey.get(b.orderKey);
          if (src && src.kind === b.kind) occMap[b.id] = c.blockIdMap[src.id]!;
        }
        const own = new Set(
          Object.values(s.blocks)
            .filter((b) => b.variantId === o.variantId)
            .map((b) => b.id as string),
        );
        const lost = (id: string | null) => id !== null && own.has(id) && !occMap[id];
        if (
          Object.values(s.audioClips).some((a) => a.occurrenceId === o.id && lost(a.blockId)) ||
          Object.values(s.timeLinks).some(
            (l) => l.occurrenceId === o.id && !l.removed && lost(l.blockId),
          ) ||
          Object.values(s.segments).some(
            (g) => g.occurrenceId === o.id && (lost(g.startBlockId) || lost(g.endBlockId)),
          )
        )
          fail(
            "referenced",
            "Lyd, tidskoblinger eller segmenter er koblet til linjer som ikke finnes i den nye versjonen. Fjern koblingene først.",
          );
      }
      const remapped = remapOccurrenceBlocks(s, o.id, occMap);
      // Oversettelsene følger med til den nye versjonen (DEC-0058)
      const translations = { ...s.translations };
      const copied: string[] = [];
      for (const t of Object.values(s.translations)) {
        if (t.removed) continue;
        const onBlock = t.blockId && c.blockIdMap[t.blockId];
        const onHeading = t.variantId === source.id;
        if (!onBlock && !onHeading) continue;
        const nid = c.translationIdMap?.[t.id];
        if (!nid) continue;
        assertNewId(s, nid);
        translations[nid] = {
          ...t,
          id: nid,
          revision: 1,
          blockId: onBlock ? c.blockIdMap[t.blockId!]! : null,
          variantId: onHeading ? c.newVariantId : null,
          // Scenehodet i den nye versjonen har revisjon 1; må det gjennomgås, må det fortsatt det
          basedOnRev: onHeading ? (source.revision > t.basedOnRev ? 0 : 1) : t.basedOnRev,
        };
        copied.push(nid);
      }
      return {
        state: {
          ...s,
          ...remapped.state,
          translations,
          variants: {
            ...s.variants,
            [c.newVariantId]: {
              id: c.newVariantId,
              revision: 1,
              sceneId: source.sceneId,
              // Hovedfilmens versjoner deles (null), så spinoffer kan gjenbruke dem (DEC-0060)
              ownerProductionId:
                s.productions[o.productionId]?.kind === "main" ? null : o.productionId,
              basedOnVariantId: source.id,
              heading: source.heading,
              uncertainty: source.uncertainty,
            },
          },
          blocks,
          blockRevisions: revisions,
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, variantId: c.newVariantId, revision: rev(o) },
          },
        },
        inverse: {
          type: "UndoForkVariant",
          occurrenceId: o.id,
          previousVariantId: o.variantId,
          newVariantId: c.newVariantId,
          ...(c.sourceVariantId ? { sourceVariantId: c.sourceVariantId } : {}),
        },
        affected: [
          c.newVariantId,
          o.id,
          ...Object.values(c.blockIdMap),
          ...remapped.affected,
          ...copied,
        ],
      };
    }

    case "UndoForkVariant": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      const nv = need(s.variants[c.newVariantId], "Varianten");
      need(s.variants[c.previousVariantId], "Opprinnelig variant");
      if (o.variantId !== nv.id) fail("invalid", "Forekomsten bruker ikke denne varianten");
      if (Object.values(s.occurrences).some((x) => x.variantId === nv.id && x.id !== o.id))
        fail("referenced", "Varianten brukes andre steder");
      const forked = Object.values(s.blocks).filter((b) => b.variantId === nv.id);
      // Innholdet kom fra kilden (ved tilbakeføring spinoffens versjon, ellers den forrige varianten)
      const contentId = c.sourceVariantId ?? c.previousVariantId;
      need(s.variants[contentId], "Kildevarianten");
      const original = Object.values(s.blocks).filter((b) => b.variantId === contentId);
      // Kan angres når innholdet er som i originalen (endringer som er angret, teller ikke)
      const byKey = new Map(original.map((b) => [b.orderKey, b]));
      // Ved tilbakeføring kan spinoffens versjon ha blitt endret etterpå: da avgjør revisjonen at kopien
      // ikke er endret siden (alle endringer øker revisjonen), ikke likhet med kilden (DEC-0060)
      const same = c.sourceVariantId
        ? nv.revision === 1 && forked.every((b) => b.revision === 1 && byKey.has(b.orderKey))
        : forked.length === original.length &&
          forked.every((b) => {
            const src = byKey.get(b.orderKey);
            return !!src && src.text === b.text && src.kind === b.kind && src.removed === b.removed;
          });
      if (!same) fail("referenced", "Den egne versjonen er endret; angre endringene i den først");
      if (Object.values(s.compositions).some((x) => x.variantId === nv.id))
        fail("referenced", "Den egne versjonen har en 2D-scene; angre den først");
      // Oversettelser i den egne versjonen: kan angres når de er kopier av originalens
      const toSource = new Map<string, string>();
      for (const b of forked) {
        const src = byKey.get(b.orderKey);
        if (src) toSource.set(b.id, src.id);
      }
      toSource.set(nv.id, contentId);
      const translationIdMap: Record<string, TranslationId> = {};
      const dropTranslations: string[] = [];
      for (const t of Object.values(s.translations)) {
        const target = t.blockId ?? t.variantId;
        if (!target || !toSource.has(target)) continue;
        dropTranslations.push(t.id);
        if (t.removed) continue;
        const srcTarget = toSource.get(target)!;
        if (c.sourceVariantId) {
          // Kopi som ikke er endret siden (revisjon 1); kilden kan være endret etterpå
          if (t.revision !== 1)
            fail("referenced", "Den egne versjonen har egne oversettelser; angre dem først");
          const orig = Object.values(s.translations).find(
            (x) =>
              !x.removed && (x.blockId ?? x.variantId) === srcTarget && x.language === t.language,
          );
          if (orig) translationIdMap[orig.id] = t.id;
          continue;
        }
        const orig = Object.values(s.translations).find(
          (x) =>
            !x.removed &&
            (x.blockId ?? x.variantId) === srcTarget &&
            x.language === t.language &&
            x.text === t.text,
        );
        if (!orig) fail("referenced", "Den egne versjonen har egne oversettelser; angre dem først");
        translationIdMap[orig.id] = t.id;
      }
      const ids = new Set(forked.map((b) => b.id as string));
      const blocks = { ...s.blocks };
      for (const id of ids) delete blocks[id];
      const { [nv.id]: _nv, ...variants } = s.variants;
      // Gjenskap blokk-kartet for inversen (kilde → ny) og koblingene tilbake (ny → forrige variant)
      const map: Record<string, BlockId> = {};
      for (const b of forked) {
        const src = byKey.get(b.orderKey);
        if (src) map[src.id] = b.id;
      }
      const prevByKey = new Map(
        Object.values(s.blocks)
          .filter((b) => b.variantId === c.previousVariantId)
          .map((b) => [b.orderKey, b]),
      );
      const back: Record<string, BlockId> = {};
      for (const b of forked) {
        const p = prevByKey.get(b.orderKey);
        if (p && p.kind === b.kind) back[b.id] = p.id;
      }
      const stranded = (id: string | null) => id !== null && ids.has(id) && !back[id];
      if (
        Object.values(s.audioClips).some((a) => a.occurrenceId === o.id && stranded(a.blockId)) ||
        Object.values(s.timeLinks).some((l) => l.occurrenceId === o.id && stranded(l.blockId)) ||
        Object.values(s.segments).some(
          (g) => g.occurrenceId === o.id && (stranded(g.startBlockId) || stranded(g.endBlockId)),
        )
      )
        fail(
          "referenced",
          "Lyd eller tidskoblinger er koblet til linjer bare den nye versjonen har",
        );
      const remapped = remapOccurrenceBlocks(s, o.id, back);
      const translations = { ...s.translations };
      for (const id of dropTranslations) delete translations[id];
      return {
        state: {
          ...s,
          ...remapped.state,
          translations,
          variants,
          blocks,
          blockRevisions: s.blockRevisions.filter((r) => !ids.has(r.blockId)),
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, variantId: c.previousVariantId, revision: rev(o) },
          },
        },
        inverse: {
          type: "ForkVariant",
          occurrenceId: o.id,
          newVariantId: nv.id,
          blockIdMap: map,
          ...(Object.keys(translationIdMap).length ? { translationIdMap } : {}),
          ...(c.sourceVariantId ? { sourceVariantId: c.sourceVariantId } : {}),
        },
        affected: [nv.id, o.id, ...ids, ...remapped.affected, ...dropTranslations],
      };
    }

    case "TransferScene": {
      const production = need(s.productions[c.productionId], "Produksjonen");
      const source = need(s.variants[c.sourceVariantId], "Varianten");
      if (source.ownerProductionId === null || source.ownerProductionId === c.productionId)
        fail("invalid", "Bare en scene som tilhører en annen produksjon kan overføres");
      if (
        Object.values(s.occurrences).some(
          (o) => o.productionId === c.productionId && o.sceneId === source.sceneId,
        )
      )
        fail("invalid", `Scenen er allerede med i ${production.name}`);
      assertNewId(s, c.occurrenceId);
      assertKey(c.orderKey);
      // Forekomsten peker først på spinoffens versjon; ForkVariant gir den en egen kopi med en gang
      const staged: ProjectState = {
        ...s,
        occurrences: {
          ...s.occurrences,
          [c.occurrenceId]: {
            id: c.occurrenceId,
            revision: 0,
            productionId: c.productionId,
            sceneId: source.sceneId,
            variantId: source.id,
            orderKey: c.orderKey,
            active: true,
            excerpt: null,
            activeTakeId: null,
            productionNumber: null,
          },
        },
      };
      const forked = run(staged, {
        ...env,
        command: {
          type: "ForkVariant",
          occurrenceId: c.occurrenceId,
          newVariantId: c.newVariantId,
          blockIdMap: c.blockIdMap,
          ...(c.translationIdMap ? { translationIdMap: c.translationIdMap } : {}),
        },
      });
      const occ = forked.state.occurrences[c.occurrenceId]!;
      return {
        state: {
          ...forked.state,
          occurrences: { ...forked.state.occurrences, [occ.id]: { ...occ, revision: 1 } },
        },
        inverse: {
          type: "UndoTransferScene",
          occurrenceId: c.occurrenceId,
          sourceVariantId: source.id,
          newVariantId: c.newVariantId,
        },
        affected: forked.affected,
      };
    }

    case "UndoTransferScene": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      // Tidskoblinger som er fjernet (angret i samme gruppe), slettes sammen med forekomsten
      const deadLinks = Object.values(s.timeLinks).filter(
        (l) => l.occurrenceId === o.id && l.removed,
      );
      if (
        Object.values(s.takes).some((t) => t.occurrenceId === o.id) ||
        Object.values(s.segments).some((g) => g.occurrenceId === o.id) ||
        Object.values(s.audioClips).some((a) => a.occurrenceId === o.id) ||
        Object.values(s.timeLinks).some((l) => l.occurrenceId === o.id && !l.removed) ||
        Object.values(s.clipParts).some((p) => p.occurrenceId === o.id) ||
        Object.values(s.generationPrompts).some((g) => g.occurrenceId === o.id)
      )
        fail("referenced", "Scenen har fått materiale i produksjonen. Deaktiver den i stedet.");
      const undone = run(s, {
        ...env,
        command: {
          type: "UndoForkVariant",
          occurrenceId: o.id,
          previousVariantId: c.sourceVariantId,
          newVariantId: c.newVariantId,
          // Spinoffens versjon kan være endret etter overføringen
          sourceVariantId: c.sourceVariantId,
        },
      });
      const inv = undone.inverse as Extract<Command, { type: "ForkVariant" }>;
      const { [o.id]: _o, ...occurrences } = undone.state.occurrences;
      const timeLinks = { ...undone.state.timeLinks };
      for (const l of deadLinks) delete timeLinks[l.id];
      return {
        state: { ...undone.state, occurrences, timeLinks },
        inverse: {
          type: "TransferScene",
          productionId: o.productionId,
          occurrenceId: o.id,
          orderKey: o.orderKey,
          sourceVariantId: c.sourceVariantId,
          newVariantId: c.newVariantId,
          blockIdMap: inv.blockIdMap,
          ...(inv.translationIdMap ? { translationIdMap: inv.translationIdMap } : {}),
        },
        affected: [...undone.affected, ...deadLinks.map((l) => l.id)],
      };
    }

    case "AddOccurrence": {
      need(s.productions[c.productionId], "Produksjonen");
      const scene = need(s.scenes[c.sceneId], "Scenen");
      const variant = need(s.variants[c.variantId], "Varianten");
      if (variant.sceneId !== scene.id) fail("invalid", "Varianten tilhører en annen scene");
      if (variant.ownerProductionId !== null && variant.ownerProductionId !== c.productionId) {
        fail("must_fork_variant", "Denne versjonen av scenen tilhører en annen produksjon");
      }
      assertNewId(s, c.occurrenceId);
      assertKey(c.orderKey);
      return {
        state: {
          ...s,
          occurrences: {
            ...s.occurrences,
            [c.occurrenceId]: {
              id: c.occurrenceId,
              revision: 1,
              productionId: c.productionId,
              sceneId: c.sceneId,
              variantId: c.variantId,
              orderKey: c.orderKey,
              active: true,
              excerpt: null,
              activeTakeId: null,
              productionNumber: null,
            },
          },
        },
        inverse: { type: "UndoAddOccurrence", occurrenceId: c.occurrenceId },
        affected: [c.occurrenceId],
      };
    }

    case "UndoAddOccurrence": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (
        Object.values(s.takes).some((t) => t.occurrenceId === o.id) ||
        Object.values(s.segments).some((g) => g.occurrenceId === o.id)
      ) {
        fail("referenced", "Forekomsten har produksjonsmateriale. Deaktiver den i stedet.");
      }
      if (Object.values(s.occurrences).filter((x) => x.sceneId === o.sceneId).length <= 1) {
        fail(
          "referenced",
          "Siste forekomst av scenen kan bare fjernes ved å angre opprettelsen av scenen",
        );
      }
      const { [o.id]: _o, ...occurrences } = s.occurrences;
      return {
        state: { ...s, occurrences },
        inverse: {
          type: "AddOccurrence",
          productionId: o.productionId,
          occurrenceId: o.id,
          sceneId: o.sceneId,
          variantId: o.variantId,
          orderKey: o.orderKey,
        },
        affected: [o.id],
      };
    }

    case "CreateSegments": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (c.segments.length === 0) fail("invalid", "Ingen segmenter oppgitt");
      const segments = { ...s.segments };
      for (const g of c.segments) {
        assertNewId(s, g.segmentId);
        assertKey(g.orderKey);
        for (const bid of [g.startBlockId, g.endBlockId]) {
          if (bid !== null) {
            const b = need(s.blocks[bid], "Blokken");
            if (b.variantId !== o.variantId)
              fail("invalid", "Segmentet viser til en blokk i en annen variant");
          }
        }
        segments[g.segmentId] = {
          id: g.segmentId,
          revision: 1,
          occurrenceId: o.id,
          reason: c.reason,
          orderKey: g.orderKey,
          startBlockId: g.startBlockId,
          endBlockId: g.endBlockId,
        };
      }
      return {
        state: { ...s, segments },
        inverse: { type: "UndoCreateSegments", segmentIds: c.segments.map((g) => g.segmentId) },
        affected: c.segments.map((g) => g.segmentId),
      };
    }

    case "UndoCreateSegments": {
      const list = c.segmentIds.map((id) => need(s.segments[id], "Segmentet"));
      const ids = new Set(c.segmentIds as readonly string[]);
      if (Object.values(s.takes).some((t) => t.segmentId !== null && ids.has(t.segmentId))) {
        fail("referenced", "Segmentet har produsert materiale og kan ikke fjernes");
      }
      if (Object.values(s.generationPrompts).some((p) => ids.has(p.segmentId) && !p.removed))
        fail("referenced", "Segmentet har en egen genereringsbeskrivelse");
      const segments = { ...s.segments };
      for (const id of ids) delete segments[id];
      // Tilbakestilte beskrivelser forsvinner med segmentet (DEC-0053)
      const generationPrompts = { ...s.generationPrompts };
      for (const p of Object.values(s.generationPrompts))
        if (ids.has(p.segmentId)) delete generationPrompts[p.id];
      const first = list[0]!;
      return {
        state: { ...s, segments, generationPrompts },
        inverse: {
          type: "CreateSegments",
          occurrenceId: first.occurrenceId,
          reason: first.reason,
          segments: list.map((g) => ({
            segmentId: g.id,
            orderKey: g.orderKey,
            startBlockId: g.startBlockId,
            endBlockId: g.endBlockId,
          })),
        },
        affected: [...ids],
      };
    }

    case "AddTake": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      assertNewId(s, c.takeId);
      if (c.segmentId !== null) {
        const g = need(s.segments[c.segmentId], "Segmentet");
        if (g.occurrenceId !== o.id) fail("invalid", "Segmentet tilhører en annen forekomst");
      }
      if (
        c.durationFrames !== null &&
        (!Number.isInteger(c.durationFrames) || c.durationFrames < 0)
      ) {
        fail("invalid", "Varighet må være et ikke-negativt heltall bilder");
      }
      // Filen må ligge i prosjektets egen mappe (ellers kunne sletting av prosjektet nå andres filer)
      if (
        c.mediaRef !== null &&
        (typeof c.mediaRef !== "string" ||
          c.mediaRef.length > 600 ||
          !c.mediaRef.startsWith(`${s.project.id}/`) ||
          c.mediaRef.includes(".."))
      )
        fail("invalid", "Ugyldig mediesti");
      if (c.media !== undefined && c.kind !== "imported_film")
        fail("invalid", "Filinformasjon gjelder bare importert film");
      const media = c.media === undefined ? undefined : takeMediaOf(c.media);
      const take: Take = {
        id: c.takeId,
        revision: 1,
        occurrenceId: o.id,
        segmentId: c.segmentId,
        kind: c.kind,
        status: c.status,
        durationFrames: c.durationFrames,
        producedFrom: { blockRevisions: currentBlockRevisions(s, o.variantId) },
        mediaRef: c.mediaRef,
        ...(media ? { media } : {}),
      };
      return {
        state: { ...s, takes: { ...s.takes, [take.id]: take } },
        // Produsert materiale kastes aldri (INV-07, 21.5). Angre av «legg til» betyr bare at den ikke er aktiv.
        inverse: { type: "SetActiveTake", occurrenceId: o.id, takeId: o.activeTakeId },
        affected: [take.id],
      };
    }

    case "SetTransition": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      const t = c.transition === null ? null : transitionOf(c.transition);
      const prev: Transition | null = o.transition ?? null;
      const { transition: _old, ...rest } = o;
      const next = t === null ? rest : { ...rest, transition: t };
      return {
        state: {
          ...s,
          occurrences: { ...s.occurrences, [o.id]: { ...next, revision: rev(o) } },
        },
        inverse: { type: "SetTransition", occurrenceId: o.id, transition: prev },
        affected: [o.id],
      };
    }

    case "SetDefaultTransition": {
      const t = c.transition === null ? null : transitionOf(c.transition);
      const prev: Transition | null = s.project.defaultTransition ?? null;
      const { defaultTransition: _old, ...rest } = s.project;
      const project = t === null || t.kind === "cut" ? rest : { ...rest, defaultTransition: t };
      return {
        state: { ...s, project: { ...project, revision: s.project.revision + 1 } },
        inverse: { type: "SetDefaultTransition", transition: prev },
        affected: [s.project.id],
      };
    }

    case "SetAiBudget": {
      const lim = c.monthLimit;
      const price = c.pricePerImage;
      if (lim !== null && (!Number.isInteger(lim) || lim < 0 || lim > 100000))
        fail("invalid", "Grensen må være et helt tall mellom 0 og 100 000");
      if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000))
        fail("invalid", "Prisen må være et tall mellom 0 og 100 000");
      const { aiMonthLimit: oldLim, aiPricePerImage: oldPrice, ...rest } = s.project;
      const project = {
        ...rest,
        ...(lim !== null ? { aiMonthLimit: lim } : {}),
        ...(price !== null ? { aiPricePerImage: Math.round(price * 100) / 100 } : {}),
        revision: s.project.revision + 1,
      };
      return {
        state: { ...s, project },
        inverse: {
          type: "SetAiBudget",
          monthLimit: oldLim ?? null,
          pricePerImage: oldPrice ?? null,
        },
        affected: [s.project.id],
      };
    }

    case "SetGenerationPrompt": {
      const o = need(s.occurrences[c.occurrenceId], "Scenen");
      const seg = need(s.segments[c.segmentId], "Segmentet");
      if (seg.occurrenceId !== o.id) fail("invalid", "Segmentet hører til en annen scene");
      if (typeof c.basedOn !== "string" || c.basedOn.length > MAX_PROMPT_CHARS)
        fail("invalid", "Ugyldig grunnlag");
      const text = c.text === null ? null : c.text.trim();
      if (text !== null && (text.length === 0 || text.length > MAX_PROMPT_CHARS))
        fail("invalid", `Beskrivelsen må ha mellom 1 og ${MAX_PROMPT_CHARS} tegn`);
      const old = s.generationPrompts[c.promptId];
      const prompts = { ...s.generationPrompts };
      if (old) {
        if (old.occurrenceId !== o.id || old.segmentId !== seg.id)
          fail("invalid", "Beskrivelsen hører til et annet segment");
        if (
          text !== null &&
          old.removed &&
          Object.values(s.generationPrompts).some(
            (p) => p.segmentId === seg.id && !p.removed && p.id !== old.id,
          )
        )
          fail("referenced", "Segmentet har fått en annen egen beskrivelse i mellomtiden");
        prompts[old.id] =
          text === null
            ? { ...old, basedOn: c.basedOn, removed: true, revision: rev(old) }
            : { ...old, text, basedOn: c.basedOn, removed: false, revision: rev(old) };
      } else {
        if (text === null) fail("invalid", "Ingen beskrivelse å fjerne");
        assertNewId(s, c.promptId);
        if (Object.values(s.generationPrompts).some((p) => p.segmentId === seg.id && !p.removed))
          fail("invalid", "Segmentet har allerede en egen beskrivelse");
        prompts[c.promptId] = {
          id: c.promptId,
          revision: 1,
          occurrenceId: o.id,
          segmentId: seg.id,
          text: text!,
          basedOn: c.basedOn,
          removed: false,
        };
      }
      return {
        state: { ...s, generationPrompts: prompts },
        inverse: {
          type: "SetGenerationPrompt",
          promptId: c.promptId,
          occurrenceId: o.id,
          segmentId: seg.id,
          text: old && !old.removed ? old.text : null,
          basedOn: old?.basedOn ?? "",
        },
        affected: [c.promptId],
      };
    }

    case "ReplaceSegments": {
      const o = need(s.occurrences[c.occurrenceId], "Scenen");
      if (c.removeSegmentIds.length === 0 && c.segments.length === 0)
        fail("invalid", "Ingen endring");
      if (c.segments.length > 200) fail("invalid", "For mange segmenter");
      // Samtidige endringer: det som fjernes, må være nøyaktig inndelingen som gjelder nå
      const current = Object.values(s.segments)
        .filter((g) => g.occurrenceId === o.id && g.reason === c.reason)
        .map((g) => g.id as string)
        .sort();
      const asked = [...new Set(c.removeSegmentIds as readonly string[])].sort();
      if (current.length !== asked.length || current.some((id, i) => id !== asked[i]))
        fail(
          "revision_conflict",
          "Inndelingen er endret i mellomtiden (av deg eller noen andre). Lukk og åpne vinduet igjen.",
        );
      const segments = { ...s.segments };
      const prompts = { ...s.generationPrompts };
      const removedOld: ProductionSegment[] = [];
      for (const id of c.removeSegmentIds) {
        const g = need(s.segments[id], "Segmentet");
        if (g.occurrenceId !== o.id) fail("invalid", "Segmentet hører til en annen scene");
        if (Object.values(s.takes).some((t) => t.segmentId === id))
          fail("referenced", "Segmentet har produsert materiale og kan ikke endres");
        if (Object.values(s.generationPrompts).some((p) => p.segmentId === id && !p.removed))
          fail("referenced", "Segmentet har en egen beskrivelse. Tilbakestill den først.");
        // Fjernede beskrivelser for segmentet forsvinner med det
        for (const p of Object.values(s.generationPrompts))
          if (p.segmentId === id) delete prompts[p.id];
        removedOld.push(g);
        delete segments[id];
      }
      const reasons: readonly SegmentReason[] = [
        "narrative_subsequence",
        "continuity_change",
        "model_limit",
        "manual",
      ];
      if (!reasons.includes(c.reason)) fail("invalid", "Ugyldig grunn");
      for (const g of c.segments) {
        // Et segment som fjernes, kan ikke legges til igjen i samme endring (lagres i én transaksjon)
        if (segments[g.segmentId] || removedOld.some((x) => x.id === g.segmentId))
          fail("duplicate_id", `ID ${g.segmentId} er allerede i bruk`);
        assertNewId({ ...s, segments, generationPrompts: prompts }, g.segmentId);
        assertKey(g.orderKey);
        for (const bid of [g.startBlockId, g.endBlockId]) {
          if (bid === null) continue;
          const b = need(s.blocks[bid], "Blokken");
          if (b.variantId !== o.variantId)
            fail("invalid", "Segmentet viser til en blokk i en annen variant");
        }
        const timed = g.startMs !== undefined || g.endMs !== undefined;
        if (c.reason === "model_limit" && !timed)
          fail("invalid", "Segmenter til generering må ha tid");
        if (
          timed &&
          (!Number.isInteger(g.startMs) ||
            !Number.isInteger(g.endMs) ||
            g.startMs! < 0 ||
            g.endMs! <= g.startMs! ||
            g.endMs! > 36_000_000)
        )
          fail("invalid", "Ugyldig tid for segmentet");
        segments[g.segmentId] = {
          id: g.segmentId,
          revision: 1,
          occurrenceId: o.id,
          reason: c.reason,
          orderKey: g.orderKey,
          startBlockId: g.startBlockId,
          endBlockId: g.endBlockId,
          ...(timed ? { startMs: g.startMs!, endMs: g.endMs! } : {}),
        };
      }
      return {
        state: { ...s, segments, generationPrompts: prompts },
        inverse: {
          type: "ReplaceSegments",
          occurrenceId: o.id,
          reason: removedOld[0]?.reason ?? c.reason,
          removeSegmentIds: c.segments.map((g) => g.segmentId),
          segments: removedOld.map((g) => ({
            segmentId: g.id,
            orderKey: g.orderKey,
            startBlockId: g.startBlockId,
            endBlockId: g.endBlockId,
            ...(g.startMs !== undefined
              ? { startMs: g.startMs, endMs: g.endMs ?? g.startMs + 1 }
              : {}),
          })),
        },
        affected: [...c.removeSegmentIds, ...c.segments.map((g) => g.segmentId)],
      };
    }

    case "AcceptScriptChanges": {
      const o = need(s.occurrences[c.occurrenceId], "Scenen");
      if (c.compositionIds.length === 0 && c.takeIds.length === 0)
        fail("invalid", "Ingenting å godkjenne");
      const now = currentBlockRevisions(s, o.variantId);
      const compositions = { ...s.compositions };
      const takes = { ...s.takes };
      const inverse: Extract<Command, { type: "SetProducedFrom" }> = {
        type: "SetProducedFrom",
        compositions: [],
        takes: [],
      };
      for (const id of c.compositionIds) {
        const comp = need(s.compositions[id], "2D-scenen");
        if (comp.variantId !== o.variantId) fail("invalid", "2D-scenen hører til en annen scene");
        (
          inverse.compositions as {
            compositionId: typeof id;
            blockRevisions: Record<string, number>;
          }[]
        ).push({
          compositionId: id,
          blockRevisions: comp.producedFrom?.blockRevisions ?? {},
        });
        compositions[id] = { ...comp, producedFrom: { blockRevisions: now }, revision: rev(comp) };
      }
      for (const id of c.takeIds) {
        const t = need(s.takes[id], "Versjonen");
        if (t.occurrenceId !== o.id) fail("invalid", "Versjonen hører til en annen scene");
        (inverse.takes as { takeId: typeof id; blockRevisions: Record<string, number> }[]).push({
          takeId: id,
          blockRevisions: t.acceptedFrom?.blockRevisions ?? {},
        });
        // producedFrom er uforanderlig (INV-07); godkjenningen lagres ved siden av
        takes[id] = { ...t, acceptedFrom: { blockRevisions: now }, revision: rev(t) };
      }
      return {
        state: { ...s, compositions, takes },
        inverse,
        affected: [...c.compositionIds, ...c.takeIds],
      };
    }

    case "SetProducedFrom": {
      const clean = (m: Readonly<Record<string, number>>) => {
        if (!m || typeof m !== "object") fail("invalid", "Ugyldig grunnlag");
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!isUuid(k) || !Number.isInteger(v) || v < 1) fail("invalid", "Ugyldig grunnlag");
          out[k] = v;
        }
        return out;
      };
      const compositions = { ...s.compositions };
      const takes = { ...s.takes };
      const inverse: Extract<Command, { type: "SetProducedFrom" }> = {
        type: "SetProducedFrom",
        compositions: c.compositions.map((x) => ({
          compositionId: x.compositionId,
          blockRevisions:
            need(s.compositions[x.compositionId], "2D-scenen").producedFrom?.blockRevisions ?? {},
        })),
        takes: c.takes.map((x) => ({
          takeId: x.takeId,
          blockRevisions: need(s.takes[x.takeId], "Versjonen").acceptedFrom?.blockRevisions ?? {},
        })),
      };
      for (const x of c.compositions) {
        const comp = s.compositions[x.compositionId]!;
        const revs = clean(x.blockRevisions);
        const { producedFrom: _old, ...rest } = comp;
        compositions[comp.id] = {
          ...rest,
          ...(Object.keys(revs).length ? { producedFrom: { blockRevisions: revs } } : {}),
          revision: rev(comp),
        };
      }
      for (const x of c.takes) {
        const t = s.takes[x.takeId]!;
        const revs = clean(x.blockRevisions);
        const { acceptedFrom: _old, ...restTake } = t;
        takes[t.id] = {
          ...restTake,
          ...(Object.keys(revs).length ? { acceptedFrom: { blockRevisions: revs } } : {}),
          revision: rev(t),
        };
      }
      return {
        state: { ...s, compositions, takes },
        inverse,
        affected: [...c.compositions.map((x) => x.compositionId), ...c.takes.map((x) => x.takeId)],
      };
    }

    case "SetOccurrenceMonochrome": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (typeof c.monochrome !== "boolean") fail("invalid", "Ugyldig valg");
      const { monochrome: _old, ...rest } = o;
      const next = c.monochrome ? { ...rest, monochrome: true } : rest;
      return {
        state: {
          ...s,
          occurrences: { ...s.occurrences, [o.id]: { ...next, revision: rev(o) } },
        },
        inverse: {
          type: "SetOccurrenceMonochrome",
          occurrenceId: o.id,
          monochrome: o.monochrome === true,
        },
        affected: [o.id],
      };
    }

    case "SetSceneEdit": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (c.activeTakeId !== null) {
        const t = need(s.takes[c.activeTakeId], "Versjonen");
        if (s.occurrences[t.occurrenceId]?.sceneId !== o.sceneId)
          fail("invalid", "Versjonen tilhører en annen scene");
      }
      if (!Array.isArray(c.parts) || c.parts.length > MAX_CLIP_PARTS)
        fail("invalid", `For mange deler (maks ${MAX_CLIP_PARTS})`);
      const comp = compositionOfVariant(s, o.variantId);
      const fps = s.project.fps.num / s.project.fps.den;
      const compMs =
        comp && comp.durationFrames > 0
          ? Math.round((comp.durationFrames / fps) * 1000)
          : AUDIO_MAX_MS;
      const seen = new Set<string>();
      const keys = keysEvenly(Math.max(1, c.parts.length));
      const next: Record<string, ClipPart> = { ...s.clipParts };
      const affected: string[] = [o.id];
      c.parts.forEach((p, i) => {
        const f = partFieldsOf(p);
        if (seen.has(f.partId)) fail("invalid", "Samme del to ganger");
        seen.add(f.partId);
        const prev = s.clipParts[f.partId];
        const unchanged =
          prev !== undefined &&
          prev.source === f.source &&
          prev.takeId === f.takeId &&
          prev.inMs === f.inMs &&
          prev.outMs === f.outMs;
        if (unchanged) {
          // Uendrede deler kontrolleres ikke mot kilden på nytt (2D-scenen kan ha blitt kortere)
        } else if (f.source === "take") {
          const t = need(s.takes[f.takeId!], "Versjonen");
          if (s.occurrences[t.occurrenceId]?.sceneId !== o.sceneId)
            fail("invalid", "Versjonen tilhører en annen scene");
          if (t.kind !== "imported_film" || !t.mediaRef)
            fail("invalid", "Bare importert film kan brukes som del");
          const max = t.media?.durationMs ?? AUDIO_MAX_MS;
          if (f.outMs > max) fail("invalid", "Utpunktet er etter slutten av filmen");
        } else {
          if (!comp) fail("invalid", "Scenen har ingen 2D-scene");
          if (f.outMs > compMs) fail("invalid", "Utpunktet er etter slutten av 2D-scenen");
        }
        const old = s.clipParts[f.partId];
        if (old && old.occurrenceId !== o.id) fail("invalid", "Delen tilhører en annen scene");
        if (!old) assertNewId(s, f.partId);
        const part: ClipPart = {
          id: f.partId as never,
          revision: old ? rev(old) : 1,
          occurrenceId: o.id,
          orderKey: keys[i]!,
          source: f.source,
          takeId: f.takeId as never,
          inMs: f.inMs,
          outMs: f.outMs,
          removed: false,
        };
        if (
          !old ||
          old.removed ||
          old.orderKey !== part.orderKey ||
          old.source !== part.source ||
          old.takeId !== part.takeId ||
          old.inMs !== part.inMs ||
          old.outMs !== part.outMs
        ) {
          next[part.id] = part;
          affected.push(part.id);
        }
      });
      const before = Object.values(s.clipParts)
        .filter((p) => p.occurrenceId === o.id && !p.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      for (const p of before)
        if (!seen.has(p.id)) {
          next[p.id] = { ...p, removed: true, revision: rev(p) };
          affected.push(p.id);
        }
      // Revisjonen økes alltid: to som klipper samme scene samtidig, får konflikt i stedet for at den
      // enes deler forsvinner (INV-C1)
      const occ = { ...o, activeTakeId: c.activeTakeId as TakeId | null, revision: rev(o) };
      return {
        state: { ...s, occurrences: { ...s.occurrences, [o.id]: occ }, clipParts: next },
        inverse: {
          type: "SetSceneEdit",
          occurrenceId: o.id,
          activeTakeId: o.activeTakeId,
          parts: before.map((p) => ({
            partId: p.id,
            source: p.source,
            takeId: p.takeId,
            inMs: p.inMs,
            outMs: p.outMs,
          })),
        },
        affected,
      };
    }

    case "SetTakeStatus": {
      const t = need(s.takes[c.takeId], "Versjonen");
      if (c.status !== "reference" && c.status !== "in_progress" && c.status !== "approved")
        fail("invalid", "Ugyldig status");
      return {
        state: {
          ...s,
          takes: { ...s.takes, [t.id]: { ...t, status: c.status, revision: rev(t) } },
        },
        inverse: { type: "SetTakeStatus", takeId: t.id, status: t.status },
        affected: [t.id],
      };
    }

    case "SetTakeAudioLanguage": {
      const t = need(s.takes[c.takeId], "Versjonen");
      const v = c.audioLanguage;
      if (v !== null && v !== "none" && (typeof v !== "string" || !LANGUAGE_CODE.test(v)))
        fail("invalid", "Ugyldig språk for filmlyden");
      if ((t.audioLanguage ?? null) === v) fail("invalid", "Ingen endring");
      const { audioLanguage: _old, ...rest } = t;
      return {
        state: {
          ...s,
          takes: {
            ...s.takes,
            [t.id]: { ...rest, ...(v !== null ? { audioLanguage: v } : {}), revision: rev(t) },
          },
        },
        inverse: {
          type: "SetTakeAudioLanguage",
          takeId: t.id,
          audioLanguage: t.audioLanguage ?? null,
        },
        affected: [t.id],
      };
    }

    case "AddTimeLinks": {
      if (!Array.isArray(c.links) || c.links.length === 0 || c.links.length > 500)
        fail("invalid", "Ugyldig antall tidskoblinger");
      const next = { ...s.timeLinks };
      for (const l of c.links) {
        assertNewId(s, l.linkId);
        if (next[l.linkId]) fail("invalid", "Samme tidskobling to ganger");
        const f = timeLinkFieldsOf(s, l.fields);
        next[l.linkId] = { id: l.linkId, revision: 1, ...f, removed: false };
      }
      const ids = c.links.map((l) => l.linkId);
      return {
        state: { ...s, timeLinks: next },
        inverse: { type: "SetTimeLinksRemoved", linkIds: ids, removed: true },
        affected: ids,
      };
    }

    case "UpdateTimeLinks": {
      const next = { ...s.timeLinks };
      const old: { linkId: TimeLink["id"]; fields: TimeLinkFields }[] = [];
      for (const l of c.links) {
        const t = need(s.timeLinks[l.linkId], "Tidskoblingen");
        // Uten layerId beholdes laget koblingen gjelder
        const f = timeLinkFieldsOf(
          s,
          l.fields && l.fields.layerId === undefined
            ? { ...l.fields, layerId: t.layerId }
            : l.fields,
        );
        old.push({
          linkId: t.id,
          fields: {
            occurrenceId: t.occurrenceId,
            blockId: t.blockId,
            startMs: t.startMs,
            endMs: t.endMs,
            layerId: t.layerId,
          },
        });
        next[t.id] = { ...t, ...f, revision: rev(t) };
      }
      return {
        state: { ...s, timeLinks: next },
        inverse: { type: "UpdateTimeLinks", links: old },
        affected: c.links.map((l) => l.linkId),
      };
    }

    case "SetTimeLinksRemoved": {
      const next = { ...s.timeLinks };
      for (const id of c.linkIds) {
        const t = need(s.timeLinks[id], "Tidskoblingen");
        next[id] = { ...t, removed: c.removed, revision: rev(t) };
      }
      return {
        state: { ...s, timeLinks: next },
        inverse: { type: "SetTimeLinksRemoved", linkIds: c.linkIds, removed: !c.removed },
        affected: [...c.linkIds],
      };
    }

    case "AddContinuityEvents": {
      if (!Array.isArray(c.events) || c.events.length === 0 || c.events.length > 500)
        fail("invalid", "Ugyldig antall kontinuitetshendelser");
      const next = { ...s.continuityEvents };
      for (const e of c.events) {
        assertNewId(s, e.eventId);
        if (next[e.eventId]) fail("invalid", "Samme hendelse to ganger");
        next[e.eventId] = {
          id: e.eventId,
          revision: 1,
          ...continuityFieldsOf(s, e.fields),
          removed: false,
        };
      }
      const ids = c.events.map((e) => e.eventId);
      return {
        state: { ...s, continuityEvents: next },
        inverse: { type: "SetContinuityEventsRemoved", eventIds: ids, removed: true },
        affected: ids,
      };
    }

    case "UpdateContinuityEvents": {
      if (!Array.isArray(c.events) || c.events.length === 0 || c.events.length > 500)
        fail("invalid", "Ugyldig antall kontinuitetshendelser");
      const next = { ...s.continuityEvents };
      const old: { eventId: ContinuityEventId; fields: ContinuityEventFields }[] = [];
      for (const e of c.events) {
        const ev = need(s.continuityEvents[e.eventId], "Kontinuitetshendelsen");
        old.push({ eventId: ev.id, fields: continuityFieldsFrom(ev) });
        const { productionId: _p, ...rest } = ev;
        next[ev.id] = { ...rest, ...continuityFieldsOf(s, e.fields, ev), revision: rev(ev) };
      }
      return {
        state: { ...s, continuityEvents: next },
        inverse: { type: "UpdateContinuityEvents", events: old },
        affected: c.events.map((e) => e.eventId),
      };
    }

    case "SetContinuityEventDisabled": {
      const ev = need(s.continuityEvents[c.eventId], "Kontinuitetshendelsen");
      const p = need(s.productions[c.productionId], "Produksjonen");
      if (p.kind === "main")
        fail("invalid", "Hovedfilmens hendelser fjernes i stedet for å slås av");
      if (ev.productionId) fail("invalid", "En lokal hendelse fjernes i stedet for å slås av");
      const list = ev.disabledIn ?? [];
      if (list.includes(p.id) === c.disabled) fail("invalid", "Ingen endring");
      const nextList = c.disabled ? [...list, p.id].sort() : list.filter((x) => x !== p.id);
      const { disabledIn: _d, ...rest } = ev;
      return {
        state: {
          ...s,
          continuityEvents: {
            ...s.continuityEvents,
            [ev.id]: {
              ...rest,
              ...(nextList.length ? { disabledIn: nextList } : {}),
              revision: rev(ev),
            },
          },
        },
        inverse: { ...c, disabled: !c.disabled },
        affected: [ev.id],
      };
    }

    case "SetContinuityEventsRemoved": {
      const next = { ...s.continuityEvents };
      for (const id of c.eventIds) {
        const ev = need(s.continuityEvents[id], "Kontinuitetshendelsen");
        next[id] = { ...ev, removed: c.removed, revision: rev(ev) };
      }
      return {
        state: { ...s, continuityEvents: next },
        inverse: { type: "SetContinuityEventsRemoved", eventIds: c.eventIds, removed: !c.removed },
        affected: [...c.eventIds],
      };
    }

    case "AddTranslations": {
      if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 2000)
        fail("invalid", "Ugyldig antall oversettelser");
      const next = { ...s.translations };
      const taken = new Set(
        Object.values(s.translations)
          .filter((t) => !t.removed)
          .map(translationKey),
      );
      for (const it of c.items) {
        assertNewId(s, it.translationId);
        if (next[it.translationId]) fail("invalid", "Samme oversettelse to ganger");
        const f = translationFieldsOf(s, it.fields);
        // Én gjeldende oversettelse per linje og språk
        if (taken.has(translationKey(f)))
          fail("invalid", "Linjen har allerede en oversettelse til dette språket");
        taken.add(translationKey(f));
        next[it.translationId] = { id: it.translationId, revision: 1, ...f, removed: false };
      }
      const ids = c.items.map((x) => x.translationId);
      return {
        state: { ...s, translations: next },
        inverse: { type: "SetTranslationsRemoved", translationIds: ids, removed: true },
        affected: ids,
      };
    }

    case "UpdateTranslations": {
      if (!Array.isArray(c.items) || c.items.length === 0 || c.items.length > 2000)
        fail("invalid", "Ugyldig antall oversettelser");
      const next = { ...s.translations };
      const old: { translationId: TranslationId; fields: TranslationFields }[] = [];
      for (const it of c.items) {
        const t = need(s.translations[it.translationId], "Oversettelsen");
        const f = translationFieldsOf(s, it.fields);
        if (translationKey(f) !== translationKey(t))
          fail(
            "invalid",
            "En oversettelse kan ikke flyttes til en annen linje eller et annet språk",
          );
        old.push({
          translationId: t.id,
          fields: {
            blockId: t.blockId,
            variantId: t.variantId,
            language: t.language,
            text: t.text,
            basedOnRev: t.basedOnRev,
            status: t.status,
          },
        });
        next[t.id] = { ...t, ...f, revision: rev(t) };
      }
      return {
        state: { ...s, translations: next },
        inverse: { type: "UpdateTranslations", items: old },
        affected: c.items.map((x) => x.translationId),
      };
    }

    case "SetTranslationsRemoved": {
      const next = { ...s.translations };
      const live = new Set(
        Object.values(s.translations)
          .filter((t) => !t.removed && !c.translationIds.includes(t.id))
          .map(translationKey),
      );
      for (const id of c.translationIds) {
        const t = need(s.translations[id], "Oversettelsen");
        if (!c.removed && live.has(translationKey(t)))
          fail("invalid", "Linjen har fått en annen oversettelse i mellomtiden");
        if (!c.removed) live.add(translationKey(t));
        next[id] = { ...t, removed: c.removed, revision: rev(t) };
      }
      return {
        state: { ...s, translations: next },
        inverse: {
          type: "SetTranslationsRemoved",
          translationIds: c.translationIds,
          removed: !c.removed,
        },
        affected: [...c.translationIds],
      };
    }

    case "SetActiveTake": {
      const o = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (c.takeId !== null) {
        const t = need(s.takes[c.takeId], "Versjonen");
        const tOcc = need(s.occurrences[t.occurrenceId], "Forekomsten til versjonen");
        if (tOcc.sceneId !== o.sceneId) fail("invalid", "Versjonen tilhører en annen scene");
      }
      return {
        state: {
          ...s,
          occurrences: {
            ...s.occurrences,
            [o.id]: { ...o, activeTakeId: c.takeId as TakeId | null, revision: rev(o) },
          },
        },
        inverse: { type: "SetActiveTake", occurrenceId: o.id, takeId: o.activeTakeId },
        affected: [o.id],
      };
    }

    case "ImportScreenplay": {
      need(s.productions[c.productionId], "Produksjonen");
      if (c.scenes.length === 0) fail("invalid", "Manuset inneholder ingen scener");
      let st = s;
      const affected: string[] = [];
      for (const sc of c.scenes) {
        const r = run(st, {
          ...env,
          command: {
            type: "CreateScene",
            productionId: c.productionId,
            sceneId: sc.sceneId,
            variantId: sc.variantId,
            occurrenceId: sc.occurrenceId,
            orderKey: sc.orderKey,
            heading: sc.heading,
            blocks: sc.blocks,
            productionNumber: sc.productionNumber,
            headingUncertainty: sc.headingUncertainty ?? null,
          },
        });
        st = r.state;
        affected.push(...r.affected);
      }
      return {
        state: st,
        inverse: { type: "UndoImportScreenplay", productionId: c.productionId, scenes: c.scenes },
        affected,
      };
    }

    case "UndoImportScreenplay": {
      let st = s;
      const affected: string[] = [];
      for (const sc of [...c.scenes].reverse()) {
        const r = run(st, {
          ...env,
          command: {
            type: "UndoCreateScene",
            sceneId: sc.sceneId,
            variantId: sc.variantId,
            occurrenceId: sc.occurrenceId,
            blockIds: sc.blocks.map((b) => b.blockId),
          },
        });
        st = r.state;
        affected.push(...r.affected);
      }
      return {
        state: st,
        inverse: { type: "ImportScreenplay", productionId: c.productionId, scenes: c.scenes },
        affected,
      };
    }

    case "RemoveBlock":
    case "RestoreBlock": {
      const b = need(s.blocks[c.blockId], "Manusblokken");
      assertCanEditVariant(s, c.productionId, b.variantId);
      const removed = c.type === "RemoveBlock";
      if (b.removed === removed)
        fail("invalid", removed ? "Blokken er allerede fjernet" : "Blokken er ikke fjernet");
      if (
        removed &&
        Object.values(s.segments).some((g) => g.startBlockId === b.id || g.endBlockId === b.id)
      ) {
        fail("referenced", "Blokken brukes som grense for et produksjonssegment");
      }
      return {
        state: { ...s, blocks: { ...s.blocks, [b.id]: { ...b, removed, revision: rev(b) } } },
        inverse: {
          type: removed ? "RestoreBlock" : "RemoveBlock",
          productionId: c.productionId,
          blockId: b.id,
        },
        affected: [b.id],
      };
    }

    case "SetBlockKind": {
      const b = need(s.blocks[c.blockId], "Manusblokken");
      assertCanEditVariant(s, c.productionId, b.variantId);
      if (b.kind === c.kind) fail("invalid", "Elementtypen er uendret");
      return {
        state: { ...s, blocks: { ...s.blocks, [b.id]: { ...b, kind: c.kind, revision: rev(b) } } },
        inverse: {
          type: "SetBlockKind",
          productionId: c.productionId,
          blockId: b.id,
          kind: b.kind,
        },
        affected: [b.id],
      };
    }

    case "EditSceneHeading": {
      const v = need(s.variants[c.variantId], "Varianten");
      assertCanEditVariant(s, c.productionId, v.id);
      return {
        state: {
          ...s,
          variants: { ...s.variants, [v.id]: { ...v, heading: c.heading, revision: rev(v) } },
        },
        inverse: {
          type: "EditSceneHeading",
          productionId: c.productionId,
          variantId: v.id,
          heading: v.heading,
        },
        affected: [v.id],
      };
    }

    case "SetUncertainty": {
      const b = s.blocks[c.targetId];
      if (b) {
        assertCanEditVariant(s, c.productionId, b.variantId);
        return {
          state: {
            ...s,
            blocks: { ...s.blocks, [b.id]: { ...b, uncertainty: c.uncertainty, revision: rev(b) } },
          },
          inverse: {
            type: "SetUncertainty",
            productionId: c.productionId,
            targetId: b.id,
            uncertainty: b.uncertainty,
          },
          affected: [b.id],
        };
      }
      const v = need(s.variants[c.targetId], "Blokken eller varianten");
      assertCanEditVariant(s, c.productionId, v.id);
      return {
        state: {
          ...s,
          variants: {
            ...s.variants,
            [v.id]: { ...v, uncertainty: c.uncertainty, revision: rev(v) },
          },
        },
        inverse: {
          type: "SetUncertainty",
          productionId: c.productionId,
          targetId: v.id,
          uncertainty: v.uncertainty,
        },
        affected: [v.id],
      };
    }

    case "SplitScene": {
      const occ = need(s.occurrences[c.occurrenceId], "Forekomsten");
      if (occ.productionId !== c.productionId)
        fail("invalid", "Forekomsten tilhører en annen produksjon");
      assertCanEditVariant(s, c.productionId, occ.variantId);
      const variant = need(s.variants[occ.variantId], "Varianten");
      const scene = need(s.scenes[occ.sceneId], "Scenen");
      const blocks = Object.values(s.blocks)
        .filter((b) => b.variantId === variant.id && !b.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const idx = blocks.findIndex((b) => b.id === c.atBlockId);
      if (idx < 0) fail("not_found", "Blokken finnes ikke i scenen");
      if (idx === 0) fail("invalid", "Kan ikke splitte ved første blokk");
      // Fjernede blokker etter delingspunktet følger med, så «Hent tilbake» legger dem i riktig scene
      const atKey = blocks[idx]!.orderKey;
      const moved = Object.values(s.blocks)
        .filter((b) => b.variantId === variant.id && compareKeys(b.orderKey, atKey) >= 0)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const movedIds = new Set(moved.map((b) => b.id as string));
      if (
        Object.values(s.segments).some(
          (g) =>
            (g.startBlockId && movedIds.has(g.startBlockId)) ||
            (g.endBlockId && movedIds.has(g.endBlockId)),
        )
      ) {
        fail("referenced", "Produksjonssegmenter viser til blokker som ville blitt flyttet");
      }
      assertNewId(s, c.newSceneId);
      assertNewId(s, c.newVariantId);
      const users = Object.values(s.occurrences).filter((o) => o.variantId === variant.id);
      // INV-04: splitting skal ikke legge til forekomster i andre produksjoner. Del varianten først (ForkVariant).
      if (users.some((u) => u.productionId !== c.productionId)) {
        fail(
          "must_fork_variant",
          "Scenen brukes også i en annen produksjon (for eksempel en spinoff) og kan ikke deles herfra. Gi den andre produksjonen egen versjon av scenen først.",
        );
      }
      for (const u of users) {
        const nid = c.newOccurrenceIds[u.id];
        if (!nid) fail("invalid", `Mangler ny forekomst for ${u.id}`);
        assertNewId(s, nid);
      }
      if (
        new Set(Object.values(c.newOccurrenceIds)).size !== users.length ||
        Object.keys(c.newOccurrenceIds).length !== users.length
      ) {
        fail("invalid", "Forekomstkartet stemmer ikke med bruken av scenen");
      }
      const blocksNext = { ...s.blocks };
      for (const b of moved)
        blocksNext[b.id] = { ...b, variantId: c.newVariantId, revision: rev(b) };
      const occNext = { ...s.occurrences };
      for (const u of users) {
        const after = Object.values(s.occurrences)
          .filter(
            (o) => o.productionId === u.productionId && compareKeys(o.orderKey, u.orderKey) > 0,
          )
          .sort((a, b) => compareKeys(a.orderKey, b.orderKey))[0];
        const nid = c.newOccurrenceIds[u.id]!;
        occNext[nid] = {
          id: nid,
          revision: 1,
          productionId: u.productionId,
          sceneId: c.newSceneId,
          variantId: c.newVariantId,
          orderKey: keyBetween(u.orderKey, after?.orderKey ?? null),
          active: u.active,
          excerpt: null,
          activeTakeId: null,
          productionNumber: null,
        };
      }
      return {
        state: {
          ...s,
          scenes: {
            ...s.scenes,
            [c.newSceneId]: {
              id: c.newSceneId,
              revision: 1,
              originProductionId: scene.originProductionId,
              storyTime: { kind: "linear", anchorSceneId: null, offset: 0 },
              derivedFromSceneId: scene.id,
              mergedIntoSceneId: null,
            },
          },
          variants: {
            ...s.variants,
            [c.newVariantId]: {
              id: c.newVariantId,
              revision: 1,
              sceneId: c.newSceneId,
              ownerProductionId: variant.ownerProductionId,
              basedOnVariantId: null,
              heading: c.heading,
              uncertainty: null,
            },
          },
          blocks: blocksNext,
          occurrences: occNext,
        },
        inverse: {
          type: "UndoSplitScene",
          split: {
            productionId: c.productionId,
            occurrenceId: c.occurrenceId,
            atBlockId: c.atBlockId,
            newSceneId: c.newSceneId,
            newVariantId: c.newVariantId,
            newOccurrenceIds: c.newOccurrenceIds,
            heading: c.heading,
          },
          originalVariantId: variant.id,
        },
        affected: [c.newSceneId, c.newVariantId, ...Object.values(c.newOccurrenceIds), ...movedIds],
      };
    }

    case "UndoSplitScene": {
      const sp = c.split;
      const newScene = need(s.scenes[sp.newSceneId], "Den nye scenen");
      const nv = need(s.variants[sp.newVariantId], "Den nye varianten");
      const ov = need(s.variants[c.originalVariantId], "Den opprinnelige varianten");
      // Bare en ekte deling kan slås tilbake (kan ikke brukes til å slette eller flytte vilkårlige scener)
      if (
        nv.sceneId !== newScene.id ||
        newScene.derivedFromSceneId === null ||
        ov.sceneId !== newScene.derivedFromSceneId ||
        nv.ownerProductionId !== ov.ownerProductionId
      ) {
        fail("invalid", "Dette er ikke en deling som kan slås tilbake");
      }
      assertCanEditVariant(s, sp.productionId, ov.id);
      for (const [oldId, newId] of Object.entries(sp.newOccurrenceIds)) {
        const o = s.occurrences[newId];
        const old = s.occurrences[oldId];
        if (
          !o ||
          o.sceneId !== newScene.id ||
          o.variantId !== nv.id ||
          !old ||
          old.variantId !== ov.id
        ) {
          fail("invalid", "Forekomstene stemmer ikke med delingen");
        }
      }
      if (
        Object.values(s.scenes).some(
          (x) => x.mergedIntoSceneId === newScene.id || x.derivedFromSceneId === newScene.id,
        )
      ) {
        fail("referenced", "Den nye scenen er brukt i en senere deling eller sammenslåing");
      }
      {
        const keys = new Set(
          Object.values(s.blocks)
            .filter((b) => b.variantId === ov.id)
            .map((b) => b.orderKey),
        );
        if (Object.values(s.blocks).some((b) => b.variantId === nv.id && keys.has(b.orderKey))) {
          fail("referenced", "Scenen er endret etter delingen og kan ikke slås tilbake automatisk");
        }
      }
      const newOccIds = new Set(Object.values(sp.newOccurrenceIds) as string[]);
      if (
        Object.values(s.occurrences).some(
          (o) => o.sceneId === sp.newSceneId && !newOccIds.has(o.id),
        )
      ) {
        fail("referenced", "Den nye scenen er tatt i bruk andre steder");
      }
      if (
        Object.values(s.takes).some((t) => newOccIds.has(t.occurrenceId)) ||
        Object.values(s.segments).some((g) => newOccIds.has(g.occurrenceId))
      ) {
        fail("referenced", "Den nye scenen har produksjonsmateriale og kan ikke slås tilbake");
      }
      const blocksNext = { ...s.blocks };
      for (const b of Object.values(s.blocks))
        if (b.variantId === nv.id)
          blocksNext[b.id] = { ...b, variantId: c.originalVariantId, revision: rev(b) };
      const occNext = { ...s.occurrences };
      for (const id of newOccIds) delete occNext[id];
      const { [sp.newSceneId]: _sc, ...scenes } = s.scenes;
      const { [sp.newVariantId]: _v, ...variants } = s.variants;
      return {
        state: { ...s, scenes, variants, blocks: blocksNext, occurrences: occNext },
        inverse: { type: "SplitScene", ...sp },
        affected: [
          sp.newSceneId,
          sp.newVariantId,
          ...newOccIds,
          ...Object.values(s.blocks)
            .filter((b) => b.variantId === nv.id)
            .map((b) => b.id),
        ],
      };
    }

    case "MergeScenes": {
      const target = need(s.occurrences[c.targetOccurrenceId], "Målscenen");
      const source = need(s.occurrences[c.sourceOccurrenceId], "Kildescenen");
      if (target.productionId !== c.productionId || source.productionId !== c.productionId)
        fail("invalid", "Begge scenene må være i samme produksjon");
      if (target.sceneId === source.sceneId)
        fail("invalid", "Kan ikke slå en scene sammen med seg selv");
      assertCanEditVariant(s, c.productionId, target.variantId);
      assertCanEditVariant(s, c.productionId, source.variantId);
      const sourceScene = need(s.scenes[source.sceneId], "Kildescenen");
      if (sourceScene.mergedIntoSceneId !== null)
        fail("invalid", "Kildescenen er allerede slått sammen med en annen scene");
      if (need(s.scenes[target.sceneId], "Målscenen").mergedIntoSceneId !== null)
        fail("invalid", "Målscenen er slått sammen med en annen scene");
      if (
        Object.values(s.occurrences).some((o) => o.sceneId === source.sceneId && o.id !== source.id)
      ) {
        fail(
          "referenced",
          "Kildescenen brukes også i andre produksjoner. Slå sammen der den bare finnes én gang.",
        );
      }
      if (Object.values(s.segments).some((g) => g.occurrenceId === source.id))
        fail("referenced", "Kildescenen har produksjonssegmenter");
      // INV-04: teksten i en scene som også brukes i andre produksjoner endres ikke herfra
      if (
        Object.values(s.occurrences).some(
          (o) => o.variantId === target.variantId && o.productionId !== c.productionId,
        )
      ) {
        fail(
          "must_fork_variant",
          "Målscenen brukes også i en annen produksjon (for eksempel en spinoff) og kan ikke slås sammen herfra. Gi den andre produksjonen egen versjon av scenen først.",
        );
      }
      const targetBlocks = Object.values(s.blocks)
        .filter((b) => b.variantId === target.variantId)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      const sourceBlocks = Object.values(s.blocks)
        .filter((b) => b.variantId === source.variantId)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      let lastKey = targetBlocks.length ? targetBlocks[targetBlocks.length - 1]!.orderKey : null;
      const blocksNext = { ...s.blocks };
      const placements = sourceBlocks.map((b) => ({
        blockId: b.id,
        variantId: b.variantId,
        orderKey: b.orderKey,
      }));
      for (const b of sourceBlocks) {
        lastKey = keyBetween(lastKey, null);
        blocksNext[b.id] = {
          ...b,
          variantId: target.variantId,
          orderKey: lastKey,
          revision: rev(b),
        };
      }
      return {
        state: {
          ...s,
          blocks: blocksNext,
          scenes: {
            ...s.scenes,
            [sourceScene.id]: {
              ...sourceScene,
              mergedIntoSceneId: target.sceneId,
              revision: rev(sourceScene),
            },
          },
          occurrences: {
            ...s.occurrences,
            [source.id]: { ...source, active: false, revision: rev(source) },
          },
        },
        inverse: {
          type: "UnmergeScenes",
          productionId: c.productionId,
          targetOccurrenceId: target.id,
          sourceOccurrenceId: source.id,
          placements,
          sourceWasActive: source.active,
        },
        affected: [sourceScene.id, source.id, ...placements.map((p) => p.blockId)],
      };
    }

    case "UnmergeScenes": {
      const source = need(s.occurrences[c.sourceOccurrenceId], "Kildescenen");
      const sourceScene = need(s.scenes[source.sceneId], "Kildescenen");
      if (sourceScene.mergedIntoSceneId === null) fail("invalid", "Scenen er ikke slått sammen");
      const target = need(s.occurrences[c.targetOccurrenceId], "Målscenen");
      if (
        sourceScene.mergedIntoSceneId !== target.sceneId ||
        source.productionId !== c.productionId
      ) {
        fail("invalid", "Sammenslåingen stemmer ikke");
      }
      assertCanEditVariant(s, c.productionId, source.variantId);
      if (new Set(c.placements.map((p) => p.blockId)).size !== c.placements.length) {
        fail("invalid", "Blokker gjentas");
      }
      {
        // Sammenslåingen la kildens blokker sist i målscenen, og kildescenen ble tom
        const inTarget = Object.values(s.blocks)
          .filter((b) => b.variantId === target.variantId)
          .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
        const tail = new Set(
          inTarget.slice(inTarget.length - c.placements.length).map((b) => b.id as string),
        );
        const sourceEmpty = !Object.values(s.blocks).some((b) => b.variantId === source.variantId);
        if (
          !sourceEmpty ||
          c.placements.length > inTarget.length ||
          c.placements.some((p) => !tail.has(p.blockId))
        ) {
          fail("invalid", "Blokkene stemmer ikke med sammenslåingen");
        }
      }
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], "Blokken");
        if (b.variantId !== target.variantId || p.variantId !== source.variantId) {
          fail("invalid", "Blokken var ikke en del av sammenslåingen");
        }
        assertKey(p.orderKey);
      }
      const blocksNext = { ...s.blocks };
      for (const p of c.placements) {
        const b = need(s.blocks[p.blockId], "Blokken");
        blocksNext[b.id] = { ...b, variantId: p.variantId, orderKey: p.orderKey, revision: rev(b) };
      }
      return {
        state: {
          ...s,
          blocks: blocksNext,
          scenes: {
            ...s.scenes,
            [sourceScene.id]: {
              ...sourceScene,
              mergedIntoSceneId: null,
              revision: rev(sourceScene),
            },
          },
          occurrences: {
            ...s.occurrences,
            [source.id]: { ...source, active: c.sourceWasActive, revision: rev(source) },
          },
        },
        inverse: {
          type: "MergeScenes",
          productionId: c.productionId,
          targetOccurrenceId: c.targetOccurrenceId,
          sourceOccurrenceId: c.sourceOccurrenceId,
        },
        affected: [sourceScene.id, source.id, ...c.placements.map((p) => p.blockId)],
      };
    }

    case "SetStoryTime": {
      const sc = need(s.scenes[c.sceneId], "Scenen");
      if (c.storyTime.kind === "linear" && c.storyTime.anchorSceneId !== null)
        fail("invalid", "Lineære scener har ikke anker");
      if (c.storyTime.anchorSceneId !== null) {
        need(s.scenes[c.storyTime.anchorSceneId], "Ankerscenen");
        if (c.storyTime.anchorSceneId === sc.id)
          fail("invalid", "En scene kan ikke ankres til seg selv");
        // Ingen sykliske ankre (fortellingstiden må kunne beregnes, INV-09)
        let cur: string | null = c.storyTime.anchorSceneId;
        const seen = new Set<string>();
        while (cur !== null && !seen.has(cur)) {
          if (cur === sc.id) fail("invalid", "Ankeret ville gitt en sirkel i fortellingstiden");
          seen.add(cur);
          const anc: typeof sc | undefined = s.scenes[cur];
          cur = anc && anc.storyTime.kind !== "linear" ? anc.storyTime.anchorSceneId : null;
        }
      }
      if (!Number.isFinite(c.storyTime.offset)) fail("invalid", "Ugyldig forskyvning");
      return {
        state: {
          ...s,
          scenes: { ...s.scenes, [sc.id]: { ...sc, storyTime: c.storyTime, revision: rev(sc) } },
        },
        inverse: { type: "SetStoryTime", sceneId: sc.id, storyTime: sc.storyTime },
        affected: [sc.id],
      };
    }

    // ---------- Ressursbiblioteket (M3 del 1) ----------
    case "CreateAssets": {
      if (c.assets.length === 0) fail("invalid", "Ingen ressurser å legge til");
      if (c.assets.length > 500) fail("invalid", "For mange ressurser i én endring");
      const seen = new Set<string>();
      const assets = { ...s.assets };
      for (const x of c.assets) {
        assertNewId(s, x.assetId);
        if (seen.has(x.assetId)) fail("duplicate_id", `ID ${x.assetId} er brukt to ganger`);
        seen.add(x.assetId);
        assets[x.assetId] = {
          id: x.assetId,
          revision: 1,
          ...normalizeAssetFields(x.fields),
          archived: x.archived === true,
        };
      }
      return {
        state: { ...s, assets },
        inverse: { type: "UndoCreateAssets", assetIds: c.assets.map((x) => x.assetId) },
        affected: [...seen],
      };
    }

    case "UndoCreateAssets": {
      const assets = { ...s.assets };
      for (const id of c.assetIds) {
        need(s.assets[id], "Ressursen");
        if (usedByLayer(s, "assetId", id))
          fail(
            "referenced",
            "Ressursen brukes i en 2D-scene og kan ikke fjernes. Arkiver den i stedet.",
          );
        if (Object.values(s.assetVariants).some((v) => v.assetId === id))
          fail(
            "referenced",
            "Ressursen har fått visuelle varianter og kan ikke fjernes. Arkiver den i stedet.",
          );
        delete assets[id];
      }
      return {
        state: { ...s, assets },
        inverse: {
          type: "CreateAssets",
          assets: c.assetIds.map((id) => {
            const a = s.assets[id]!;
            return {
              assetId: a.id,
              fields: {
                kind: a.kind,
                name: a.name,
                names: a.names,
                description: a.description,
                category: a.category,
                tags: a.tags,
              },
              ...(a.archived ? { archived: true } : {}),
            };
          }),
        },
        affected: [...c.assetIds],
      };
    }

    case "UpdateAsset": {
      const a = need(s.assets[c.assetId], "Ressursen");
      return {
        state: {
          ...s,
          assets: {
            ...s.assets,
            [a.id]: { ...a, ...normalizeAssetFields(c.fields), revision: rev(a) },
          },
        },
        inverse: {
          type: "UpdateAsset",
          assetId: a.id,
          fields: {
            kind: a.kind,
            name: a.name,
            names: a.names,
            description: a.description,
            category: a.category,
            tags: a.tags,
          },
        },
        affected: [a.id],
      };
    }

    case "SetAssetArchived": {
      const a = need(s.assets[c.assetId], "Ressursen");
      return {
        state: {
          ...s,
          assets: { ...s.assets, [a.id]: { ...a, archived: c.archived, revision: rev(a) } },
        },
        inverse: { type: "SetAssetArchived", assetId: a.id, archived: a.archived },
        affected: [a.id],
      };
    }

    case "CreateAssetVariant": {
      assertNewId(s, c.variantId);
      need(s.assets[c.assetId], "Ressursen");
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [c.variantId]: {
              id: c.variantId,
              revision: 1,
              assetId: c.assetId,
              ...normalizeVariantFields(c.fields),
              approvedVersionId: null,
              archived: c.archived === true,
            },
          },
        },
        inverse: { type: "UndoCreateAssetVariant", variantId: c.variantId },
        affected: [c.variantId],
      };
    }

    case "UndoCreateAssetVariant": {
      const va = need(s.assetVariants[c.variantId], "Varianten");
      if (Object.values(s.assetVersions).some((x) => x.variantId === va.id))
        fail("referenced", "Varianten har bilder og kan ikke fjernes. Arkiver den i stedet.");
      if (usedByLayer(s, "assetVariantId", va.id))
        fail("referenced", "Varianten brukes i en 2D-scene og kan ikke fjernes.");
      const assetVariants = { ...s.assetVariants };
      delete assetVariants[va.id];
      return {
        state: { ...s, assetVariants },
        inverse: {
          type: "CreateAssetVariant",
          variantId: va.id,
          assetId: va.assetId,
          fields: { name: va.name, style: va.style, appearance: va.appearance },
          ...(va.archived ? { archived: true } : {}),
        },
        affected: [va.id],
      };
    }

    case "UpdateAssetVariant": {
      const va = need(s.assetVariants[c.variantId], "Varianten");
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [va.id]: { ...va, ...normalizeVariantFields(c.fields), revision: rev(va) },
          },
        },
        inverse: {
          type: "UpdateAssetVariant",
          variantId: va.id,
          fields: { name: va.name, style: va.style, appearance: va.appearance },
        },
        affected: [va.id],
      };
    }

    case "SetAssetVariantArchived": {
      const va = need(s.assetVariants[c.variantId], "Varianten");
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [va.id]: { ...va, archived: c.archived, revision: rev(va) },
          },
        },
        inverse: { type: "SetAssetVariantArchived", variantId: va.id, archived: va.archived },
        affected: [va.id],
      };
    }

    case "AddAssetVersion": {
      assertNewId(s, c.versionId);
      const va = need(s.assetVariants[c.variantId], "Varianten");
      const m = c.media;
      if (
        !m ||
        typeof m.path !== "string" ||
        typeof m.mimeType !== "string" ||
        typeof m.sha256 !== "string" ||
        typeof c.note !== "string"
      )
        fail("invalid", "Ufullstendige bildedata");
      if (!m.path.startsWith(`${s.project.id}/`) || m.path.length > 600 || m.path.includes(".."))
        fail("invalid", "Ugyldig lagringssti for bildet");
      const sound = s.assets[va.assetId]?.kind === "sound";
      if (sound) {
        if (!AUDIO_MIME_TYPES.includes(m.mimeType))
          fail("invalid", "Lyden må være MP3, WAV, OGG, WebM, M4A/AAC eller FLAC");
        const d = m.durationMs ?? null;
        if (d !== null && (!Number.isInteger(d) || d <= 0 || d > AUDIO_MAX_MS))
          fail("invalid", "Ugyldig lengde på lydfilen");
      } else if (!ASSET_MIME_TYPES.includes(m.mimeType))
        fail("invalid", "Bildet må være PNG, JPEG, WebP eller GIF");
      if (!Number.isInteger(m.byteSize) || m.byteSize <= 0 || m.byteSize > ASSET_MAX_BYTES)
        fail("invalid", "Bildet er for stort (maks 2 GB)");
      if (!/^[0-9a-f]{64}$/.test(m.sha256)) fail("invalid", "Ugyldig kontrollsum");
      for (const d of [m.width, m.height])
        if (d !== null && (!Number.isInteger(d) || d <= 0 || d > 100_000))
          fail("invalid", "Ugyldige bildemål");
      if (c.note.length > 2000) fail("invalid", "Merknaden er for lang");
      const siblings = Object.values(s.assetVersions).filter((x) => x.variantId === va.id);
      // Gjør om etter angre: behold det opprinnelige nummeret hvis det er ledig
      const number =
        c.number !== undefined &&
        Number.isInteger(c.number) &&
        c.number >= 1 &&
        !siblings.some((x) => x.number === c.number)
          ? c.number
          : siblings.reduce((n, x) => Math.max(n, x.number), 0) + 1;
      return {
        state: {
          ...s,
          assetVersions: {
            ...s.assetVersions,
            [c.versionId]: {
              id: c.versionId,
              revision: 1,
              variantId: va.id,
              number,
              mediaPath: m.path,
              mimeType: m.mimeType,
              width: m.width,
              height: m.height,
              byteSize: m.byteSize,
              sha256: m.sha256,
              note: c.note.trim(),
              createdAt: env.at,
              createdBy: env.actor,
              durationMs: sound ? (m.durationMs ?? null) : null,
            },
          },
        },
        inverse: { type: "UndoAddAssetVersion", versionId: c.versionId },
        affected: [c.versionId],
      };
    }

    case "UndoAddAssetVersion": {
      const ver = need(s.assetVersions[c.versionId], "Versjonen");
      const va = s.assetVariants[ver.variantId];
      if (va?.approvedVersionId === ver.id)
        fail("referenced", "Versjonen er godkjent og kan ikke fjernes");
      if (usedByLayer(s, "versionId", ver.id))
        fail("referenced", "Bildet brukes i en 2D-scene og kan ikke fjernes.");
      // Bare det nyeste bildet kan angres bort (en versjon andre kan ha brukt, beholdes)
      if (
        Object.values(s.assetVersions).some(
          (x) => x.variantId === ver.variantId && x.number > ver.number,
        )
      )
        fail("referenced", "Det er lastet opp nyere bilder etter dette. Det kan ikke fjernes.");
      const assetVersions = { ...s.assetVersions };
      delete assetVersions[ver.id];
      return {
        state: { ...s, assetVersions },
        inverse: {
          type: "AddAssetVersion",
          versionId: ver.id,
          variantId: ver.variantId,
          media: {
            path: ver.mediaPath,
            mimeType: ver.mimeType,
            width: ver.width,
            height: ver.height,
            byteSize: ver.byteSize,
            sha256: ver.sha256,
          },
          note: ver.note,
          number: ver.number,
        },
        affected: [ver.id],
      };
    }

    // ---------- Notater i manus (DEC-0031) ----------
    case "AddAnnotations": {
      if (!Array.isArray(c.annotations) || c.annotations.length === 0)
        fail("invalid", "Ingen notater å legge til");
      if (c.annotations.length > 2000) fail("invalid", "For mange notater i én endring");
      const annotations = { ...s.annotations };
      const ids: string[] = [];
      for (const n of c.annotations) {
        if (!n || typeof n.text !== "string" || typeof n.authorName !== "string")
          fail("invalid", "Ufullstendige notatdata");
        assertNewId(s, n.annotationId);
        if (annotations[n.annotationId]) fail("duplicate_id", "Samme notat-ID to ganger");
        annotations[n.annotationId] = normalizeAnnotation(s, n, env.at);
        ids.push(n.annotationId);
      }
      return {
        state: { ...s, annotations },
        inverse: { type: "UndoAddAnnotations", annotationIds: ids as never },
        affected: ids,
      };
    }

    case "UndoAddAnnotations": {
      const annotations = { ...s.annotations };
      const back = [];
      for (const id of c.annotationIds) {
        const a = need(s.annotations[id], "Notatet");
        back.push({
          annotationId: a.id,
          blockId: a.blockId,
          variantId: a.variantId,
          start: a.start,
          end: a.end,
          quote: a.quote,
          text: a.text,
          authorName: a.authorName,
          stampAt: a.stampAt,
        });
        delete annotations[id];
      }
      return {
        state: { ...s, annotations },
        inverse: { type: "AddAnnotations", annotations: back },
        affected: [...c.annotationIds],
      };
    }

    case "EditAnnotation": {
      const a = need(s.annotations[c.annotationId], "Notatet");
      const text = typeof c.text === "string" ? c.text.trim() : "";
      if (!text || text.length > 10_000) fail("invalid", "Notatet må ha tekst (maks 10 000 tegn)");
      // «Endret av …» (DEC-0032): navn fra den som endrer, tid = nå (eller oppgitt ved angre)
      const editedByName =
        c.editedByName === undefined
          ? a.editedByName
          : c.editedByName === null
            ? null
            : String(c.editedByName).trim().slice(0, 100) || "Ukjent";
      const editedAt =
        c.editedAt !== undefined
          ? c.editedAt
          : c.editedByName === undefined || c.editedByName === null
            ? a.editedAt
            : env.at;
      if (editedAt !== null && Number.isNaN(Date.parse(editedAt)))
        fail("invalid", "Ugyldig tidspunkt for endringen");
      return {
        state: {
          ...s,
          annotations: {
            ...s.annotations,
            [a.id]: {
              ...a,
              text,
              editedByName,
              editedAt: editedAt === null ? null : new Date(editedAt).toISOString(),
              revision: rev(a),
            },
          },
        },
        inverse: {
          type: "EditAnnotation",
          annotationId: a.id,
          text: a.text,
          editedByName: a.editedByName,
          editedAt: a.editedAt,
        },
        affected: [a.id],
      };
    }

    case "SetAnnotationRemoved": {
      const a = need(s.annotations[c.annotationId], "Notatet");
      return {
        state: {
          ...s,
          annotations: {
            ...s.annotations,
            [a.id]: { ...a, removed: c.removed === true, revision: rev(a) },
          },
        },
        inverse: { type: "SetAnnotationRemoved", annotationId: a.id, removed: a.removed },
        affected: [a.id],
      };
    }

    case "ApproveAssetVersion": {
      const va = need(s.assetVariants[c.variantId], "Varianten");
      if (c.versionId !== null) {
        const ver = need(s.assetVersions[c.versionId], "Versjonen");
        if (ver.variantId !== va.id) fail("invalid", "Versjonen tilhører en annen variant");
      }
      return {
        state: {
          ...s,
          assetVariants: {
            ...s.assetVariants,
            [va.id]: { ...va, approvedVersionId: c.versionId, revision: rev(va) },
          },
        },
        inverse: {
          type: "ApproveAssetVersion",
          variantId: va.id,
          versionId: va.approvedVersionId,
        },
        affected: [va.id],
      };
    }

    // ---------- Prosjektets format (DEC-0039) ----------

    case "SetProjectFormat": {
      if (!Number.isInteger(c.width) || c.width < 16 || c.width > 16384)
        fail("invalid", "Bredden må være et helt tall mellom 16 og 16384");
      if (!Number.isInteger(c.height) || c.height < 16 || c.height > 16384)
        fail("invalid", "Høyden må være et helt tall mellom 16 og 16384");
      if (!isAllowedFps(c.fps)) fail("invalid", "Ukjent bildefrekvens");
      const p = s.project;
      const from = { width: p.frameWidth, height: p.frameHeight, fps: p.fps };
      const to = { width: c.width, height: c.height, fps: c.fps };
      if (
        from.width === to.width &&
        from.height === to.height &&
        sameFps(from.fps, to.fps) &&
        // Scener med eget format (laget før 0008) gjør at samme format likevel er en endring
        Object.values(s.compositions).every((x) => x.width === to.width && x.height === to.height)
      )
        fail("invalid", "Ingen endring");
      const m = formatMapping(from, to);
      const compositions = { ...s.compositions };
      const layers = { ...s.layers };
      const productions = { ...s.productions };
      const affected: string[] = [p.id];
      const oldComps = Object.values(s.compositions);
      const oldLayers = Object.values(s.layers);
      for (const comp of oldComps) {
        // Scener med eget format fra før (laget før 0008) regnes om fra sitt eget format
        const own = { width: comp.width, height: comp.height, fps: p.fps };
        const cm =
          own.width === from.width && own.height === from.height ? m : formatMapping(own, to);
        compositions[comp.id] = { ...rescaleComposition(comp, cm, to), revision: rev(comp) };
        affected.push(comp.id);
        for (const l of oldLayers)
          if (l.compositionId === comp.id) {
            layers[l.id] = { ...rescaleLayer(l, cm), revision: rev(l) };
            affected.push(l.id);
          }
      }
      const prodFps = Object.values(s.productions).map((x) => ({ productionId: x.id, fps: x.fps }));
      for (const x of Object.values(s.productions))
        if (!sameFps(x.fps, c.fps)) {
          productions[x.id] = { ...x, fps: c.fps, revision: rev(x) };
          affected.push(x.id);
        }
      return {
        state: {
          ...s,
          project: {
            ...p,
            frameWidth: c.width,
            frameHeight: c.height,
            fps: c.fps,
            revision: rev(p),
          },
          productions,
          compositions,
          layers,
        },
        inverse: {
          type: "UndoSetProjectFormat",
          project: from,
          productionFps: prodFps,
          compositions: oldComps,
          layers: oldLayers,
        },
        affected,
      };
    }

    case "UndoSetProjectFormat": {
      const p = s.project;
      const compositions = { ...s.compositions };
      const layers = { ...s.layers };
      const productions = { ...s.productions };
      const affected: string[] = [p.id];
      // Det som fantes før endringen, settes tilbake nøyaktig (det som er fjernet siden, hoppes over);
      // 2D-scener og lag som er laget etterpå, regnes om tilbake til det gamle formatet
      const back = formatMapping(
        { width: p.frameWidth, height: p.frameHeight, fps: p.fps },
        { width: c.project.width, height: c.project.height, fps: c.project.fps },
      );
      const oldComp = new Map(c.compositions.map((x) => [x.id, x]));
      const oldLayer = new Map(c.layers.map((x) => [x.id, x]));
      for (const cur of Object.values(s.compositions)) {
        const old = oldComp.get(cur.id);
        compositions[cur.id] = old
          ? { ...old, revision: rev(cur) }
          : { ...rescaleComposition(cur, back, c.project), revision: rev(cur) };
        affected.push(cur.id);
      }
      for (const cur of Object.values(s.layers)) {
        const old = oldLayer.get(cur.id);
        layers[cur.id] = old
          ? { ...old, revision: rev(cur) }
          : { ...rescaleLayer(cur, back), revision: rev(cur) };
        affected.push(cur.id);
      }
      for (const x of c.productionFps) {
        const cur = s.productions[x.productionId];
        if (cur && !sameFps(cur.fps, x.fps)) {
          productions[cur.id] = { ...cur, fps: x.fps, revision: rev(cur) };
          affected.push(cur.id);
        }
      }
      return {
        state: {
          ...s,
          project: {
            ...p,
            frameWidth: c.project.width,
            frameHeight: c.project.height,
            fps: c.project.fps,
            revision: rev(p),
          },
          productions,
          compositions,
          layers,
        },
        inverse: {
          type: "SetProjectFormat",
          width: p.frameWidth,
          height: p.frameHeight,
          fps: p.fps,
        },
        affected,
      };
    }

    // ---------- 2D-sceneeditor (M3 del 2, DEC-0035) ----------

    case "CreateComposition": {
      assertNewId(s, c.compositionId);
      need(s.variants[c.variantId], "Scenen");
      if (Object.values(s.compositions).some((x) => x.variantId === c.variantId && !x.removed))
        fail("invalid", "Scenen har allerede en 2D-scene");
      // Formatet følger alltid prosjektet (DEC-0039)
      const fields = compositionFields({
        ...c.fields,
        width: s.project.frameWidth,
        height: s.project.frameHeight,
      });
      return {
        state: {
          ...s,
          compositions: {
            ...s.compositions,
            [c.compositionId]: {
              id: c.compositionId,
              revision: 1,
              variantId: c.variantId,
              ...fields,
              camera: { shots: [] },
              removed: false,
              // Laget fra manuset slik det er nå (avvik ved senere endringer, DEC-0054)
              producedFrom: c.producedFrom ?? {
                blockRevisions: currentBlockRevisions(s, c.variantId),
              },
            },
          },
        },
        inverse: { type: "UndoCreateComposition", compositionId: c.compositionId },
        affected: [c.compositionId],
      };
    }

    case "UndoCreateComposition": {
      const comp = need(s.compositions[c.compositionId], "2D-scenen");
      if (Object.values(s.layers).some((l) => l.compositionId === comp.id))
        fail("referenced", "2D-scenen har lag og kan ikke fjernes. Slett den i stedet.");
      const compositions = { ...s.compositions };
      delete compositions[comp.id];
      return {
        state: { ...s, compositions },
        inverse: {
          type: "CreateComposition",
          compositionId: comp.id,
          variantId: comp.variantId,
          fields: {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            durationFrames: comp.durationFrames,
            background: comp.background,
          },
          ...(comp.producedFrom ? { producedFrom: comp.producedFrom } : {}),
        },
        affected: [comp.id],
      };
    }

    case "UpdateComposition": {
      const comp = need(s.compositions[c.compositionId], "2D-scenen");
      // Formatet endres bare samlet for prosjektet (SetProjectFormat, DEC-0039)
      const fields = compositionFields({ ...c.fields, width: comp.width, height: comp.height });
      let camera = comp.camera;
      if (c.camera !== undefined) {
        const r = normalizeCamera(c.camera);
        if (!r.ok) fail("invalid", r.error);
        if (JSON.stringify(r.value).length > MAX_CAMERA_JSON)
          fail("invalid", "Kameraet er for stort");
        camera = r.value;
      }
      return {
        state: {
          ...s,
          compositions: {
            ...s.compositions,
            [comp.id]: { ...comp, ...fields, camera, revision: rev(comp) },
          },
        },
        inverse: {
          type: "UpdateComposition",
          compositionId: comp.id,
          fields: {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            durationFrames: comp.durationFrames,
            background: comp.background,
          },
          ...(c.camera !== undefined ? { camera: comp.camera } : {}),
        },
        affected: [comp.id],
      };
    }

    case "SetCompositionRemoved": {
      const comp = need(s.compositions[c.compositionId], "2D-scenen");
      if (
        !c.removed &&
        Object.values(s.compositions).some(
          (x) => x.id !== comp.id && x.variantId === comp.variantId && !x.removed,
        )
      )
        fail("invalid", "Scenen har allerede en annen 2D-scene");
      return {
        state: {
          ...s,
          compositions: {
            ...s.compositions,
            [comp.id]: { ...comp, removed: c.removed, revision: rev(comp) },
          },
        },
        inverse: { type: "SetCompositionRemoved", compositionId: comp.id, removed: comp.removed },
        affected: [comp.id],
      };
    }

    case "AddLayers": {
      if (c.layers.length === 0) fail("invalid", "Ingen lag å legge til");
      if (c.layers.length > 500) fail("invalid", "For mange lag på én gang (maks 500)");
      const layers = { ...s.layers };
      const ids = new Set<string>();
      for (const n of c.layers) {
        assertNewId(s, n.layerId);
        if (ids.has(n.layerId)) fail("duplicate_id", `ID ${n.layerId} er brukt to ganger`);
        ids.add(n.layerId);
        const comp = need(s.compositions[n.compositionId], "2D-scenen");
        if (comp.removed) fail("invalid", "2D-scenen er slettet");
        const fields = layerFields(s, n.fields);
        let orderKey = n.orderKey;
        const keys = Object.values(layers)
          .filter((l) => l.compositionId === comp.id)
          .map((l) => l.orderKey)
          .sort(compareKeys);
        if (orderKey === undefined) orderKey = keyBetween(keys[keys.length - 1] ?? null, null);
        else if (!isValidOrderKey(orderKey) || keys.includes(orderKey))
          fail("invalid", "Ugyldig plassering i lagrekkefølgen");
        layers[n.layerId] = {
          id: n.layerId,
          revision: 1,
          compositionId: comp.id,
          orderKey,
          ...fields,
          removed: false,
        };
      }
      checkGroups(
        s,
        { ...s, layers },
        c.layers.map((n) => n.layerId),
      );
      return {
        state: { ...s, layers },
        inverse: { type: "UndoAddLayers", layerIds: c.layers.map((n) => n.layerId) },
        affected: c.layers.map((n) => n.layerId),
      };
    }

    case "UndoAddLayers": {
      const layers = { ...s.layers };
      const restored = c.layerIds.map((id) => {
        const l = need(s.layers[id], "Laget");
        delete layers[id];
        return l;
      });
      return {
        state: { ...s, layers },
        inverse: {
          type: "AddLayers",
          layers: restored.map((l) => ({
            layerId: l.id,
            compositionId: l.compositionId,
            orderKey: l.orderKey,
            fields: fieldsOfLayer(l),
          })),
        },
        affected: [...c.layerIds],
      };
    }

    case "UpdateLayers": {
      if (c.layers.length === 0) fail("invalid", "Ingen lag å endre");
      if (new Set(c.layers.map((x) => x.layerId)).size !== c.layers.length)
        fail("invalid", "Samme lag er med to ganger");
      const layers = { ...s.layers };
      const before: { layerId: CompositionLayer["id"]; fields: LayerFields }[] = [];
      for (const u of c.layers) {
        const l = need(s.layers[u.layerId], "Laget");
        before.push({
          layerId: l.id,
          fields: { ...fieldsOfLayer(l), languageImages: l.languageImages ?? [] },
        });
        const { languageImages: _li, ...rest } = l;
        layers[l.id] = { ...rest, ...layerFields(s, u.fields, l), revision: rev(l) };
      }
      checkGroups(
        s,
        { ...s, layers },
        c.layers.map((x) => x.layerId),
      );
      return {
        state: { ...s, layers },
        inverse: { type: "UpdateLayers", layers: before },
        affected: c.layers.map((x) => x.layerId),
      };
    }

    case "MoveLayer": {
      const l = need(s.layers[c.layerId], "Laget");
      const keys = sortedLayerKeys(s, l.compositionId, l.id);
      let orderKey: string;
      if (c.beforeLayerId === null) {
        orderKey = keyBetween(keys[keys.length - 1] ?? null, null);
      } else {
        const target = need(s.layers[c.beforeLayerId], "Laget det skal flyttes bak");
        if (target.compositionId !== l.compositionId || target.id === l.id)
          fail("invalid", "Lagene hører ikke til samme 2D-scene");
        const i = keys.indexOf(target.orderKey);
        orderKey = keyBetween(keys[i - 1] ?? null, target.orderKey);
      }
      // Angre: tilbake rett bak laget som lå foran før flyttingen (eller helt foran)
      const inFront = Object.values(s.layers)
        .filter((x) => x.compositionId === l.compositionId && x.id !== l.id)
        .filter((x) => compareKeys(x.orderKey, l.orderKey) > 0)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey))[0];
      return {
        state: { ...s, layers: { ...s.layers, [l.id]: { ...l, orderKey, revision: rev(l) } } },
        inverse: { type: "MoveLayer", layerId: l.id, beforeLayerId: inFront?.id ?? null },
        affected: [l.id],
      };
    }

    case "SetLayersRemoved": {
      if (c.layerIds.length === 0) fail("invalid", "Ingen lag valgt");
      const layers = { ...s.layers };
      const changed = [...new Set(c.layerIds)]
        .map((id) => need(s.layers[id], "Laget"))
        .filter((l) => l.removed !== c.removed);
      if (changed.length === 0) fail("invalid", "Ingen endring");
      for (const l of changed) layers[l.id] = { ...l, removed: c.removed, revision: rev(l) };
      return {
        state: { ...s, layers },
        inverse: {
          type: "SetLayersRemoved",
          layerIds: changed.map((l) => l.id),
          removed: !c.removed,
        },
        affected: changed.map((l) => l.id),
      };
    }

    // ---------- Lyd i filmen (DEC-0044) ----------

    case "AddAudioClips": {
      if (!Array.isArray(c.clips) || c.clips.length === 0) fail("invalid", "Ingen lyd å legge til");
      if (c.clips.length > 500) fail("invalid", "For mange lydklipp på én gang (maks 500)");
      const audioClips = { ...s.audioClips };
      const ids = new Set<string>();
      for (const n of c.clips) {
        assertNewId(s, n.clipId);
        if (ids.has(n.clipId)) fail("duplicate_id", `ID ${n.clipId} er brukt to ganger`);
        ids.add(n.clipId);
        audioClips[n.clipId] = {
          id: n.clipId,
          revision: 1,
          ...audioFields(s, n.fields),
          removed: false,
        };
      }
      return {
        state: { ...s, audioClips },
        inverse: { type: "UndoAddAudioClips", clipIds: c.clips.map((n) => n.clipId) },
        affected: c.clips.map((n) => n.clipId),
      };
    }

    case "UndoAddAudioClips": {
      const audioClips = { ...s.audioClips };
      const restored = c.clipIds.map((id) => {
        const a = need(s.audioClips[id], "Lydklippet");
        delete audioClips[id];
        return a;
      });
      return {
        state: { ...s, audioClips },
        inverse: {
          type: "AddAudioClips",
          clips: restored.map((a) => ({ clipId: a.id, fields: audioClipFieldsOf(a) })),
        },
        affected: [...c.clipIds],
      };
    }

    case "UpdateAudioClips": {
      if (!Array.isArray(c.clips) || c.clips.length === 0) fail("invalid", "Ingen lyd å endre");
      if (new Set(c.clips.map((x) => x.clipId)).size !== c.clips.length)
        fail("invalid", "Samme lydklipp er med to ganger");
      const audioClips = { ...s.audioClips };
      const before: { clipId: AudioClip["id"]; fields: AudioClipFields }[] = [];
      for (const u of c.clips) {
        const a = need(s.audioClips[u.clipId], "Lydklippet");
        before.push({ clipId: a.id, fields: audioClipFieldsOf(a) });
        // Alle feltene erstattes; språket fjernes når det ikke er med (standard for lydtypen)
        const { language: _lang, ...rest } = a;
        audioClips[a.id] = { ...rest, ...audioFields(s, u.fields), revision: rev(a) };
      }
      return {
        state: { ...s, audioClips },
        inverse: { type: "UpdateAudioClips", clips: before },
        affected: c.clips.map((x) => x.clipId),
      };
    }

    case "SetAudioClipsRemoved": {
      if (!Array.isArray(c.clipIds) || c.clipIds.length === 0) fail("invalid", "Ingen lyd valgt");
      const audioClips = { ...s.audioClips };
      const changed = [...new Set(c.clipIds)]
        .map((id) => need(s.audioClips[id], "Lydklippet"))
        .filter((a) => a.removed !== c.removed);
      if (changed.length === 0) fail("invalid", "Ingen endring");
      for (const a of changed) audioClips[a.id] = { ...a, removed: c.removed, revision: rev(a) };
      return {
        state: { ...s, audioClips },
        inverse: {
          type: "SetAudioClipsRemoved",
          clipIds: changed.map((a) => a.id),
          removed: !c.removed,
        },
        affected: changed.map((a) => a.id),
      };
    }
  }
}

export function applyCommand(state: ProjectState, env: CommandEnvelope): ApplyResult {
  try {
    if (env.baseRevisions) {
      const stale: string[] = [];
      for (const [id, expected] of Object.entries(env.baseRevisions)) {
        const actual = revisionOf(state, id);
        if (actual !== expected) stale.push(id);
      }
      if (stale.length > 0) {
        return {
          ok: false,
          error: {
            code: "revision_conflict",
            message: "Noen andre har endret dette i mellomtiden",
            details: stale,
          },
        };
      }
    }
    const ran = run(state, env);
    const { inverse, affected } = ran;
    let next = ran.state;
    // Notater på tekst eller scener som forsvinner (angre av import, ny scene, innsetting …):
    // slettede notater fjernes med, synlige notater stopper endringen med en tydelig melding (DEC-0031)
    const orphans = Object.values(next.annotations).filter(
      (a) =>
        (a.blockId !== null && !Object.prototype.hasOwnProperty.call(next.blocks, a.blockId)) ||
        (a.variantId !== null && !Object.prototype.hasOwnProperty.call(next.variants, a.variantId)),
    );
    if (orphans.length) {
      const visible = orphans.filter((a) => !a.removed);
      if (visible.length)
        fail(
          "referenced",
          visible.length === 1
            ? "Det finnes et notat på denne teksten. Slett notatet først hvis endringen skal angres."
            : `Det finnes ${visible.length} notater på denne teksten. Slett notatene først hvis endringen skal angres.`,
          visible.map((a) => a.id),
        );
      const annotations = { ...next.annotations };
      for (const a of orphans) delete annotations[a.id];
      next = { ...next, annotations };
    }
    // 2D-scener på scener som forsvinner, og lag som viser ressurser som forsvinner (DEC-0035)
    if (next.variants !== state.variants || next.compositions !== state.compositions) {
      const lost = Object.values(next.compositions).filter(
        (c) => !Object.prototype.hasOwnProperty.call(next.variants, c.variantId),
      );
      if (lost.length)
        fail(
          "referenced",
          "Scenen har en 2D-scene i sceneeditoren og kan ikke fjernes. Slett 2D-scenen først.",
          lost.map((c) => c.id),
        );
    }
    if (
      next.assets !== state.assets ||
      next.assetVariants !== state.assetVariants ||
      next.assetVersions !== state.assetVersions
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      const lost = Object.values(next.layers).filter(
        (l) =>
          !has(next.assets, l.assetId) ||
          !has(next.assetVariants, l.assetVariantId) ||
          !has(next.assetVersions, l.versionId),
      );
      if (lost.length)
        fail(
          "referenced",
          "Ressursen er brukt i en 2D-scene og kan ikke fjernes. Arkiver den i stedet.",
          lost.map((l) => l.id),
        );
    }
    // Lyd i scener eller fra lydfiler som forsvinner (angre av opprettelse, DEC-0044)
    if (
      next.occurrences !== state.occurrences ||
      next.blocks !== state.blocks ||
      next.assets !== state.assets ||
      next.assetVariants !== state.assetVariants ||
      next.assetVersions !== state.assetVersions
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      const lost = Object.values(next.audioClips).filter(
        (a) =>
          !has(next.occurrences, a.occurrenceId) ||
          !has(next.blocks, a.blockId) ||
          !has(next.assets, a.assetId) ||
          !has(next.assetVariants, a.assetVariantId) ||
          !has(next.assetVersions, a.versionId),
      );
      if (lost.length)
        fail(
          "referenced",
          "Det ligger lyd på dette i filmen. Fjern lyden først hvis endringen skal angres.",
          lost.map((a) => a.id),
        );
    }
    // Klippdeler og tidskoblinger som peker på noe som forsvinner (angre av opprettelse, DEC-0048).
    // Også fjernede rader: de ligger fortsatt i databasen med fremmednøkkel.
    if (
      next.occurrences !== state.occurrences ||
      next.blocks !== state.blocks ||
      next.takes !== state.takes ||
      next.layers !== state.layers
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      const lost = [
        ...Object.values(next.clipParts).filter(
          (p) => !has(next.occurrences, p.occurrenceId) || !has(next.takes, p.takeId),
        ),
        ...Object.values(next.timeLinks).filter(
          (l) =>
            !has(next.occurrences, l.occurrenceId) ||
            !has(next.blocks, l.blockId) ||
            !has(next.layers, l.layerId),
        ),
      ];
      if (lost.length)
        fail(
          "referenced",
          "Scenen er klippet eller har tidskoblinger i monteringen, så dette kan ikke angres.",
          lost.map((x) => x.id),
        );
    }
    // Kontinuitetshendelser (DEC-0055) når manus, scener eller ressurser endres
    if (
      next.scenes !== state.scenes ||
      next.blocks !== state.blocks ||
      next.variants !== state.variants ||
      next.assets !== state.assets ||
      next.assetVariants !== state.assetVariants
    ) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      let events: Record<string, ContinuityEvent> | null = null;
      const lost: string[] = [];
      for (const e of Object.values(next.continuityEvents)) {
        const gone =
          !has(next.assets, e.assetId) ||
          !has(next.assetVariants, e.fromVariantId) ||
          !has(next.assetVariants, e.toVariantId) ||
          !has(next.scenes, e.untilSceneId) ||
          !has(next.blocks, e.blockId);
        // Linjen har flyttet til en annen scene (deling, sammenslåing, angring av dem): hendelsen følger linjen
        const b = e.blockId ? next.blocks[e.blockId] : undefined;
        const lineScene = b ? next.variants[b.variantId]?.sceneId : undefined;
        if (!gone && lineScene && lineScene !== e.sceneId) {
          events ??= { ...next.continuityEvents };
          const was = state.continuityEvents[e.id];
          events[e.id] = {
            ...e,
            sceneId: lineScene,
            revision: was ? was.revision + 1 : e.revision,
          };
          continue;
        }
        if (!gone && has(next.scenes, e.sceneId)) continue;
        // Fjernede hendelser og avviste forslag slettes sammen med det de pekte på (angre av opprettelse)
        if (e.removed || e.status === "dismissed") {
          events ??= { ...next.continuityEvents };
          delete events[e.id];
        } else lost.push(e.id);
      }
      if (lost.length)
        fail(
          "referenced",
          "Det er registrert kontinuitet (utseende) på dette. Fjern hendelsen først hvis endringen skal angres.",
          lost,
        );
      if (events) next = { ...next, continuityEvents: events };
    }
    // Oversettelser av linjer eller scener som forsvinner (angre av opprettelse, DEC-0058): fjernede slettes
    // med, gjeldende stopper endringen
    if (next.blocks !== state.blocks || next.variants !== state.variants) {
      const has = (o: object, id: string | null) =>
        id === null || Object.prototype.hasOwnProperty.call(o, id);
      let translations: Record<string, Translation> | null = null;
      const lost: string[] = [];
      for (const t of Object.values(next.translations)) {
        if (has(next.blocks, t.blockId) && has(next.variants, t.variantId)) continue;
        if (t.removed) {
          translations ??= { ...next.translations };
          delete translations[t.id];
        } else lost.push(t.id);
      }
      if (lost.length)
        fail(
          "referenced",
          "Teksten har oversettelser (for eksempel engelsk). Angre importen av oversettelsen eller fjern oversettelsene av disse linjene først.",
          lost,
        );
      if (translations) next = { ...next, translations };
    }
    const violations = checkInvariants(next);
    if (violations.length > 0) {
      return {
        ok: false,
        error: {
          code: "invariant_violation",
          message: "Endringen ville brutt en systemregel",
          details: violations.map((v) => `${v.invariant}: ${v.message}`),
        },
      };
    }
    return { ok: true, state: next, inverse, affected };
  } catch (e) {
    if (e instanceof CommandFailure) {
      return {
        ok: false,
        error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
      };
    }
    throw e;
  }
}
