/**
 * Strukturelle invariantkontroller (docs/architecture/INVARIANTS.md).
 * Kjøres etter hver kommando (applyCommand avviser endringer som bryter dem) og i egenskapsbaserte tester.
 * Invarianter som handler om forholdet mellom to tilstander (f.eks. INV-07 «ingenting overskrives»)
 * kontrolleres i testene med før/etter-sammenligning.
 */
import { isValidOrderKey } from "./order-key";
import { PRIMARY_LANGUAGE, type ProjectState } from "./model";

export interface Violation {
  readonly invariant: string;
  readonly message: string;
}

export function checkInvariants(s: ProjectState): Violation[] {
  const v: Violation[] = [];
  const add = (invariant: string, message: string) => v.push({ invariant, message });

  const mains = Object.values(s.productions).filter((p) => p.kind === "main");
  if (mains.length > 1) add("MODEL", "Mer enn én hovedproduksjon");

  for (const p of Object.values(s.productions)) {
    if (p.parentProductionId !== null && !s.productions[p.parentProductionId]) {
      add("MODEL", `Produksjon ${p.id} viser til ukjent overordnet produksjon`);
    }
  }

  for (const sc of Object.values(s.scenes)) {
    if (!s.productions[sc.originProductionId])
      add("MODEL", `Scene ${sc.id}: ukjent opprinnelsesproduksjon`);
    if (
      sc.storyTime.kind !== "linear" &&
      sc.storyTime.anchorSceneId !== null &&
      !s.scenes[sc.storyTime.anchorSceneId]
    ) {
      add("INV-09", `Scene ${sc.id}: fortellingstid ankret til ukjent scene`);
    }
    if (
      sc.mergedIntoSceneId !== null &&
      Object.values(s.occurrences).some((o) => o.sceneId === sc.id && o.active)
    ) {
      add("INV-01", `Scene ${sc.id} er slått sammen, men har fortsatt aktiv forekomst`);
    }
    if (sc.mergedIntoSceneId !== null && !s.scenes[sc.mergedIntoSceneId])
      add("MODEL", `Scene ${sc.id}: ukjent sammenslåingsmål`);
  }

  for (const va of Object.values(s.variants)) {
    if (!s.scenes[va.sceneId]) add("MODEL", `Variant ${va.id}: ukjent scene`);
    if (va.ownerProductionId !== null && !s.productions[va.ownerProductionId])
      add("INV-04", `Variant ${va.id}: ukjent eierproduksjon`);
  }

  // Blokker og revisjonshistorikk (DEC-0020 pkt. 5)
  const revsByBlock = new Map<string, { rev: number; text: string }[]>();
  for (const r of s.blockRevisions) {
    const list = revsByBlock.get(r.blockId) ?? [];
    list.push({ rev: r.rev, text: r.text });
    revsByBlock.set(r.blockId, list);
  }
  const blockKeys = new Set<string>();
  for (const b of Object.values(s.blocks)) {
    const k = `${b.variantId}|${b.orderKey}`;
    if (blockKeys.has(k)) add("MODEL", `Blokk ${b.id}: to blokker har samme plass i varianten`);
    blockKeys.add(k);
    if (!s.variants[b.variantId]) add("MODEL", `Blokk ${b.id}: ukjent variant`);
    if (b.language !== PRIMARY_LANGUAGE)
      add("INV-05", `Blokk ${b.id}: hovedmanusblokk er ikke norsk`);
    if (!isValidOrderKey(b.orderKey)) add("MODEL", `Blokk ${b.id}: ugyldig sorteringsnøkkel`);
    const revs = (revsByBlock.get(b.id) ?? []).sort((a, c) => a.rev - c.rev);
    const last = revs[revs.length - 1];
    if (!last || last.rev !== b.currentRev || last.text !== b.text) {
      add("INV-13", `Blokk ${b.id}: gjeldende tekst stemmer ikke med revisjonshistorikken`);
    }
    revs.forEach((r, i) => {
      if (r.rev !== i + 1) add("INV-13", `Blokk ${b.id}: hull i revisjonshistorikken`);
    });
  }

  // Sceneforekomster: én liste per produksjon er kilden til BÅDE manus- og filmrekkefølge (INV-01)
  const keysByProduction = new Map<string, Set<string>>();
  for (const o of Object.values(s.occurrences)) {
    const prod = s.productions[o.productionId];
    const scene = s.scenes[o.sceneId];
    const variant = s.variants[o.variantId];
    if (!prod) add("MODEL", `Forekomst ${o.id}: ukjent produksjon`);
    if (!scene) add("INV-03", `Forekomst ${o.id}: ukjent scene`);
    if (!variant) add("MODEL", `Forekomst ${o.id}: ukjent variant`);
    if (variant && variant.sceneId !== o.sceneId)
      add("INV-03", `Forekomst ${o.id}: variant tilhører en annen scene`);
    if (
      variant &&
      variant.ownerProductionId !== null &&
      variant.ownerProductionId !== o.productionId
    ) {
      add("INV-04", `Forekomst ${o.id}: bruker en variant som eies av en annen produksjon`);
    }
    if (!isValidOrderKey(o.orderKey)) add("INV-01", `Forekomst ${o.id}: ugyldig sorteringsnøkkel`);
    const keys = keysByProduction.get(o.productionId) ?? new Set<string>();
    if (keys.has(o.orderKey))
      add("INV-01", `Produksjon ${o.productionId}: to forekomster har samme plass`);
    keys.add(o.orderKey);
    keysByProduction.set(o.productionId, keys);
    if (o.excerpt && (o.excerpt.inFrame < 0 || o.excerpt.outFrame <= o.excerpt.inFrame)) {
      add("MODEL", `Forekomst ${o.id}: ugyldig tidsutdrag`);
    }
    if (o.activeTakeId !== null) {
      const t = s.takes[o.activeTakeId];
      const tOcc = t ? s.occurrences[t.occurrenceId] : undefined;
      if (!t || !tOcc) add("INV-07", `Forekomst ${o.id}: aktiv versjon finnes ikke`);
      else if (tOcc.sceneId !== o.sceneId)
        add("INV-07", `Forekomst ${o.id}: aktiv versjon tilhører en annen scene`);
    }
  }

  for (const seg of Object.values(s.segments)) {
    if (!s.occurrences[seg.occurrenceId]) add("INV-10", `Segment ${seg.id}: ukjent forekomst`);
    for (const bid of [seg.startBlockId, seg.endBlockId]) {
      if (bid !== null && !s.blocks[bid]) add("INV-10", `Segment ${seg.id}: ukjent blokk`);
    }
  }

  for (const t of Object.values(s.takes)) {
    if (!s.occurrences[t.occurrenceId]) add("INV-07", `Take ${t.id}: ukjent forekomst`);
    if (t.segmentId !== null) {
      const seg = s.segments[t.segmentId];
      if (!seg || seg.occurrenceId !== t.occurrenceId)
        add("INV-10", `Take ${t.id}: segment tilhører en annen forekomst`);
    }
    if (
      t.durationFrames !== null &&
      (!Number.isInteger(t.durationFrames) || t.durationFrames < 0)
    ) {
      add("MODEL", `Take ${t.id}: ugyldig varighet`);
    }
  }

  // Ressursbiblioteket (REQ-0125, REQ-0136, REQ-0146)
  for (const a of Object.values(s.assets)) {
    if (!a.name.trim()) add("MODEL", `Ressurs ${a.id}: mangler navn`);
  }
  const versionNumbers = new Set<string>();
  for (const ver of Object.values(s.assetVersions)) {
    if (!s.assetVariants[ver.variantId]) add("MODEL", `Ressursversjon ${ver.id}: ukjent variant`);
    const k = `${ver.variantId}|${ver.number}`;
    if (versionNumbers.has(k)) add("MODEL", `Ressursversjon ${ver.id}: samme nummer to ganger`);
    versionNumbers.add(k);
  }
  for (const va of Object.values(s.assetVariants)) {
    if (!s.assets[va.assetId]) add("MODEL", `Ressursvariant ${va.id}: ukjent ressurs`);
    if (va.approvedVersionId !== null) {
      const ver = s.assetVersions[va.approvedVersionId];
      if (!ver || ver.variantId !== va.id)
        add("REQ-0136", `Ressursvariant ${va.id}: godkjent versjon tilhører ikke varianten`);
    }
  }

  // Notater (DEC-0031): festet til en blokk som finnes, eller til en scenevariant som finnes
  for (const n of Object.values(s.annotations)) {
    if ((n.blockId === null) === (n.variantId === null))
      add("MODEL", `Notat ${n.id}: må høre til enten tekst eller scene`);
    if (n.blockId !== null && !s.blocks[n.blockId]) add("MODEL", `Notat ${n.id}: ukjent blokk`);
    if (n.variantId !== null && !s.variants[n.variantId])
      add("MODEL", `Notat ${n.id}: ukjent scene`);
  }

  return v;
}
