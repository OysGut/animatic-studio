/**
 * Domenemodell (docs/architecture/DOMAIN_MODEL.md, DATA_RELATIONSHIPS.md).
 * Tilstanden speiler databasetabellene. Alle entiteter har permanent `id` og `revision`
 * (samtidighetskontroll, INV-C1). Ingen entitet har scenenummer som nøkkel (INV-02).
 */
import type {
  AnnotationId,
  AssetId,
  CompositionId,
  LayerId,
  AssetVariantId,
  AssetVersionId,
  BlockId,
  OccurrenceId,
  ProductionId,
  ProjectId,
  SceneId,
  SegmentId,
  TakeId,
  UserId,
  VariantId,
} from "./ids";
import type { Rational } from "./time";

export const PRIMARY_LANGUAGE = "nb" as const; // INV-05

export type ProductionKind =
  "main" | "spinoff" | "short" | "trailer" | "teaser" | "pitch" | "pilot" | "alternative" | "other";

export type StoryKind = "linear" | "flashback" | "flashforward" | "dream" | "jump";

export type BlockKind =
  | "heading"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "shot"
  | "note";

export type SegmentReason =
  "narrative_subsequence" | "continuity_change" | "model_limit" | "manual";

export type TakeKind = "composition2d" | "ai_video" | "imported_film" | "still" | "audio_only";
export type TakeStatus = "reference" | "in_progress" | "approved";

export interface Entity<I> {
  readonly id: I;
  readonly revision: number;
}

export interface Project extends Entity<ProjectId> {
  readonly name: string;
  /** Bildefrekvens for hele prosjektet (DEC-0039). */
  readonly fps: Rational;
  /** Bildeformat for hele prosjektet i piksler (DEC-0039); alle 2D-scener følger det. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly primaryLanguage: typeof PRIMARY_LANGUAGE;
}

export interface Production extends Entity<ProductionId> {
  readonly kind: ProductionKind;
  readonly name: string;
  readonly parentProductionId: ProductionId | null;
  readonly fps: Rational;
}

/** Fortellingstid (DEC-0015, DEC-0020 pkt. 6). */
export interface StoryTime {
  readonly kind: StoryKind;
  /** For ikke-lineære scener: anker-scene og forskyvning (negativ = før ankeret). */
  readonly anchorSceneId: SceneId | null;
  readonly offset: number;
}

export interface Scene extends Entity<SceneId> {
  readonly originProductionId: ProductionId;
  readonly storyTime: StoryTime;
  readonly derivedFromSceneId: SceneId | null;
  readonly mergedIntoSceneId: SceneId | null;
}

export interface SceneHeading {
  readonly intExt: string; // f.eks. "INT.", "EXT.", "INT./EXT."
  readonly location: string;
  readonly time: string;
}

export interface SceneVariant extends Entity<VariantId> {
  readonly sceneId: SceneId;
  /** null = delt hovedvariant; ellers eid av én produksjon (24.5). */
  readonly ownerProductionId: ProductionId | null;
  readonly basedOnVariantId: VariantId | null;
  readonly heading: SceneHeading;
  /** Usikker tolkning av overskriften ved import (mandat 4.3 punkt 9). null = avklart. */
  readonly uncertainty: string | null;
}

export interface ScriptBlock extends Entity<BlockId> {
  readonly variantId: VariantId;
  readonly kind: BlockKind;
  readonly orderKey: string;
  readonly currentRev: number;
  readonly text: string; // tekst i gjeldende revisjon (current_rev)
  readonly language: typeof PRIMARY_LANGUAGE;
  /** Hvor blokken kom fra i originaldokumentet (side og høyde), for sammenligning med originalen (mandat 4.2). */
  readonly sourceRef: { readonly page: number; readonly y: number } | null;
  /** Usikker tolkning ved import (mandat 4.3 punkt 9). null = avklart. */
  readonly uncertainty: string | null;
  /** Fjernet fra manuset (historikken beholdes; kan gjenopprettes). Fjernede blokker vises ikke. */
  readonly removed: boolean;
}

/** Uforanderlig historikk for blokktekst (DEC-0020 pkt. 5). */
export interface BlockRevision {
  readonly blockId: BlockId;
  readonly rev: number;
  readonly text: string;
  readonly author: UserId;
  readonly createdAt: string;
}

export interface SceneOccurrence extends Entity<OccurrenceId> {
  readonly productionId: ProductionId;
  readonly sceneId: SceneId;
  readonly variantId: VariantId;
  readonly orderKey: string;
  readonly active: boolean;
  readonly excerpt: { readonly inFrame: number; readonly outFrame: number } | null;
  readonly activeTakeId: TakeId | null;
  /** Etablert produksjonsnummer (visning, f.eks. "42A"). Aldri identitet. */
  readonly productionNumber: string | null;
}

export interface ProductionSegment extends Entity<SegmentId> {
  readonly occurrenceId: OccurrenceId;
  readonly reason: SegmentReason;
  readonly orderKey: string;
  readonly startBlockId: BlockId | null;
  readonly endBlockId: BlockId | null;
}

export interface Take extends Entity<TakeId> {
  readonly occurrenceId: OccurrenceId;
  readonly segmentId: SegmentId | null;
  readonly kind: TakeKind;
  readonly status: TakeStatus;
  readonly durationFrames: number | null;
  /** Grunnlag for avviksdeteksjon: hvilke blokkrevisjoner materialet ble laget fra. */
  readonly producedFrom: { readonly blockRevisions: Readonly<Record<string, number>> };
  readonly mediaRef: string | null;
}

// ---------- Ressursbibliotek (M3 del 1; mandat kap. 8–9, REQ-0121–0136, REQ-0146, REQ-0149) ----------

export type AssetKind = "character" | "object" | "location" | "animal" | "environment" | "other";

/** Type alternativt navn (REQ-0126). */
export type AssetNameKind = "alias" | "nickname" | "former" | "language";

export interface AssetName {
  readonly name: string;
  readonly kind: AssetNameKind;
  /** Språkkode for språkspesifikke betegnelser (f.eks. "en"); ellers null. */
  readonly language: string | null;
}

/** Felles ressurs med permanent identitet (REQ-0125). Arkivering er ikke sletting. */
export interface Asset extends Entity<AssetId> {
  readonly kind: AssetKind;
  /** Foretrukket navn. */
  readonly name: string;
  readonly names: readonly AssetName[];
  readonly description: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly archived: boolean;
}

/** Fremstillingsstil for en visuell variant (REQ-0135, REQ-0149: stil er ikke identitet eller tilstand). */
export type VisualStyle =
  "reference" | "illustrated" | "realistic" | "animatic" | "poster" | "other";

/**
 * Visuell variant av en ressurs (REQ-0135): stil (hvordan den tegnes) og utseendetilstand (antrekk, alder, frisyre).
 * Hver variant versjoneres og godkjennes for seg (REQ-0136).
 */
export interface AssetVariant extends Entity<AssetVariantId> {
  readonly assetId: AssetId;
  readonly name: string;
  readonly style: VisualStyle;
  /** Utseendetilstand i historien, f.eks. «kort hår» eller «vinterklær». Tom = standard. */
  readonly appearance: string;
  /** Godkjent versjon. Endres bare ved eksplisitt godkjenning (REQ-0028, REQ-0146). */
  readonly approvedVersionId: AssetVersionId | null;
  readonly archived: boolean;
}

/** Uforanderlig versjon (bilde) av en visuell variant. */
export interface AssetVersion extends Entity<AssetVersionId> {
  readonly variantId: AssetVariantId;
  /** Løpenummer per variant (1, 2, 3 …). */
  readonly number: number;
  /** Sti i den private lagringsbøtten «assets»: <prosjekt>/<ressurs>/<versjon>/<filnavn>. */
  readonly mediaPath: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number;
  readonly sha256: string;
  readonly note: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

// ---------- Notater i manus (DEC-0031, REQ-0535–0540) ----------

/**
 * Et notat festet til et tekstutsnitt i en manusblokk, eller som nål på scenen (blockId = null).
 * Plasseringen lagres som tegnposisjoner + den markerte teksten, så notatet finnes igjen etter tekstendringer.
 * Stempelet (navn og tidspunkt) vises i hjørnet; ved import fra fil beholdes originalens stempel.
 */
export interface Annotation extends Entity<AnnotationId> {
  /** Nål på scenen: scenevarianten (følger scenen dit den flyttes). null for notater på tekst. */
  readonly variantId: VariantId | null;
  /** Notat på tekst: blokken (scenen er blokkens variant). null for nål på scenen. */
  readonly blockId: BlockId | null;
  readonly start: number;
  readonly end: number;
  readonly quote: string;
  readonly text: string;
  readonly authorName: string;
  readonly stampAt: string;
  /** Sist endret av (navn) og når – vises som «endret av …» (DEC-0032). null = aldri endret. */
  readonly editedByName: string | null;
  readonly editedAt: string | null;
  /** Slettet (kan angres). Slettede notater vises og eksporteres ikke. */
  readonly removed: boolean;
}

// ---------- 2D-sceneeditor (M3 del 2, mandat kap. 11–12, DEC-0035) ----------

/** Lagtype (mandat 11.1). Bestemmer standard dybde og hvordan laget vises i listen. */
export type LayerKind =
  "background" | "midground" | "foreground" | "character" | "object" | "effect" | "other";

/** Plassering av et lag i scenen. Posisjon er midtpunktet i scenens koordinater (piksler). */
export interface LayerTransform {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Grader, med klokka. */
  readonly rotation: number;
  /** 0–1 (mandat 11.2 transparens). */
  readonly opacity: number;
}

export type AnimatedProperty = keyof LayerTransform;
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "hold";

/** Nøkkelbilde for én egenskap (mandat 11.3, 12.5). Brukes av tidslinjen i neste leveranse. */
export interface Keyframe {
  readonly frame: number;
  readonly property: AnimatedProperty;
  readonly value: number;
  /** Hastighetskurve fram til neste nøkkelbilde. */
  readonly easing: Easing;
}

/** Kameraets utsnitt: midtpunkt i scenens koordinater, zoom (1 = hele formatet) og rotasjon i grader. */
export interface CameraFrame {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly rotation: number;
}

/**
 * Ett kamerautsnitt/shot i scenen (mandat 12.2–12.5): fra blå ramme (start) til rød ramme (slutt)
 * mellom to bilder, langs en rett eller kurvet (Bézier) bane.
 */
export interface CameraShot {
  readonly id: string;
  readonly name: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly from: CameraFrame;
  readonly to: CameraFrame;
  /** Kontrollpunkter for kurvet bane (scenekoordinater). null = rett bane. */
  readonly curve: {
    readonly c1x: number;
    readonly c1y: number;
    readonly c2x: number;
    readonly c2y: number;
  } | null;
  readonly easing: Easing;
}

export interface CompositionCamera {
  readonly shots: readonly CameraShot[];
}

/** En 2D-scene for én scenevariant: lerretets format og kamera. Lagene er egne rader (samtidig redigering). */
export interface Composition extends Entity<CompositionId> {
  readonly variantId: VariantId;
  readonly name: string;
  /** Bildeformatet i piksler (mandat 12.1). */
  readonly width: number;
  readonly height: number;
  /** Varighet i bilder. 0 = ikke satt (følger scenens beregnede varighet). */
  readonly durationFrames: number;
  /** Bakgrunnsfarge (#rrggbb). */
  readonly background: string;
  /** Kamera og shots (mandat kap. 12). Fylles av kameraeditoren i neste leveranse. */
  readonly camera: CompositionCamera;
  readonly removed: boolean;
}

export interface CompositionLayer extends Entity<LayerId> {
  readonly compositionId: CompositionId;
  /** Lagrekkefølge: lavere nøkkel tegnes først (bakerst). */
  readonly orderKey: string;
  readonly kind: LayerKind;
  readonly name: string;
  /** Bildet laget viser: ressurs, eventuelt variant, eventuelt låst versjon (null = godkjent/nyeste). */
  readonly assetId: AssetId | null;
  readonly assetVariantId: AssetVariantId | null;
  readonly versionId: AssetVersionId | null;
  /** Fargeflate (#rrggbb) når laget ikke viser et bilde. */
  readonly fill: string | null;
  /** Fargeflatens størrelse i piksler (bilder bruker bildets egen størrelse). */
  readonly width: number;
  readonly height: number;
  /** Parallakse: 0 står stille når kameraet beveger seg, 1 følger scenen, over 1 er nærmere enn scenen. */
  readonly parallax: number;
  readonly transform: LayerTransform;
  readonly keyframes: readonly Keyframe[];
  readonly visible: boolean;
  readonly locked: boolean;
  /** Gruppe (mandat 11.2). Lag med samme gruppe-ID flyttes sammen. */
  readonly groupId: string | null;
  readonly removed: boolean;
}

export interface ProjectState {
  readonly project: Project;
  readonly productions: Readonly<Record<string, Production>>;
  readonly scenes: Readonly<Record<string, Scene>>;
  readonly variants: Readonly<Record<string, SceneVariant>>;
  readonly blocks: Readonly<Record<string, ScriptBlock>>;
  readonly blockRevisions: readonly BlockRevision[];
  readonly occurrences: Readonly<Record<string, SceneOccurrence>>;
  readonly segments: Readonly<Record<string, ProductionSegment>>;
  readonly takes: Readonly<Record<string, Take>>;
  readonly assets: Readonly<Record<string, Asset>>;
  readonly assetVariants: Readonly<Record<string, AssetVariant>>;
  readonly assetVersions: Readonly<Record<string, AssetVersion>>;
  readonly annotations: Readonly<Record<string, Annotation>>;
  readonly compositions: Readonly<Record<string, Composition>>;
  readonly layers: Readonly<Record<string, CompositionLayer>>;
}

/** Tabellnavn i databasen for hver samling (brukes av patch/adapter). */
export const COLLECTION_TABLES = {
  productions: "productions",
  scenes: "scenes",
  variants: "scene_variants",
  blocks: "script_blocks",
  occurrences: "scene_occurrences",
  segments: "production_segments",
  takes: "takes",
  assets: "assets",
  assetVariants: "asset_variants",
  assetVersions: "asset_versions",
  annotations: "script_annotations",
  compositions: "compositions",
  layers: "composition_layers",
} as const;

export type CollectionName = keyof typeof COLLECTION_TABLES;

export function emptyProjectState(project: Project): ProjectState {
  return {
    project,
    productions: {},
    scenes: {},
    variants: {},
    blocks: {},
    blockRevisions: [],
    occurrences: {},
    segments: {},
    takes: {},
    assets: {},
    assetVariants: {},
    assetVersions: {},
    annotations: {},
    compositions: {},
    layers: {},
  };
}

export function mainProduction(state: ProjectState): Production | undefined {
  return Object.values(state.productions).find((p) => p.kind === "main");
}
