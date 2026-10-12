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

export const SOUND_LINK_LABEL: Record<SoundLinkKind, string> = {
  asset: "Karakter/ressurs",
  block: "Replikk/linje",
  scene: "Scene",
  segment: "Delsekvens",
  event: "Hendelse",
  production: "Produksjon",
};

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
      return s.assets[l.id]?.name ?? "(ressursen finnes ikke lenger)";
    case "block": {
      const b = s.blocks[l.id];
      if (!b) return "(linjen finnes ikke lenger)";
      const v = s.variants[b.variantId];
      const t = b.text.replace(/\s+/g, " ").trim();
      return `${v ? `${sceneText(s, v.sceneId)}: ` : ""}«${t.length > 60 ? `${t.slice(0, 57)}…` : t}»`;
    }
    case "scene":
      return s.scenes[l.id] ? sceneText(s, l.id) : "(scenen finnes ikke lenger)";
    case "segment": {
      const g = s.segments[l.id];
      if (!g) return "(delsekvensen finnes ikke lenger)";
      const o = s.occurrences[g.occurrenceId];
      const all = Object.values(s.segments)
        .filter((x) => x.occurrenceId === g.occurrenceId && x.reason === g.reason)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
      return `${o ? sceneText(s, o.sceneId) : "Scene"}, delsekvens ${all.indexOf(g) + 1}`;
    }
    case "event": {
      const e = s.continuityEvents[l.id];
      if (!e) return "(hendelsen finnes ikke lenger)";
      return `${s.assets[e.assetId]?.name ?? ""}: ${e.description || "hendelse"} (${sceneText(s, e.sceneId)})`;
    }
    case "production":
      return s.productions[l.id]?.name ?? "(produksjonen finnes ikke lenger)";
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
        .filter((a) => a.kind === "sound" && !a.archived && a.category.trim())
        .map((a) => a.category.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b, "nb"));
}
