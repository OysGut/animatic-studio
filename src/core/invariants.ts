/**
 * Strukturelle invariantkontroller (docs/architecture/INVARIANTS.md).
 * Kjøres etter hver kommando (applyCommand avviser endringer som bryter dem) og i egenskapsbaserte tester.
 * Invarianter som handler om forholdet mellom to tilstander (f.eks. INV-07 «ingenting overskrives»)
 * kontrolleres i testene med før/etter-sammenligning.
 */
import { isValidOrderKey } from "./order-key";
import type { ProjectState } from "./model";
import { languageTagError } from "./dialogue/languages";

import { t as tk } from "@/core/i18n/keyed";

export interface Violation {
  readonly invariant: string;
  readonly message: string;
}

export function checkInvariants(s: ProjectState): Violation[] {
  const v: Violation[] = [];
  const add = (invariant: string, message: string) => v.push({ invariant, message });

  const mains = Object.values(s.productions).filter((p) => p.kind === "main");
  if (mains.length > 1)
    add("MODEL", tk("core-invariants.check-invariants.add.d429b92fced7"));

  for (const p of Object.values(s.productions)) {
    if (p.parentProductionId !== null && !s.productions[p.parentProductionId]) {
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.4cb2248bdbd8", { id: String(p.id) }),
      );
    }
  }

  for (const sc of Object.values(s.scenes)) {
    if (!s.productions[sc.originProductionId])
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.fd093ffdcd50", { id: String(sc.id) }),
      );
    if (
      sc.storyTime.kind !== "linear" &&
      sc.storyTime.anchorSceneId !== null &&
      !s.scenes[sc.storyTime.anchorSceneId]
    ) {
      add(
        "INV-09",
        tk("core-invariants.check-invariants.add.dc0ed9cf6c06", { id: String(sc.id) }),
      );
    }
    if (
      sc.mergedIntoSceneId !== null &&
      Object.values(s.occurrences).some((o) => o.sceneId === sc.id && o.active)
    ) {
      add(
        "INV-01",
        tk("core-invariants.check-invariants.add.12870510d9e2", { id: String(sc.id) }),
      );
    }
    if (sc.mergedIntoSceneId !== null && !s.scenes[sc.mergedIntoSceneId])
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.429a4674bb2c", { id: String(sc.id) }),
      );
  }

  for (const va of Object.values(s.variants)) {
    if (!s.scenes[va.sceneId])
      add("MODEL", tk("core-invariants.check-invariants.add.b02a5155b872", { id: String(va.id) }));
    if (va.ownerProductionId !== null && !s.productions[va.ownerProductionId])
      add(
        "INV-04",
        tk("core-invariants.check-invariants.add.2e369d62896e", { id: String(va.id) }),
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
        tk("core-invariants.check-invariants.add.a52acab4439d", { id: String(b.id) }),
      );
    blockKeys.add(k);
    if (!s.variants[b.variantId])
      add("MODEL", tk("core-invariants.check-invariants.add.30dfcd9a399d", { id: String(b.id) }));
    if (languageTagError(b.language))
      add(
        "INV-05",
        tk("core-invariants.check-invariants.add.0888a95b7064", { id: String(b.id) }),
      );
    if (!isValidOrderKey(b.orderKey))
      add("MODEL", tk("core-invariants.check-invariants.add.85167cbd2543", { id: String(b.id) }));
    const revs = (revsByBlock.get(b.id) ?? []).sort((a, c) => a.rev - c.rev);
    const last = revs[revs.length - 1];
    if (!last || last.rev !== b.currentRev || last.text !== b.text) {
      add(
        "INV-13",
        tk("core-invariants.check-invariants.add.cecf273318eb", { id: String(b.id) }),
      );
    }
    // G-2: med bare gjeldende revisjon lastet kan ikke rekken sjekkes her (serveren har full historikk)
    if (s.blockHistory !== "current") revs.forEach((r, i) => {
      if (r.rev !== i + 1)
        add(
          "INV-13",
          tk("core-invariants.check-invariants.add.7eca574c1d3d", { id: String(b.id) }),
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
        tk("core-invariants.check-invariants.add.ef371818419d", { id: String(o.id) }),
      );
    if (!scene)
      add("INV-03", tk("core-invariants.check-invariants.add.6f4f64e6e124", { id: String(o.id) }));
    if (!variant)
      add("MODEL", tk("core-invariants.check-invariants.add.b18f9f469aad", { id: String(o.id) }));
    if (variant && variant.sceneId !== o.sceneId)
      add(
        "INV-03",
        tk("core-invariants.check-invariants.add.439a2a6b66db", { id: String(o.id) }),
      );
    if (
      variant &&
      variant.ownerProductionId !== null &&
      variant.ownerProductionId !== o.productionId
    ) {
      add(
        "INV-04",
        tk("core-invariants.check-invariants.add.01b659a29ffd", { id: String(o.id) }),
      );
    }
    if (!isValidOrderKey(o.orderKey))
      add(
        "INV-01",
        tk("core-invariants.check-invariants.add.2f9436d194d2", { id: String(o.id) }),
      );
    const keys = keysByProduction.get(o.productionId) ?? new Set<string>();
    if (keys.has(o.orderKey))
      add(
        "INV-01",
        tk("core-invariants.check-invariants.add.e3b6208f919d", { productionId: String(o.productionId) }),
      );
    keys.add(o.orderKey);
    keysByProduction.set(o.productionId, keys);
    if (o.excerpt && (o.excerpt.inFrame < 0 || o.excerpt.outFrame <= o.excerpt.inFrame)) {
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.acbfe4979411", { id: String(o.id) }),
      );
    }
    if (o.activeTakeId !== null) {
      const t = s.takes[o.activeTakeId];
      const tOcc = t ? s.occurrences[t.occurrenceId] : undefined;
      if (!t || !tOcc)
        add(
          "INV-07",
          tk("core-invariants.check-invariants.add.df8ddbfda832", { id: String(o.id) }),
        );
      else if (tOcc.sceneId !== o.sceneId)
        add(
          "INV-07",
          tk("core-invariants.check-invariants.add.24eb9ce72aa0", { id: String(o.id) }),
        );
    }
  }

  for (const seg of Object.values(s.segments)) {
    if (!s.occurrences[seg.occurrenceId])
      add(
        "INV-10",
        tk("core-invariants.check-invariants.add.1b66912af5b4", { id: String(seg.id) }),
      );
    for (const bid of [seg.startBlockId, seg.endBlockId]) {
      if (bid !== null && !s.blocks[bid])
        add("INV-10", tk("core-invariants.check-invariants.add.8d8f1333e788", { id: String(seg.id) }));
    }
  }

  for (const t of Object.values(s.takes)) {
    if (!s.occurrences[t.occurrenceId])
      add("INV-07", tk("core-invariants.check-invariants.add.f0be89e1352e", { id: String(t.id) }));
    if (t.segmentId !== null) {
      const seg = s.segments[t.segmentId];
      if (!seg || seg.occurrenceId !== t.occurrenceId)
        add(
          "INV-10",
          tk("core-invariants.check-invariants.add.28d657f0420c", { id: String(t.id) }),
        );
    }
    if (
      t.durationFrames !== null &&
      (!Number.isInteger(t.durationFrames) || t.durationFrames < 0)
    ) {
      add("MODEL", tk("core-invariants.check-invariants.add.817e1b911aba", { id: String(t.id) }));
    }
  }

  // Ressursbiblioteket (REQ-0125, REQ-0136, REQ-0146)
  for (const a of Object.values(s.assets)) {
    if (!a.name.trim())
      add("MODEL", tk("core-invariants.check-invariants.add.2ba194ec86af", { id: String(a.id) }));
  }
  const versionNumbers = new Set<string>();
  for (const ver of Object.values(s.assetVersions)) {
    if (!s.assetVariants[ver.variantId])
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.9bdb3dc82c68", { id: String(ver.id) }),
      );
    const k = `${ver.variantId}|${ver.number}`;
    if (versionNumbers.has(k))
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.7d80582793bb", { id: String(ver.id) }),
      );
    versionNumbers.add(k);
  }
  for (const va of Object.values(s.assetVariants)) {
    if (!s.assets[va.assetId])
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.b3269c5b49ba", { id: String(va.id) }),
      );
    if (va.approvedVersionId !== null) {
      const ver = s.assetVersions[va.approvedVersionId];
      if (!ver || ver.variantId !== va.id)
        add(
          "REQ-0136",
          tk("core-invariants.check-invariants.add.beea12e94202", { id: String(va.id) }),
        );
    }
  }

  // Notater (DEC-0031): festet til en blokk som finnes, eller til en scenevariant som finnes
  for (const n of Object.values(s.annotations)) {
    if ((n.blockId === null) === (n.variantId === null))
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.2897d5473c7a", { id: String(n.id) }),
      );
    if (n.blockId !== null && !s.blocks[n.blockId])
      add("MODEL", tk("core-invariants.check-invariants.add.66b09ad0487e", { id: String(n.id) }));
    if (n.variantId !== null && !s.variants[n.variantId])
      add("MODEL", tk("core-invariants.check-invariants.add.e8a4715e3ab0", { id: String(n.id) }));
  }
  // 2D-scener og lag (DEC-0035): koblet til scener og ressurser som finnes, unik lagrekkefølge
  const activeComp = new Set<string>();
  for (const c of Object.values(s.compositions)) {
    if (!s.variants[c.variantId])
      add("MODEL", tk("core-invariants.check-invariants.add.833bcd3d38b1", { id: String(c.id) }));
    if (c.removed) continue;
    if (activeComp.has(c.variantId))
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.928967dd5624", { id: String(c.id) }),
      );
    activeComp.add(c.variantId);
  }
  const keysByComp = new Map<string, Set<string>>();
  for (const l of Object.values(s.layers)) {
    if (!s.compositions[l.compositionId])
      add("MODEL", tk("core-invariants.check-invariants.add.f19494b0ca56", { id: String(l.id) }));
    if (l.assetId !== null && !s.assets[l.assetId])
      add("MODEL", tk("core-invariants.check-invariants.add.b6f6c892834e", { id: String(l.id) }));
    if (l.assetVariantId !== null) {
      const va = s.assetVariants[l.assetVariantId];
      if (!va || va.assetId !== l.assetId)
        add("MODEL", tk("core-invariants.check-invariants.add.585161a32e73", { id: String(l.id) }));
    }
    if (l.versionId !== null) {
      const ve = s.assetVersions[l.versionId];
      if (!ve || ve.variantId !== l.assetVariantId)
        add("MODEL", tk("core-invariants.check-invariants.add.2ae8b7cf2fce", { id: String(l.id) }));
    }
    if (l.kind !== "group" && l.kind !== "page" && l.assetId === null && l.fill === null && !(l.kind === "text" && l.text))
      add("MODEL", tk("core-invariants.check-invariants.add.42e8c587a46e", { id: String(l.id) }));
    let keys = keysByComp.get(l.compositionId);
    if (!keys) keysByComp.set(l.compositionId, (keys = new Set()));
    if (keys.has(l.orderKey))
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.47b407941cad", { id: String(l.id) }),
      );
    keys.add(l.orderKey);
  }

  // Egne genereringsbeskrivelser (DEC-0053): hører til et segment i samme scene; høyst én aktiv per segment
  const promptSegments = new Set<string>();
  for (const g of Object.values(s.generationPrompts ?? {})) {
    const seg = s.segments[g.segmentId];
    if (!s.occurrences[g.occurrenceId])
      add("MODEL", tk("core-invariants.check-invariants.add.f4224ff9c297", { id: String(g.id) }));
    if (!seg || seg.occurrenceId !== g.occurrenceId)
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.521eab8a398e", { id: String(g.id) }),
      );
    if (g.removed) continue;
    if (promptSegments.has(g.segmentId))
      add(
        "MODEL",
        tk("core-invariants.check-invariants.add.715e9f383081", { segmentId: String(g.segmentId) }),
      );
    promptSegments.add(g.segmentId);
  }

  return v;
}
