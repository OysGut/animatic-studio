/**
 * Koblinger for lyd (mandat 13.2, REQ-0204, REQ-0205, DEC-0070): en lydressurs kan høre til karakterer og
 * andre ressurser, replikker, scener, delsekvenser (segmenter), hendelser og produksjoner – med permanente
 * ID-er, så koblingene overlever omnummerering og flytting. Brukes til visning, søk og filter.
 */
import { mainProduction } from "../model";
import type { Asset, ProjectState, SoundLink, SoundLinkKind } from "../model";
import { formatHeading } from "../screenplay/paginate";
import { orderedOccurrences } from "../views";
import { compareKeys } from "../order-key";
import { collation } from "../i18n";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

export const SOUND_LINK_LABEL: Record<SoundLinkKind, string> = tLocalized({ asset: "core-library-sound-links.sound-link-label.asset.71095537b1b0", block: "core-library-sound-links.sound-link-label.block.bbb3fba8a588", scene: "core-library-sound-links.sound-link-label.scene.8ba2bd5a583f", segment: "core-library-sound-links.sound-link-label.segment.45583eb9e990", event: "core-library-sound-links.sound-link-label.event.2ae368e6ce0f", production: "core-library-sound-links.sound-link-label.production.7b13f8c0a771" });

/** Sceneoverskrift med nummer i hovedfilmen (eller første produksjon den er med i). */
function sceneText(s: ProjectState, sceneId: string): string {
  const prods = [mainProduction(s), ...Object.values(s.productions)].filter(Boolean);
  for (const p of prods) {
    const o = orderedOccurrences(s, p!.id).find((x) => x.sceneId === sceneId);
    if (o) {
      const v = s.variants[o.variantId];
      return `${o.productionNumber ? `${o.productionNumber} ` : ""}${v ? formatHeading(v.heading) : ""}`.trim();
    }
  }
  const v = Object.values(s.variants).find((x) => x.sceneId === sceneId);
  return v ? formatHeading(v.heading) : "Scene";
}

/** Kort tekst for en kobling (eller «finnes ikke lenger»). */
export function soundLinkLabel(s: ProjectState, l: SoundLink): string {
  switch (l.kind) {
    case "asset":
      return (
        s.assets[l.id]?.name ?? tk("core-library-sound-links.sound-link-label.message.e4c4a3c78660")
      );
    case "block": {
      const b = s.blocks[l.id];
      if (!b) return tk("core-library-sound-links.sound-link-label.message.9750df82af8b");
      const v = s.variants[b.variantId];
      const t = b.text.replace(/\s+/g, " ").trim();
      const text = t.length > 60 ? `${t.slice(0, 57)}…` : t;
      const prefix = v ? `${sceneText(s, v.sceneId)}: ` : "";
      return tk("core-library-sound-links.sound-link-label.message.24b3dcf674f5", { prefix: String(prefix), text: String(text) });
    }
    case "scene":
      return s.scenes[l.id]
        ? sceneText(s, l.id)
        : tk("core-library-sound-links.sound-link-label.message.bc284dab530c");
    case "segment": {
      const g = s.segments[l.id];
      if (!g) return tk("core-library-sound-links.sound-link-label.message.78166a4664d6");
      const o = s.occurrences[g.occurrenceId];
      const all = Object.values(s.segments)
        .filter((x) => x.occurrenceId === g.occurrenceId && x.reason === g.reason)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      return `${o ? sceneText(s, o.sceneId) : "Scene"}${tk("core-library-sound-links.sound-link-label.message.3b8ced4b0336")}${all.indexOf(g) + 1}`;
    }
    case "event": {
      const e = s.continuityEvents[l.id];
      if (!e) return tk("core-library-sound-links.sound-link-label.message.1d02f88f4756");
      const what = e.description || tk("core-library-sound-links.what.message.008647f465db");
      return `${s.assets[e.assetId]?.name ?? ""}: ${what} (${sceneText(s, e.sceneId)})`;
    }
    case "production":
      return (
        s.productions[l.id]?.name ??
        tk("core-library-sound-links.sound-link-label.message.062a90d3d7f1")
      );
  }
}

/** All tekst et søk i biblioteket skal treffe for ressursen (navn, kategori, stikkord, koblinger for lyd). */
export function assetSearchText(s: ProjectState, a: Asset): string[] {
  const names = [a.name, ...a.names.map((n) => n.name)];
  const links = (a.soundLinks ?? []).map((l) => soundLinkLabel(s, l));
  return [...names, a.category, ...a.tags, a.description, ...links];
}

/** Lydressursene som er koblet til et objekt (en karakter, scene, replikk …). */
export function soundsLinkedTo(s: ProjectState, id: string): Asset[] {
  return Object.values(s.assets).filter(
    (a) => a.kind === "sound" && (a.soundLinks ?? []).some((l) => l.id === id),
  );
}

/** Kategoriene lydressursene bruker (for filteret «Kategori»). */
export function soundCategories(s: ProjectState): string[] {
  return [
    ...new Set(
      Object.values(s.assets)
        .filter((a) => a.kind === "sound" && !a.archived && !a.removed && a.category.trim())
        .map((a) => a.category.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b, collation()));
}
