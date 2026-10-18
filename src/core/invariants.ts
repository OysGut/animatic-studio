/**
 * Strukturelle invariantkontroller (docs/architecture/INVARIANTS.md).
 * Kjøres etter hver kommando (applyCommand avviser endringer som bryter dem) og i egenskapsbaserte tester.
 * Invarianter som handler om forholdet mellom to tilstander (f.eks. INV-07 «ingenting overskrives»)
 * kontrolleres i testene med før/etter-sammenligning.
 */
import { isValidOrderKey } from "./order-key";
import { PRIMARY_LANGUAGE, type ProjectState } from "./model";
import { L } from "./i18n";

export interface Violation {
  readonly invariant: string;
  readonly message: string;
}

export function checkInvariants(s: ProjectState): Violation[] {
  const v: Violation[] = [];
  const add = (invariant: string, message: string) => v.push({ invariant, message });

  const mains = Object.values(s.productions).filter((p) => p.kind === "main");
  if (mains.length > 1)
    add("MODEL", L("Mer enn én hovedproduksjon", "More than one main production"));

  for (const p of Object.values(s.productions)) {
    if (p.parentProductionId !== null && !s.productions[p.parentProductionId]) {
      add(
        "MODEL",
        L(
          `Produksjon ${p.id} viser til ukjent overordnet produksjon`,
          `Production ${p.id} refers to an unknown parent production`,
        ),
      );
    }
  }

  for (const sc of Object.values(s.scenes)) {
    if (!s.productions[sc.originProductionId])
      add(
        "MODEL",
        L(
          `Scene ${sc.id}: ukjent opprinnelsesproduksjon`,
          `Scene ${sc.id}: unknown origin production`,
        ),
      );
    if (
      sc.storyTime.kind !== "linear" &&
      sc.storyTime.anchorSceneId !== null &&
      !s.scenes[sc.storyTime.anchorSceneId]
    ) {
      add(
        "INV-09",
        L(
          `Scene ${sc.id}: fortellingstid ankret til ukjent scene`,
          `Scene ${sc.id}: story time anchored to an unknown scene`,
        ),
      );
    }
    if (
      sc.mergedIntoSceneId !== null &&
      Object.values(s.occurrences).some((o) => o.sceneId === sc.id && o.active)
    ) {
      add(
        "INV-01",
        L(
          `Scene ${sc.id} er slått sammen, men har fortsatt aktiv forekomst`,
          `Scene ${sc.id} is merged, but still has an active occurrence`,
        ),
      );
    }
    if (sc.mergedIntoSceneId !== null && !s.scenes[sc.mergedIntoSceneId])
      add(
        "MODEL",
        L(`Scene ${sc.id}: ukjent sammenslåingsmål`, `Scene ${sc.id}: unknown merge target`),
      );
  }

  for (const va of Object.values(s.variants)) {
    if (!s.scenes[va.sceneId])
      add("MODEL", L(`Variant ${va.id}: ukjent scene`, `Variant ${va.id}: unknown scene`));
    if (va.ownerProductionId !== null && !s.productions[va.ownerProductionId])
      add(
        "INV-04",
        L(`Variant ${va.id}: ukjent eierproduksjon`, `Variant ${va.id}: unknown owner production`),
      );
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
    if (blockKeys.has(k))
      add(
        "MODEL",
        L(
          `Blokk ${b.id}: to blokker har samme plass i varianten`,
          `Block ${b.id}: two blocks have the same place in the variant`,
        ),
      );
    blockKeys.add(k);
    if (!s.variants[b.variantId])
      add("MODEL", L(`Blokk ${b.id}: ukjent variant`, `Block ${b.id}: unknown variant`));
    if (b.language !== PRIMARY_LANGUAGE)
      add(
        "INV-05",
        L(
          `Blokk ${b.id}: hovedmanusblokk er ikke norsk`,
          `Block ${b.id}: main script block is not Norwegian`,
        ),
      );
    if (!isValidOrderKey(b.orderKey))
      add("MODEL", L(`Blokk ${b.id}: ugyldig sorteringsnøkkel`, `Block ${b.id}: invalid sort key`));
    const revs = (revsByBlock.get(b.id) ?? []).sort((a, c) => a.rev - c.rev);
    const last = revs[revs.length - 1];
    if (!last || last.rev !== b.currentRev || last.text !== b.text) {
      add(
        "INV-13",
        L(
          `Blokk ${b.id}: gjeldende tekst stemmer ikke med revisjonshistorikken`,
          `Block ${b.id}: current text does not match the revision history`,
        ),
      );
    }
    revs.forEach((r, i) => {
      if (r.rev !== i + 1)
        add(
          "INV-13",
          L(
            `Blokk ${b.id}: hull i revisjonshistorikken`,
            `Block ${b.id}: gap in the revision history`,
          ),
        );
    });
  }

  // Sceneforekomster: én liste per produksjon er kilden til BÅDE manus- og filmrekkefølge (INV-01)
  const keysByProduction = new Map<string, Set<string>>();
  for (const o of Object.values(s.occurrences)) {
    const prod = s.productions[o.productionId];
    const scene = s.scenes[o.sceneId];
    const variant = s.variants[o.variantId];
    if (!prod)
      add(
        "MODEL",
        L(`Forekomst ${o.id}: ukjent produksjon`, `Occurrence ${o.id}: unknown production`),
      );
    if (!scene)
      add("INV-03", L(`Forekomst ${o.id}: ukjent scene`, `Occurrence ${o.id}: unknown scene`));
    if (!variant)
      add("MODEL", L(`Forekomst ${o.id}: ukjent variant`, `Occurrence ${o.id}: unknown variant`));
    if (variant && variant.sceneId !== o.sceneId)
      add(
        "INV-03",
        L(
          `Forekomst ${o.id}: variant tilhører en annen scene`,
          `Occurrence ${o.id}: variant belongs to another scene`,
        ),
      );
    if (
      variant &&
      variant.ownerProductionId !== null &&
      variant.ownerProductionId !== o.productionId
    ) {
      add(
        "INV-04",
        L(
          `Forekomst ${o.id}: bruker en variant som eies av en annen produksjon`,
          `Occurrence ${o.id}: uses a variant owned by another production`,
        ),
      );
    }
    if (!isValidOrderKey(o.orderKey))
      add(
        "INV-01",
        L(`Forekomst ${o.id}: ugyldig sorteringsnøkkel`, `Occurrence ${o.id}: invalid sort key`),
      );
    const keys = keysByProduction.get(o.productionId) ?? new Set<string>();
    if (keys.has(o.orderKey))
      add(
        "INV-01",
        L(
          `Produksjon ${o.productionId}: to forekomster har samme plass`,
          `Production ${o.productionId}: two occurrences have the same place`,
        ),
      );
    keys.add(o.orderKey);
    keysByProduction.set(o.productionId, keys);
    if (o.excerpt && (o.excerpt.inFrame < 0 || o.excerpt.outFrame <= o.excerpt.inFrame)) {
      add(
        "MODEL",
        L(`Forekomst ${o.id}: ugyldig tidsutdrag`, `Occurrence ${o.id}: invalid time excerpt`),
      );
    }
    if (o.activeTakeId !== null) {
      const t = s.takes[o.activeTakeId];
      const tOcc = t ? s.occurrences[t.occurrenceId] : undefined;
      if (!t || !tOcc)
        add(
          "INV-07",
          L(
            `Forekomst ${o.id}: aktiv versjon finnes ikke`,
            `Occurrence ${o.id}: active version does not exist`,
          ),
        );
      else if (tOcc.sceneId !== o.sceneId)
        add(
          "INV-07",
          L(
            `Forekomst ${o.id}: aktiv versjon tilhører en annen scene`,
            `Occurrence ${o.id}: active version belongs to another scene`,
          ),
        );
    }
  }

  for (const seg of Object.values(s.segments)) {
    if (!s.occurrences[seg.occurrenceId])
      add(
        "INV-10",
        L(`Segment ${seg.id}: ukjent forekomst`, `Segment ${seg.id}: unknown occurrence`),
      );
    for (const bid of [seg.startBlockId, seg.endBlockId]) {
      if (bid !== null && !s.blocks[bid])
        add("INV-10", L(`Segment ${seg.id}: ukjent blokk`, `Segment ${seg.id}: unknown block`));
    }
  }

  for (const t of Object.values(s.takes)) {
    if (!s.occurrences[t.occurrenceId])
      add("INV-07", L(`Take ${t.id}: ukjent forekomst`, `Take ${t.id}: unknown occurrence`));
    if (t.segmentId !== null) {
      const seg = s.segments[t.segmentId];
      if (!seg || seg.occurrenceId !== t.occurrenceId)
        add(
          "INV-10",
          L(
            `Take ${t.id}: segment tilhører en annen forekomst`,
            `Take ${t.id}: segment belongs to another occurrence`,
          ),
        );
    }
    if (
      t.durationFrames !== null &&
      (!Number.isInteger(t.durationFrames) || t.durationFrames < 0)
    ) {
      add("MODEL", L(`Take ${t.id}: ugyldig varighet`, `Take ${t.id}: invalid duration`));
    }
  }

  // Ressursbiblioteket (REQ-0125, REQ-0136, REQ-0146)
  for (const a of Object.values(s.assets)) {
    if (!a.name.trim())
      add("MODEL", L(`Ressurs ${a.id}: mangler navn`, `Asset ${a.id}: missing name`));
  }
  const versionNumbers = new Set<string>();
  for (const ver of Object.values(s.assetVersions)) {
    if (!s.assetVariants[ver.variantId])
      add(
        "MODEL",
        L(`Ressursversjon ${ver.id}: ukjent variant`, `Asset version ${ver.id}: unknown variant`),
      );
    const k = `${ver.variantId}|${ver.number}`;
    if (versionNumbers.has(k))
      add(
        "MODEL",
        L(
          `Ressursversjon ${ver.id}: samme nummer to ganger`,
          `Asset version ${ver.id}: same number twice`,
        ),
      );
    versionNumbers.add(k);
  }
  for (const va of Object.values(s.assetVariants)) {
    if (!s.assets[va.assetId])
      add(
        "MODEL",
        L(`Ressursvariant ${va.id}: ukjent ressurs`, `Asset variant ${va.id}: unknown asset`),
      );
    if (va.approvedVersionId !== null) {
      const ver = s.assetVersions[va.approvedVersionId];
      if (!ver || ver.variantId !== va.id)
        add(
          "REQ-0136",
          L(
            `Ressursvariant ${va.id}: godkjent versjon tilhører ikke varianten`,
            `Asset variant ${va.id}: approved version does not belong to the variant`,
          ),
        );
    }
  }

  // Notater (DEC-0031): festet til en blokk som finnes, eller til en scenevariant som finnes
  for (const n of Object.values(s.annotations)) {
    if ((n.blockId === null) === (n.variantId === null))
      add(
        "MODEL",
        L(
          `Notat ${n.id}: må høre til enten tekst eller scene`,
          `Note ${n.id}: must belong to either a text or a scene`,
        ),
      );
    if (n.blockId !== null && !s.blocks[n.blockId])
      add("MODEL", L(`Notat ${n.id}: ukjent blokk`, `Note ${n.id}: unknown block`));
    if (n.variantId !== null && !s.variants[n.variantId])
      add("MODEL", L(`Notat ${n.id}: ukjent scene`, `Note ${n.id}: unknown scene`));
  }
  // 2D-scener og lag (DEC-0035): koblet til scener og ressurser som finnes, unik lagrekkefølge
  const activeComp = new Set<string>();
  for (const c of Object.values(s.compositions)) {
    if (!s.variants[c.variantId])
      add("MODEL", L(`2D-scene ${c.id}: ukjent scene`, `2D scene ${c.id}: unknown scene`));
    if (c.removed) continue;
    if (activeComp.has(c.variantId))
      add(
        "MODEL",
        L(
          `2D-scene ${c.id}: scenen har to 2D-scener`,
          `2D scene ${c.id}: the scene has two 2D scenes`,
        ),
      );
    activeComp.add(c.variantId);
  }
  const keysByComp = new Map<string, Set<string>>();
  for (const l of Object.values(s.layers)) {
    if (!s.compositions[l.compositionId])
      add("MODEL", L(`Lag ${l.id}: ukjent 2D-scene`, `Layer ${l.id}: unknown 2D scene`));
    if (l.assetId !== null && !s.assets[l.assetId])
      add("MODEL", L(`Lag ${l.id}: ukjent ressurs`, `Layer ${l.id}: unknown asset`));
    if (l.assetVariantId !== null) {
      const va = s.assetVariants[l.assetVariantId];
      if (!va || va.assetId !== l.assetId)
        add("MODEL", L(`Lag ${l.id}: ugyldig variant`, `Layer ${l.id}: invalid variant`));
    }
    if (l.versionId !== null) {
      const ve = s.assetVersions[l.versionId];
      if (!ve || ve.variantId !== l.assetVariantId)
        add("MODEL", L(`Lag ${l.id}: ugyldig versjon`, `Layer ${l.id}: invalid version`));
    }
    if (l.kind !== "group" && l.kind !== "page" && l.assetId === null && l.fill === null && !(l.kind === "text" && l.text))
      add("MODEL", L(`Lag ${l.id}: viser ingenting`, `Layer ${l.id}: shows nothing`));
    let keys = keysByComp.get(l.compositionId);
    if (!keys) keysByComp.set(l.compositionId, (keys = new Set()));
    if (keys.has(l.orderKey))
      add(
        "MODEL",
        L(
          `Lag ${l.id}: samme plass i lagrekkefølgen som et annet lag`,
          `Layer ${l.id}: same place in the layer order as another layer`,
        ),
      );
    keys.add(l.orderKey);
  }

  // Egne genereringsbeskrivelser (DEC-0053): hører til et segment i samme scene; høyst én aktiv per segment
  const promptSegments = new Set<string>();
  for (const g of Object.values(s.generationPrompts ?? {})) {
    const seg = s.segments[g.segmentId];
    if (!s.occurrences[g.occurrenceId])
      add("MODEL", L(`Beskrivelse ${g.id}: ukjent scene`, `Description ${g.id}: unknown scene`));
    if (!seg || seg.occurrenceId !== g.occurrenceId)
      add(
        "MODEL",
        L(
          `Beskrivelse ${g.id}: segmentet hører ikke til scenen`,
          `Description ${g.id}: the segment does not belong to the scene`,
        ),
      );
    if (g.removed) continue;
    if (promptSegments.has(g.segmentId))
      add(
        "MODEL",
        L(
          `Segment ${g.segmentId}: to egne beskrivelser`,
          `Segment ${g.segmentId}: two own descriptions`,
        ),
      );
    promptSegments.add(g.segmentId);
  }

  return v;
}
