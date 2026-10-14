/**
 * Rådgivende kontinuitetsanalyse (M6 del 3, DEC-0056, mandat kap. 21, REQ-0319–0324, REQ-0129, REQ-0132).
 *
 * Gratis, regelbasert gjennomgang av manus og produksjon. Alt er råd: ingenting endres, og funn som bygger
 * på tolkning av teksten merkes som usikre (REQ-0314). Funnene:
 * - mulig skrivefeil i et navn (REQ-0129),
 * - karakter med i handlingen før hun er introdusert (REQ-0320),
 * - gjenstand brukt i bestemt form før den er etablert (REQ-0321),
 * - replikk som viser til noe som bare finnes i en deaktivert scene (REQ-0322),
 * - utseende som endres uten registrert årsak (REQ-0323),
 * - motsetninger i fortellingstiden og kontinuiteten (REQ-0324),
 * - 2D-scener som viser en eldre versjon enn den som er godkjent nå (REQ-0132).
 */
import type { Asset, ProjectState, ScriptBlock } from "../model";
import { blocksOfVariant, orderedOccurrences, sceneNumberOf } from "../views";
import { characterName, mentions } from "../screenplay/filter";
import { assetNames, editDistance, nameKey } from "../library";
import { outdatedLayers } from "../library/impact";
import { compositionOfVariant, layersOf } from "../composition/render";
import { L, localized } from "../i18n";
import {
  appearanceAt,
  appearanceFrom,
  continuityFor,
  compareStory,
  continuityEventsOf,
  eventSceneId,
  hasContinuity,
  layerContinuity,
  layerEffectiveVariant,
  storyTimesCached,
} from "./index";

export type FindingKind =
  | "name_variant"
  | "before_intro"
  | "before_established"
  | "refers_deactivated"
  | "unexplained_change"
  | "timeline_conflict"
  | "asset_outdated"
  | "spinoff_gap";

export const FINDING_LABEL: Record<FindingKind, string> = localized({
  name_variant: ["Mulig skrivefeil i navn", "Possible typo in a name"],
  before_intro: ["Med før introduksjonen", "In the action before the introduction"],
  before_established: ["Brukt før den er etablert", "Used before it is established"],
  refers_deactivated: ["Viser til en deaktivert scene", "Refers to a deactivated scene"],
  unexplained_change: ["Utseende endres uten årsak", "Look changes without a reason"],
  timeline_conflict: ["Motsetning i fortellingstiden", "Conflict in story time"],
  asset_outdated: ["Eldre versjon av en ressurs", "Older version of an asset"],
  spinoff_gap: ["Mangler i produksjonen", "Missing from the production"],
});

export interface Finding {
  /** Stabil nøkkel (for å skjule et funn). */
  readonly key: string;
  readonly kind: FindingKind;
  /** «uncertain»: bygger på tolkning av teksten og kan være feil (REQ-0314). */
  readonly certainty: "likely" | "uncertain";
  /** Forklaringen, på gjeldende språk (DEC-0081). */
  readonly message: string;
  readonly occurrenceId: string | null;
  readonly blockId: string | null;
  readonly assetId: string | null;
  /** Avledet produksjon (DEC-0060): hovedfilmens scene som kan tas med for å løse funnet. */
  readonly includeOccurrenceId?: string;
  /** Avledet produksjon: hovedfilmens kontinuitetshendelse som kan slås av i produksjonen. */
  readonly eventId?: string;
}

type Occ = ReturnType<typeof orderedOccurrences>[number];

const num = (o: Occ | undefined) =>
  o?.productionNumber
    ? `scene ${o.productionNumber}`
    : L("scenen uten nummer", "the scene without number");

/** Kan to replikknavn være samme navn med skrivefeil? Ikke når de bare skiller seg i et tall («GUTT 1»). */
function typoOf(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 2) return false;
  const strip = (x: string) => x.replace(/\s*\d+[A-ZÆØÅ]?$/u, "");
  if (strip(a) === strip(b)) return false;
  const n = Math.min(a.length, b.length);
  if (n < 4) return false;
  return editDistance(a, b) <= (n >= 9 ? 2 : 1);
}

/** Har teksten navnet skrevet med store bokstaver som eget ord (manusets introduksjon: «MAJA kommer inn»)? */
function capsMention(text: string, key: string): boolean {
  if (key.length < 2) return false;
  const re = new RegExp(
    `(^|[^\\p{L}\\p{N}])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`,
    "u",
  );
  return re.test(text);
}

const isPerson = (a: Asset) => a.kind === "character" || a.kind === "animal";

export function continuityAnalysis(s0: ProjectState, productionId: string): Finding[] {
  // Kontinuiteten slik den er i produksjonen (lokale og avslåtte hendelser i en spinoff, DEC-0060)
  const s = continuityFor(s0, productionId);
  // Scener uten eget nummer i en avledet produksjon vises med hovedfilmens nummer
  const occs = orderedOccurrences(s, productionId).map((o) => {
    const n = sceneNumberOf(s, o);
    return n === o.productionNumber ? o : { ...o, productionNumber: n };
  });
  const active = occs.filter((o) => o.active);
  const blocksOf = new Map<string, ScriptBlock[]>();
  const blocks = (o: Occ) => {
    let b = blocksOf.get(o.variantId);
    if (!b) blocksOf.set(o.variantId, (b = blocksOfVariant(s, o.variantId)));
    return b;
  };
  const assets = Object.values(s.assets).filter(
    (a) => !a.archived && !a.removed && a.kind !== "sound",
  );
  const keysOf = (a: Asset) =>
    assetNames(a)
      .map((n) => nameKey(n))
      .filter((k) => k.length >= 2);
  const out: Finding[] = [];
  // Avledet produksjon: hovedfilmens scener som ikke er med (DEC-0060, REQ-0325/0369)
  const prod = s.productions[productionId];
  const mainP = Object.values(s.productions).find((p) => p.kind === "main");
  const derived = !!prod && prod.kind !== "main" && !!mainP;
  const prodName = prod
    ? L(`«${prod.name}»`, `“${prod.name}”`)
    : L("produksjonen", "the production");
  const mainOccs = derived ? orderedOccurrences(s, mainP!.id).filter((o) => o.active) : [];
  const mainOf = (sceneId: string) => mainOccs.find((o) => o.sceneId === sceneId);
  const mainNum = (sceneId: string) => {
    const m = mainOf(sceneId);
    return m?.productionNumber ? `scene ${m.productionNumber}` : L("en scene", "a scene");
  };
  const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  // 1. Mulige skrivefeil: replikknavn som ligner, men ikke er, navnet på en karakter (REQ-0129)
  {
    const known = new Map<string, Asset>();
    for (const a of assets) if (isPerson(a)) for (const k of keysOf(a)) known.set(k, a);
    const speakerCount = new Map<string, { n: number; first: { o: Occ; b: ScriptBlock } }>();
    for (const o of active)
      for (const b of blocks(o)) {
        if (b.kind !== "character") continue;
        const k = characterName(b.text);
        if (!k) continue;
        const x = speakerCount.get(k);
        if (x) x.n++;
        else speakerCount.set(k, { n: 1, first: { o, b } });
      }
    for (const [name, info] of speakerCount) {
      if (known.has(name)) continue;
      // Mot ressursene i biblioteket, ellers mot et replikknavn som brukes mye oftere
      const asset = [...known.entries()].find(([k]) => typoOf(name, k));
      const other = asset
        ? null
        : [...speakerCount.entries()].find(([k, v]) => v.n >= info.n * 3 && typoOf(name, k));
      const target = asset ? asset[1].name : other ? other[0] : null;
      if (!target) continue;
      const where =
        info.n === 1
          ? num(info.first.o)
          : L(
              `${info.n} replikker, første i ${num(info.first.o)}`,
              `${info.n} lines, first in ${num(info.first.o)}`,
            );
      out.push({
        key: `name:${name}`,
        kind: "name_variant",
        certainty: "uncertain",
        message: L(
          `«${name}» (${where}) ligner «${target}». Skrivefeil?`,
          `“${name}” (${where}) looks like “${target}”. A typo?`,
        ),
        occurrenceId: info.first.o.id,
        blockId: info.first.b.id,
        assetId: asset ? asset[1].id : null,
      });
    }
  }

  // 2. Karakter med i handlingen før introduksjonen (REQ-0320). Introduksjon: første replikk eller navnet
  //    med store bokstaver i handlingen (manuskonvensjon). Rekkefølgen er visningsrekkefølgen.
  for (const a of assets) {
    if (!isPerson(a)) continue;
    const keys = keysOf(a);
    if (keys.length === 0) continue;
    let intro: Occ | null = null;
    let early: { o: Occ; b: ScriptBlock } | null = null;
    for (const o of active) {
      for (const b of blocks(o)) {
        if (b.kind === "character" && keys.includes(characterName(b.text))) intro ??= o;
        if (b.kind === "action" && keys.some((k) => capsMention(b.text, k))) intro ??= o;
        if (intro) break;
        if (b.kind === "action" && !early && keys.some((k) => mentions(b.text, k)))
          early = { o, b };
      }
      if (intro) break;
    }
    if (early && intro && early.o.id !== intro.id)
      out.push({
        key: `intro:${a.id}`,
        kind: "before_intro",
        certainty: "uncertain",
        message: L(
          `${a.name} er med i handlingen i ${num(early.o)}, men introduseres først i ${num(intro)} (navnet med store bokstaver eller første replikk).`,
          `${a.name} is in the action in ${num(early.o)}, but is first introduced in ${num(intro)} (the capitalised name or first line).`,
        ),
        occurrenceId: early.o.id,
        blockId: early.b.id,
        assetId: a.id,
      });
  }

  // 3. Gjenstand i bestemt form før den er etablert (REQ-0321): «vasen» før «en vase»
  for (const a of assets) {
    if (a.kind !== "object") continue;
    const stems = assetNames(a)
      .map((n) => n.toLocaleLowerCase("nb").trim())
      .filter((n) => n.length >= 3 && !n.includes(" "));
    if (stems.length === 0) continue;
    let first: { o: Occ; b: ScriptBlock; word: string; definite: boolean } | null = null;
    for (const o of active) {
      for (const b of blocks(o)) {
        if (b.kind !== "action") continue;
        const words = b.text.toLocaleLowerCase("nb").match(/[\p{L}]+/gu) ?? [];
        for (let i = 0; i < words.length && !first; i++) {
          const w = words[i]!;
          const stem = stems.find((x) => w === x || (w.startsWith(x) && w.length - x.length <= 3));
          if (!stem) continue;
          const prev = words[i - 1] ?? "";
          const indefinite =
            w === stem && ["en", "ei", "et", "ett", "noen", "flere"].includes(prev); // i18n-ignore
          const definite = w !== stem && /^(en|et|a|ene|ne|n|t)$/u.test(w.slice(stem.length));
          first = { o, b, word: w, definite: definite && !indefinite };
        }
        if (first) break;
      }
      if (first) break;
    }
    if (first?.definite) {
      const indef = first.word.endsWith("et") ? "et" : "en";
      const suggestion = stemOf(first.word, a);
      out.push({
        key: `established:${a.id}`,
        kind: "before_established",
        certainty: "uncertain",
        message: L(
          `«${first.word}» står i bestemt form første gang den nevnes (${num(first.o)}). Skal den etableres først (for eksempel «${indef} ${suggestion}»)?`,
          `“${first.word}” is in the definite form the first time it is mentioned (${num(first.o)}). Should it be introduced first (for example “${indef} ${suggestion}”)?`,
        ),
        occurrenceId: first.o.id,
        blockId: first.b.id,
        assetId: a.id,
      });
    }
  }

  // 4. Replikk som viser til noe som bare finnes i en deaktivert scene (REQ-0322)
  {
    const inactive = occs.filter((o) => !o.active);
    if (inactive.length)
      for (const a of assets) {
        const keys = keysOf(a);
        if (keys.length === 0) continue;
        const shownIn = (o: Occ) =>
          blocks(o).some(
            (b) =>
              (b.kind === "action" && keys.some((k) => mentions(b.text, k))) ||
              (b.kind === "character" && keys.includes(characterName(b.text))),
          ) || keys.some((k) => capsMention(s.variants[o.variantId]?.heading.location ?? "", k));
        const onlyIn = inactive.filter(shownIn);
        if (onlyIn.length === 0 || active.some(shownIn)) continue;
        for (const o of active) {
          const b = blocks(o).find(
            (x) => x.kind === "dialogue" && keys.some((k) => mentions(x.text, k)),
          );
          if (!b) continue;
          out.push({
            key: `deactivated:${a.id}:${o.id}`,
            kind: "refers_deactivated",
            certainty: "uncertain",
            message: L(
              `Replikken i ${num(o)} nevner ${a.name}, som bare er med i ${num(onlyIn[0])} (deaktivert).`,
              `The line in ${num(o)} mentions ${a.name}, who is only in ${num(onlyIn[0])} (deactivated).`,
            ),
            occurrenceId: o.id,
            blockId: b.id,
            assetId: a.id,
          });
          break;
        }
      }
  }

  // 5. Utseende som endres uten registrert årsak (REQ-0323): 2D-scener som viser et annet utseende enn
  //    kontinuiteten, og bytte av utseende mellom scener i fortellingsrekkefølge uten hendelse
  {
    const times = storyTimesCached(s);
    const byStory = [...active].sort(
      (x, y) => (times.get(x.sceneId) ?? 0) - (times.get(y.sceneId) ?? 0),
    );
    const last = new Map<string, { o: Occ; variantId: string }>();
    for (const o of byStory) {
      const comp = compositionOfVariant(s, o.variantId);
      if (!comp) continue;
      const seen = new Set<string>();
      for (const l of layersOf(s, comp.id)) {
        if (!l.assetId || !l.visible || seen.has(l.assetId)) continue;
        const a = s.assets[l.assetId];
        if (!a || !hasContinuity(a)) continue;
        seen.add(a.id);
        const variantId = layerEffectiveVariant(s, l);
        const check = layerContinuity(s, l, o.sceneId);
        if (check?.mismatch && check.expected) {
          out.push({
            key: `look:${l.id}:${o.id}`,
            kind: "unexplained_change",
            certainty: "likely",
            message: L(
              `${a.name} vises som «${variantName(s, variantId)}» i 2D-scenen i ${num(o)}, men kontinuiteten sier «${check.expected.name}».`,
              `${a.name} is shown as “${variantName(s, variantId)}” in the 2D scene in ${num(o)}, but the continuity says “${check.expected.name}”.`,
            ),
            occurrenceId: o.id,
            blockId: null,
            assetId: a.id,
          });
        } else if (variantId) {
          const prev = last.get(a.id);
          const explained = appearanceAt(s, a.id, o.sceneId).variantId === variantId;
          if (prev && prev.variantId !== variantId && !explained)
            out.push({
              key: `change:${a.id}:${o.id}`,
              kind: "unexplained_change",
              certainty: "uncertain",
              message: L(
                `${a.name} bytter utseende fra «${variantName(s, prev.variantId)}» (${num(prev.o)}) til «${variantName(s, variantId)}» (${num(o)}) uten en registrert kontinuitetshendelse.`,
                `${a.name} changes look from “${variantName(s, prev.variantId)}” (${num(prev.o)}) to “${variantName(s, variantId)}” (${num(o)}) without a recorded continuity event.`,
              ),
              occurrenceId: o.id,
              blockId: null,
              assetId: a.id,
            });
        }
        if (variantId) last.set(a.id, { o, variantId });
      }
    }
  }

  // 6. Motsetninger i fortellingstiden (REQ-0324)
  {
    // Den aktive forekomsten av scenen hvis den finnes
    const occOfScene = (sceneId: string) =>
      occs.find((o) => o.sceneId === sceneId && o.active) ??
      occs.find((o) => o.sceneId === sceneId);
    // Tilbakeblikk o.l. ankret til en scene som er deaktivert eller borte
    for (const o of active) {
      const st = s.scenes[o.sceneId]?.storyTime;
      if (!st || st.kind === "linear" || !st.anchorSceneId) continue;
      const anchor = occOfScene(st.anchorSceneId);
      if (!s.scenes[st.anchorSceneId] || (anchor && !anchor.active)) {
        const anchorName = anchor ? num(anchor) : L("en scene", "a scene");
        const anchorState = anchor
          ? L("er deaktivert", "is deactivated")
          : L("ikke finnes lenger", "no longer exists");
        out.push({
          key: `anchor:${o.id}`,
          kind: "timeline_conflict",
          certainty: "likely",
          message: L(
            `Fortellingstiden i ${num(o)} er regnet fra ${anchorName}, som ${anchorState}.`,
            `The story time in ${num(o)} is counted from ${anchorName}, which ${anchorState}.`,
          ),
          occurrenceId: o.id,
          blockId: null,
          assetId: null,
        });
      } else if (!anchor && derived && mainOf(st.anchorSceneId))
        // Spinoff: tilbakeblikket viser til en scene som ikke er med (REQ-0369)
        out.push({
          key: `anchor:${o.id}`,
          kind: "spinoff_gap",
          certainty: "likely",
          message: L(
            `${capital(num(o))} er et tilbakeblikk (eller lignende) til ${mainNum(st.anchorSceneId)} i hovedfilmen, som ikke er med i ${prodName}.`,
            `${capital(num(o))} is a flashback (or similar) to ${mainNum(st.anchorSceneId)} in the main film, which is not in ${prodName}.`,
          ),
          occurrenceId: o.id,
          blockId: null,
          assetId: null,
          includeOccurrenceId: mainOf(st.anchorSceneId)!.id,
        });
    }
    // Kontinuitetshendelser som ikke henger sammen
    for (const a of assets) {
      if (!hasContinuity(a)) continue;
      const evs = continuityEventsOf(s, a.id);
      for (const [i, e] of evs.entries()) {
        const sceneId = eventSceneId(s, e);
        const o = occOfScene(sceneId);
        if (e.duration === "temporary" && e.untilSceneId) {
          // Samme regel som kjernen (fortellingstid, så plassen i filmen)
          if (!s.scenes[e.untilSceneId] || compareStory(s, e.untilSceneId, sceneId) <= 0)
            out.push({
              key: `until:${e.id}`,
              kind: "timeline_conflict",
              certainty: "likely",
              message: L(
                `${a.name}: endringen i ${num(o)} skal vare til ${num(occOfScene(e.untilSceneId))}, men den scenen kommer ikke senere i fortellingstiden. Den gjelder derfor bare sin egen scene.`,
                `${a.name}: the change in ${num(o)} is meant to last until ${num(occOfScene(e.untilSceneId))}, but that scene does not come later in story time. It therefore applies only to its own scene.`,
              ),
              occurrenceId: o?.id ?? null,
              blockId: e.blockId,
              assetId: a.id,
            });
        }
        if (e.fromVariantId) {
          // Utseendet slik de tidligere hendelsene gir det; en midlertidig endring som gjelder her, er også
          // et gyldig «før»
          const look = appearanceFrom(s, evs.slice(0, i), sceneId, e.blockId);
          const before = look.variantId;
          if (before && before !== e.fromVariantId && look.baseVariantId !== e.fromVariantId)
            out.push({
              key: `from:${e.id}`,
              kind: "timeline_conflict",
              certainty: "likely",
              message: L(
                `${a.name}: hendelsen i ${num(o)} sier utseendet før var «${variantName(s, e.fromVariantId)}», men etter de tidligere hendelsene er det «${variantName(s, before)}».`,
                `${a.name}: the event in ${num(o)} says the look before was “${variantName(s, e.fromVariantId)}”, but after the earlier events it is “${variantName(s, before)}”.`,
              ),
              occurrenceId: o?.id ?? null,
              blockId: e.blockId,
              assetId: a.id,
            });
        }
      }
    }
  }

  // 8. Avledet produksjon: noe som trengs for forståelsen, er bare i scener som ikke er med (REQ-0325/0369)
  if (derived) {
    const inProd = new Set(active.map((o) => o.sceneId));
    const omitted = mainOccs.filter((o) => !inProd.has(o.sceneId));
    const shows = (o: Occ, keys: string[]) =>
      blocks(o).some(
        (b) =>
          (b.kind === "action" && keys.some((k) => mentions(b.text, k))) ||
          (b.kind === "character" && keys.includes(characterName(b.text))),
      );
    const introduces = (o: Occ, keys: string[]) =>
      blocks(o).some(
        (b) =>
          (b.kind === "character" && keys.includes(characterName(b.text))) ||
          (b.kind === "action" && keys.some((k) => capsMention(b.text, k))),
      );
    if (omitted.length) {
      // a) Karakter som introduseres i en scene som ikke er med
      for (const a of assets) {
        if (!isPerson(a)) continue;
        const keys = keysOf(a);
        if (!keys.length) continue;
        const first = active.find((o) => shows(o, keys) || introduces(o, keys));
        if (!first || active.some((o) => introduces(o, keys))) continue;
        const intro = mainOccs.find((o) => introduces(o, keys));
        if (!intro || inProd.has(intro.sceneId)) continue;
        out.push({
          key: `gap-intro:${a.id}`,
          kind: "spinoff_gap",
          certainty: "uncertain",
          message: L(
            `${a.name} er med i ${num(first)}, men introduseres i ${mainNum(intro.sceneId)} i hovedfilmen, som ikke er med i ${prodName}.`,
            `${a.name} is in ${num(first)}, but is introduced in ${mainNum(intro.sceneId)} in the main film, which is not in ${prodName}.`,
          ),
          occurrenceId: first.id,
          blockId: null,
          assetId: a.id,
          includeOccurrenceId: intro.id,
        });
      }
      // b) Replikk som viser til noe som bare vises i scener som ikke er med
      for (const a of assets) {
        const keys = keysOf(a);
        if (!keys.length || active.some((o) => shows(o, keys))) continue;
        const only = omitted.find((o) => shows(o, keys));
        if (!only) continue;
        for (const o of active) {
          const b = blocks(o).find(
            (x) => x.kind === "dialogue" && keys.some((k) => mentions(x.text, k)),
          );
          if (!b) continue;
          out.push({
            key: `gap-ref:${a.id}:${o.id}`,
            kind: "spinoff_gap",
            certainty: "uncertain",
            message: L(
              `Replikken i ${num(o)} nevner ${a.name}, som bare vises i ${mainNum(only.sceneId)} i hovedfilmen. Den scenen er ikke med i ${prodName}.`,
              `The line in ${num(o)} mentions ${a.name}, who only appears in ${mainNum(only.sceneId)} in the main film. That scene is not in ${prodName}.`,
            ),
            occurrenceId: o.id,
            blockId: b.id,
            assetId: a.id,
            includeOccurrenceId: only.id,
          });
          break;
        }
      }
    }
    // c) Utseende som skyldes en hendelse i en scene som ikke er med (f.eks. hårklippet)
    for (const a of assets) {
      if (!hasContinuity(a)) continue;
      const keys = keysOf(a);
      for (const e of continuityEventsOf(s, a.id)) {
        if (e.productionId || !e.toVariantId) continue;
        const sceneId = eventSceneId(s, e);
        if (inProd.has(sceneId) || !mainOf(sceneId)) continue;
        const later = active.find(
          (o) =>
            compareStory(s, sceneId, o.sceneId) < 0 &&
            (shows(o, keys) || sceneHasLayer(s, o.variantId, a.id)) &&
            appearanceAt(s, a.id, o.sceneId).sourceEventId === e.id,
        );
        if (!later) continue;
        const desc = e.description.trim();
        const descPart = desc ? L(` («${desc}»)`, ` (“${desc}”)`) : "";
        out.push({
          key: `gap-event:${e.id}`,
          kind: "spinoff_gap",
          certainty: "likely",
          message: L(
            `${a.name} har «${variantName(s, e.toVariantId)}» i ${num(later)}, men endringen${descPart} skjer i ${mainNum(sceneId)} i hovedfilmen, som ikke er med i ${prodName}. Ta med scenen, skriv en sammenbindende scene, eller slå av endringen i ${prodName}.`,
            `${a.name} has “${variantName(s, e.toVariantId)}” in ${num(later)}, but the change${descPart} happens in ${mainNum(sceneId)} in the main film, which is not in ${prodName}. Include that scene, write a linking scene, or switch off the change in ${prodName}.`,
          ),
          occurrenceId: later.id,
          blockId: null,
          assetId: a.id,
          includeOccurrenceId: mainOf(sceneId)!.id,
          eventId: e.id,
        });
      }
    }
  }

  // 7. 2D-scener som viser en eldre versjon enn den godkjente (REQ-0132)
  {
    const occOfComp = (compId: string) => {
      const c = s.compositions[compId];
      return c ? occs.find((o) => o.variantId === c.variantId) : undefined;
    };
    for (const x of outdatedLayers(s)) {
      const o = occOfComp(x.compositionId);
      if (!o || !o.active) continue;
      const a = s.assets[x.assetId];
      const assetName = a?.name ?? L("en ressurs", "an asset");
      const shownVersion = s.assetVersions[x.versionId]?.number ?? "?";
      const approvedVersion = s.assetVersions[x.approvedVersionId]?.number ?? "?";
      out.push({
        key: `outdated:${x.layerId}`,
        kind: "asset_outdated",
        certainty: "likely",
        message: L(
          `2D-scenen i ${num(o)} viser v${shownVersion} av ${assetName} («${variantName(s, x.variantId)}»), men v${approvedVersion} er godkjent nå.`,
          `The 2D scene in ${num(o)} shows v${shownVersion} of ${assetName} (“${variantName(s, x.variantId)}”), but v${approvedVersion} is approved now.`,
        ),
        occurrenceId: o?.id ?? null,
        blockId: null,
        assetId: x.assetId,
      });
    }
  }
  return out;
}

function stemOf(word: string, a: Asset): string {
  return (
    assetNames(a)
      .map((n) => n.toLocaleLowerCase("nb").trim())
      .find((n) => word.startsWith(n)) ?? a.name
  );
}

/** Har 2D-scenen til scenevarianten et synlig lag med ressursen? */
function sceneHasLayer(s: ProjectState, variantId: string, assetId: string): boolean {
  const comp = compositionOfVariant(s, variantId);
  return !!comp && layersOf(s, comp.id).some((l) => l.visible && l.assetId === assetId);
}

function variantName(s: ProjectState, id: string | null): string {
  return id ? (s.assetVariants[id]?.name ?? L("ukjent", "unknown")) : L("standard", "default");
}
