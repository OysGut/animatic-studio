/**
 * Det globale ressursbiblioteket (GP2, Fase 3, spes. §2–16, G1–G10). Ren logikk: typer, søk og filter,
 * kobling mellom global ressurs og prosjektressurs, planen for «Bruk i prosjekt» og varselet «Ny versjon
 * finnes». Ingenting tas inn automatisk (§9): en ny global versjon endrer aldri prosjektet før brukeren velger
 * det, og da legges den til som ny prosjektversjon uten å bli godkjent.
 *
 * Global ressurs, prosjektressurs og sceneforekomst er tre ulike objekter (§4). Prosjektressursen husker
 * koblingen (Asset.globalAssetId, AssetVersion.globalSource); filene er prosjektets egne kopier (§16).
 */
import { L, localized, collation } from "../i18n";
import type { Asset, AssetKind, AssetVersion, ProjectState, VisualStyle } from "../model";
import type { AssetId, AssetVariantId, AssetVersionId } from "../ids";
import type { AssetMedia, Command } from "../commands/types";
import type { TemplateDefinition } from "../typography/template";

/** Typer i det globale biblioteket (§3). Utvidbart uten nytt bibliotek (§3.7). */
export const GLOBAL_KINDS = [
  "logo",
  "character",
  "team_figure",
  "object",
  "environment",
  "sound",
  "template",
  "other",
] as const;
export type GlobalKind = (typeof GLOBAL_KINDS)[number];

export const GLOBAL_KIND_LABEL: Record<GlobalKind, string> = localized({
  logo: ["Logo og merkevare", "Logo and brand"],
  character: ["Karakter", "Character"],
  team_figure: ["Teamfigur", "Team figure"],
  object: ["Objekt / rekvisitt", "Object / prop"],
  environment: ["Miljø / bakgrunn", "Environment / background"],
  sound: ["Lyd", "Sound"],
  template: ["Grafisk mal", "Graphic template"],
  other: ["Annet", "Other"],
});

export function isGlobalKind(v: unknown): v is GlobalKind {
  return typeof v === "string" && (GLOBAL_KINDS as readonly string[]).includes(v);
}

/** Typen prosjektressursen får når den hentes inn. */
export function projectKindOf(kind: GlobalKind): AssetKind {
  switch (kind) {
    case "character":
    case "team_figure":
      return "character";
    case "object":
      return "object";
    case "environment":
      return "environment";
    case "sound":
      return "sound";
    case "template":
      return "template";
    default:
      return "other";
  }
}

/** Typen en prosjektressurs får i det globale biblioteket («Lagre i globalt bibliotek»). */
export function globalKindOf(kind: AssetKind): GlobalKind {
  switch (kind) {
    case "character":
      return "character";
    case "object":
      return "object";
    case "location":
    case "environment":
      return "environment";
    case "sound":
      return "sound";
    case "template":
      return "template";
    default:
      return "other";
  }
}

export interface GlobalVersion {
  readonly id: string;
  readonly variantId: string;
  readonly assetId: string;
  readonly number: number;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number;
  readonly sha256: string;
  readonly durationMs: number | null;
  readonly note: string;
  readonly createdAt: string;
  readonly template?: TemplateDefinition | null;
}

export interface GlobalVariant {
  readonly id: string;
  readonly assetId: string;
  readonly name: string;
  readonly style: VisualStyle;
  readonly appearance: string;
  readonly archived: boolean;
}

export interface GlobalAsset {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: GlobalKind;
  readonly name: string;
  readonly description: string;
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly archived: boolean;
  readonly revision: number;
}

/** Det som vises om én global ressurs: ressursen, variantene og versjonene (nyeste først per variant). */
export interface GlobalAssetBundle {
  readonly asset: GlobalAsset;
  readonly variants: readonly GlobalVariant[];
  readonly versions: readonly GlobalVersion[];
}

export interface GlobalFilter {
  readonly query: string;
  readonly kind: GlobalKind | "all";
  readonly category: string | null;
  readonly tag: string | null;
  readonly includeArchived: boolean;
}

export const EMPTY_GLOBAL_FILTER: GlobalFilter = {
  query: "",
  kind: "all",
  category: null,
  tag: null,
  includeArchived: false,
};

function fold(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(collation());
}

/**
 * Søk og filter (§11, G6): navn, beskrivelse, kategorier og merker (uten å kjenne filnavn), alle ordene må
 * treffe. Sortert etter navn; arkiverte bare når det er valgt.
 */
export function filterGlobalAssets(
  list: readonly GlobalAsset[],
  f: GlobalFilter,
): GlobalAsset[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  return list
    .filter((a) => f.includeArchived || !a.archived)
    .filter((a) => f.kind === "all" || a.kind === f.kind)
    .filter((a) => !f.category || a.categories.includes(f.category))
    .filter((a) => !f.tag || a.tags.includes(f.tag))
    .filter((a) => {
      if (!words.length) return true;
      const hay = fold(
        [a.name, a.description, GLOBAL_KIND_LABEL[a.kind], ...a.categories, ...a.tags].join(" "),
      );
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.name.localeCompare(b.name, collation()));
}

/** Alle kategorier og merker i biblioteket (for filtrene), sortert. */
export function globalFacets(list: readonly GlobalAsset[]): {
  readonly categories: string[];
  readonly tags: string[];
} {
  const c = new Set<string>();
  const t = new Set<string>();
  for (const a of list) {
    a.categories.forEach((x) => c.add(x));
    a.tags.forEach((x) => t.add(x));
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, collation()));
  return { categories: sort(c), tags: sort(t) };
}

/** Rydder en liste med kategorier eller merker: trimmet, unik, høyst 30 med høyst 60 tegn. */
export function cleanLabels(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const x of list) {
    const v = x.trim().slice(0, 60);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 30);
}

/** Nyeste versjon per global variant. */
export function latestGlobalVersions(
  versions: readonly GlobalVersion[],
): ReadonlyMap<string, GlobalVersion> {
  const m = new Map<string, GlobalVersion>();
  for (const v of versions) {
    const cur = m.get(v.variantId);
    if (!cur || v.number > cur.number) m.set(v.variantId, v);
  }
  return m;
}

// ---------- Koblingen i prosjektet ----------

/** Prosjektressursen som er hentet fra den globale ressursen (ikke slettet), eller null (§7: én per prosjekt). */
export function linkedProjectAsset(s: ProjectState, globalAssetId: string): Asset | null {
  return (
    Object.values(s.assets).find((a) => !a.removed && a.globalAssetId === globalAssetId) ?? null
  );
}

/** Prosjektversjonen som er kopiert fra den globale versjonen (ikke slettet), eller null. */
export function linkedProjectVersion(s: ProjectState, globalVersionId: string): AssetVersion | null {
  return (
    Object.values(s.assetVersions).find(
      (v) => !v.removed && v.globalSource?.versionId === globalVersionId,
    ) ?? null
  );
}

/** Prosjektvarianten som hører til den globale varianten (via versjonene som er kopiert), eller null. */
export function linkedProjectVariant(
  s: ProjectState,
  projectAssetId: string,
  globalVariantId: string,
): AssetVariantId | null {
  for (const v of Object.values(s.assetVersions)) {
    if (v.globalSource?.variantId !== globalVariantId) continue;
    const va = s.assetVariants[v.variantId];
    if (va && va.assetId === projectAssetId) return va.id;
  }
  return null;
}

/** Én global versjon som skal inn i prosjektet, med ID-ene den får og filen som er kopiert (på serveren). */
export interface UseGlobalItem {
  readonly version: GlobalVersion;
  readonly variant: GlobalVariant;
  /** Prosjektversjonens ID (filen ligger allerede på stien i `media`). */
  readonly versionId: AssetVersionId;
  readonly media: AssetMedia;
}

/** ID-ene planen bruker for det som må opprettes (fra kalleren, så planen er ren og kan testes). */
export interface UseGlobalIds {
  readonly assetId: AssetId;
  /** Ny prosjektvariant per global variant (brukes bare når varianten ikke finnes i prosjektet ennå). */
  readonly variantIds: Readonly<Record<string, AssetVariantId>>;
}

export interface UseGlobalPlan {
  /** Prosjektressursen (eksisterende eller ny). */
  readonly assetId: AssetId;
  /** Gjenbrukt ressurs (§7): ingen ny ressurs ble laget. */
  readonly reusedAsset: boolean;
  /** Versjonene som allerede fantes i prosjektet (gjenbrukes, ingen ny kopi). */
  readonly reusedVersions: readonly AssetVersionId[];
  readonly commands: readonly Command[];
}

/**
 * «Bruk i prosjekt» (§5, §7, G3/G4): finnes ressursen i prosjektet fra før, gjenbrukes den; finnes
 * versjonen, gjenbrukes den. Ellers lages ressurs, variant og versjon med koblingen. En ny variant får den
 * første versjonen godkjent (som ved vanlig opplasting); en variant som finnes, endrer aldri godkjent versjon
 * (§9 – brukeren velger selv om den nye versjonen skal brukes).
 */
export function planUseGlobal(
  s: ProjectState,
  asset: GlobalAsset,
  items: readonly UseGlobalItem[],
  ids: UseGlobalIds,
): UseGlobalPlan {
  const existing = linkedProjectAsset(s, asset.id);
  const assetId = (existing?.id ?? ids.assetId) as AssetId;
  const commands: Command[] = [];
  if (!existing)
    commands.push({
      type: "CreateAssets",
      assets: [
        {
          assetId,
          globalAssetId: asset.id,
          fields: {
            kind: projectKindOf(asset.kind),
            name: asset.name,
            names: [],
            description: asset.description,
            category: asset.categories[0] ?? "",
            tags: [...asset.tags],
          },
        },
      ],
    });
  const reusedVersions: AssetVersionId[] = [];
  const createdVariants = new Map<string, AssetVariantId>();
  for (const it of items) {
    const have = linkedProjectVersion(s, it.version.id);
    if (have && s.assetVariants[have.variantId]?.assetId === assetId) {
      reusedVersions.push(have.id);
      continue;
    }
    let variantId =
      createdVariants.get(it.variant.id) ??
      (existing ? linkedProjectVariant(s, assetId, it.variant.id) : null);
    let fresh = false;
    if (!variantId) {
      const nv = ids.variantIds[it.variant.id];
      if (!nv)
        throw new Error(L("Mangler ID for ny variant", "Missing ID for new variant"));
      variantId = nv;
      createdVariants.set(it.variant.id, nv);
      fresh = true;
      commands.push({
        type: "CreateAssetVariant",
        variantId: nv,
        assetId,
        fields: {
          name: it.variant.name,
          style: it.variant.style,
          appearance: it.variant.appearance,
        },
      });
    }
    commands.push({
      type: "AddAssetVersion",
      versionId: it.versionId,
      variantId,
      media: it.media,
      note: L(
        `Fra det globale biblioteket (v${it.version.number})`,
        `From the global library (v${it.version.number})`,
      ),
      globalSource: { assetId: asset.id, variantId: it.variant.id, versionId: it.version.id },
      ...(it.version.template ? { template: it.version.template } : {}),
    });
    if (fresh)
      commands.push({ type: "ApproveAssetVersion", variantId, versionId: it.versionId });
  }
  return { assetId, reusedAsset: !!existing, reusedVersions, commands };
}

/** En nyere global versjon for en variant prosjektet bruker (§9, G8/G9). */
export interface GlobalUpdate {
  readonly projectAssetId: string;
  readonly globalAssetId: string;
  readonly globalVariantId: string;
  /** Nyeste globale versjon prosjektet har kopiert. */
  readonly usedNumber: number;
  readonly newer: GlobalVersion;
}

/**
 * «Ny versjon finnes – oppdater?» (§9): for hver global variant prosjektet har kopiert fra, den nyeste globale
 * versjonen hvis den er nyere enn den nyeste prosjektet har. Endrer ingenting.
 */
export function globalUpdates(
  s: ProjectState,
  bundles: readonly GlobalAssetBundle[],
): GlobalUpdate[] {
  const out: GlobalUpdate[] = [];
  for (const b of bundles) {
    const project = linkedProjectAsset(s, b.asset.id);
    if (!project) continue;
    const byId = new Map(b.versions.map((v) => [v.id, v]));
    const usedByVariant = new Map<string, number>();
    for (const v of Object.values(s.assetVersions)) {
      if (v.removed || !v.globalSource || v.globalSource.assetId !== b.asset.id) continue;
      if (s.assetVariants[v.variantId]?.assetId !== project.id) continue;
      const g = byId.get(v.globalSource.versionId);
      const n = g?.number ?? 0;
      const k = v.globalSource.variantId;
      usedByVariant.set(k, Math.max(usedByVariant.get(k) ?? 0, n));
    }
    const latest = latestGlobalVersions(b.versions);
    for (const [variantId, used] of usedByVariant) {
      const l = latest.get(variantId);
      if (l && l.number > used)
        out.push({
          projectAssetId: project.id,
          globalAssetId: b.asset.id,
          globalVariantId: variantId,
          usedNumber: used,
          newer: l,
        });
    }
  }
  return out;
}

/** Lagringssti for en global fil: `global/<gruppe>/<ressurs>/<sha256>.<ext>` (samme fil lagres én gang). */
export function globalFilePath(
  workspaceId: string,
  globalAssetId: string,
  sha256: string,
  ext: string,
): string {
  const e = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "bin";
  return `global/${workspaceId}/${globalAssetId}/${sha256}.${e}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Sant når stien hører til gruppen (og ressursen, om den er gitt). */
export function isGlobalPathOf(path: string, workspaceId: string, globalAssetId?: string): boolean {
  const m = new RegExp(`^global/(${UUID})/(${UUID})/[0-9a-f]{64}\\.[a-z0-9]{1,8}$`, "i").exec(path);
  return (
    !!m &&
    m[1]!.toLowerCase() === workspaceId.toLowerCase() &&
    (globalAssetId === undefined || m[2]!.toLowerCase() === globalAssetId.toLowerCase())
  );
}

/** Filendelsen fra en lagringssti eller et filnavn. */
export function extensionOf(path: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(path);
  return m ? m[1]!.toLowerCase() : "bin";
}
