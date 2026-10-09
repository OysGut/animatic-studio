/**
 * Kommandoer (ADR-0005, DEC-0011). Alle endringer i prosjektstrukturen og manusinnholdet
 * uttrykkes som kommandoer. ID-er for nye entiteter oppgis av kalleren, slik at kommandoen
 * og dens invers er deterministiske og kan lagres i change_log.
 */
import type {
  AnnotationId,
  AssetId,
  AssetVariantId,
  AssetVersionId,
  BlockId,
  CommandId,
  CompositionId,
  LayerId,
  OccurrenceId,
  ProductionId,
  SceneId,
  SegmentId,
  TakeId,
  UserId,
  VariantId,
} from "../ids";
import type {
  AssetKind,
  AssetName,
  BlockKind,
  Composition,
  CompositionCamera,
  CompositionLayer,
  Keyframe,
  LayerKind,
  LayerTransform,
  ProductionKind,
  SceneHeading,
  SegmentReason,
  StoryTime,
  TakeKind,
  TakeStatus,
  VisualStyle,
} from "../model";
import type { Rational } from "../time";

/** Redigerbare felter på en 2D-scene (format, varighet, bakgrunn). */
export interface CompositionFields {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly durationFrames: number;
  readonly background: string;
}

/** Redigerbare felter på et lag (mandat 11.1–11.3). Alt erstattes samlet (som UpdateAsset). */
export interface LayerFields {
  readonly kind: LayerKind;
  readonly name: string;
  readonly assetId: AssetId | null;
  readonly assetVariantId: AssetVariantId | null;
  readonly versionId: AssetVersionId | null;
  readonly fill: string | null;
  readonly width: number;
  readonly height: number;
  readonly parallax: number;
  readonly transform: LayerTransform;
  readonly keyframes: readonly Keyframe[];
  readonly visible: boolean;
  readonly locked: boolean;
  readonly groupId: string | null;
}

export interface NewLayer {
  readonly layerId: LayerId;
  readonly compositionId: CompositionId;
  /** Plassering i lagrekkefølgen. Utelatt = øverst. */
  readonly orderKey?: string;
  readonly fields: LayerFields;
}

/** Redigerbare felter på en ressurs (ressursbiblioteket, REQ-0121–0126). */
export interface AssetFields {
  readonly kind: AssetKind;
  readonly name: string;
  readonly names: readonly AssetName[];
  readonly description: string;
  readonly category: string;
  readonly tags: readonly string[];
}

export interface AssetVariantFields {
  readonly name: string;
  readonly style: VisualStyle;
  readonly appearance: string;
}

/** Et nytt notat (DEC-0031). Enten blockId med tegnområde, eller variantId (nål på scenen). */
export interface NewAnnotation {
  readonly annotationId: AnnotationId;
  readonly blockId: BlockId | null;
  readonly variantId: VariantId | null;
  readonly start: number;
  readonly end: number;
  readonly quote: string;
  readonly text: string;
  readonly authorName: string;
  /** Tidsstempel (ISO). Utelatt = nå. Ved import fra fil: originalens tidspunkt. */
  readonly stampAt?: string;
}

/** Opplastet bilde for en ressursversjon (filen ligger i den private bøtten «assets»). */
export interface AssetMedia {
  readonly path: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface NewBlock {
  readonly blockId: BlockId;
  readonly kind: BlockKind;
  readonly text: string;
  readonly orderKey: string;
  readonly sourceRef?: { readonly page: number; readonly y: number } | null;
  readonly uncertainty?: string | null;
  readonly removed?: boolean;
}

/** Én scene i en import (samme felter som CreateScene uten produksjon). */
export interface ImportedScene {
  readonly sceneId: SceneId;
  readonly variantId: VariantId;
  readonly occurrenceId: OccurrenceId;
  readonly orderKey: string;
  readonly heading: SceneHeading;
  readonly headingUncertainty?: string | null;
  readonly productionNumber: string | null;
  readonly blocks: readonly NewBlock[];
}

export interface BlockPlacement {
  readonly blockId: BlockId;
  readonly variantId: VariantId;
  readonly orderKey: string;
}

export type Command =
  | {
      readonly type: "CreateProduction";
      readonly productionId: ProductionId;
      readonly kind: ProductionKind;
      readonly name: string;
      readonly parentProductionId: ProductionId | null;
    }
  | {
      readonly type: "CreateScene";
      readonly productionId: ProductionId;
      readonly sceneId: SceneId;
      readonly variantId: VariantId;
      readonly occurrenceId: OccurrenceId;
      readonly orderKey: string;
      readonly heading: SceneHeading;
      readonly blocks: readonly NewBlock[];
      readonly storyTime?: StoryTime;
      readonly productionNumber?: string | null;
      readonly headingUncertainty?: string | null;
    }
  | {
      /** Hele manuset importeres i én atomisk kommando som kan angres samlet (mandat 4.1–4.3). */
      readonly type: "ImportScreenplay";
      readonly productionId: ProductionId;
      readonly scenes: readonly ImportedScene[];
    }
  | {
      readonly type: "UndoImportScreenplay";
      readonly productionId: ProductionId;
      readonly scenes: readonly ImportedScene[];
    }
  | {
      /** Korriger tolket elementtype (mandat 4.3: manuell korrigering). */
      readonly type: "SetBlockKind";
      readonly productionId: ProductionId;
      readonly blockId: BlockId;
      readonly kind: BlockKind;
    }
  | {
      readonly type: "EditSceneHeading";
      readonly productionId: ProductionId;
      readonly variantId: VariantId;
      readonly heading: SceneHeading;
    }
  | {
      /** Marker eller avklar usikker tolkning på blokk eller sceneoverskrift (variant). */
      readonly type: "SetUncertainty";
      readonly productionId: ProductionId;
      readonly targetId: string;
      readonly uncertainty: string | null;
    }
  | {
      /** Narrativ splitting: blokkene fra atBlockId flyttes til en ny scene (DEC-0015). */
      readonly type: "SplitScene";
      readonly productionId: ProductionId;
      readonly occurrenceId: OccurrenceId;
      readonly atBlockId: BlockId;
      readonly newSceneId: SceneId;
      readonly newVariantId: VariantId;
      /** Ny forekomst for hver forekomst som bruker samme variant (gammel forekomst-ID → ny). */
      readonly newOccurrenceIds: Readonly<Record<string, OccurrenceId>>;
      readonly heading: SceneHeading;
    }
  | {
      readonly type: "UndoSplitScene";
      readonly split: {
        readonly productionId: ProductionId;
        readonly occurrenceId: OccurrenceId;
        readonly atBlockId: BlockId;
        readonly newSceneId: SceneId;
        readonly newVariantId: VariantId;
        readonly newOccurrenceIds: Readonly<Record<string, OccurrenceId>>;
        readonly heading: SceneHeading;
      };
      readonly originalVariantId: VariantId;
    }
  | {
      /** Slå kildescenen inn i målscenen (mandat 4.4). Kildescenen beholdes som «sammenslått» (DEC-0020 pkt. 9). */
      readonly type: "MergeScenes";
      readonly productionId: ProductionId;
      readonly targetOccurrenceId: OccurrenceId;
      readonly sourceOccurrenceId: OccurrenceId;
    }
  | {
      readonly type: "UnmergeScenes";
      readonly productionId: ProductionId;
      readonly targetOccurrenceId: OccurrenceId;
      readonly sourceOccurrenceId: OccurrenceId;
      readonly placements: readonly BlockPlacement[];
      readonly sourceWasActive: boolean;
    }
  | {
      /** Fjern en manusblokk. Teksten og historikken beholdes og kan gjenopprettes (ingen sletting av historikk). */
      readonly type: "RemoveBlock";
      readonly productionId: ProductionId;
      readonly blockId: BlockId;
    }
  | {
      readonly type: "RestoreBlock";
      readonly productionId: ProductionId;
      readonly blockId: BlockId;
    }
  | {
      readonly type: "MoveOccurrence";
      readonly occurrenceId: OccurrenceId;
      readonly orderKey: string;
    }
  | {
      readonly type: "SetOccurrenceActive";
      readonly occurrenceId: OccurrenceId;
      readonly active: boolean;
    }
  | {
      readonly type: "EditBlockText";
      /** Produksjonen redigeringen skjer i (avgjør om delt variant kan endres, INV-04). */
      readonly productionId: ProductionId;
      readonly blockId: BlockId;
      readonly text: string;
    }
  | {
      readonly type: "InsertBlock";
      readonly productionId: ProductionId;
      readonly variantId: VariantId;
      readonly block: NewBlock;
    }
  | {
      readonly type: "ForkVariant";
      readonly occurrenceId: OccurrenceId;
      readonly newVariantId: VariantId;
      /** Ny blokk-ID for hver blokk i varianten som kopieres. */
      readonly blockIdMap: Readonly<Record<string, BlockId>>;
    }
  | {
      readonly type: "AddOccurrence";
      readonly productionId: ProductionId;
      readonly occurrenceId: OccurrenceId;
      readonly sceneId: SceneId;
      readonly variantId: VariantId;
      readonly orderKey: string;
    }
  | {
      readonly type: "CreateSegments";
      readonly occurrenceId: OccurrenceId;
      readonly reason: SegmentReason;
      readonly segments: readonly {
        readonly segmentId: SegmentId;
        readonly orderKey: string;
        readonly startBlockId: BlockId | null;
        readonly endBlockId: BlockId | null;
      }[];
    }
  | {
      readonly type: "AddTake";
      readonly takeId: TakeId;
      readonly occurrenceId: OccurrenceId;
      readonly segmentId: SegmentId | null;
      readonly kind: TakeKind;
      readonly status: TakeStatus;
      readonly durationFrames: number | null;
      readonly mediaRef: string | null;
    }
  | {
      readonly type: "SetActiveTake";
      readonly occurrenceId: OccurrenceId;
      readonly takeId: TakeId | null;
    }
  | { readonly type: "SetStoryTime"; readonly sceneId: SceneId; readonly storyTime: StoryTime }
  // ---------- Ressursbiblioteket (M3 del 1) ----------
  | {
      /** Én eller flere nye ressurser (flere: «Legg til alle» fra forslag i manuset). */
      readonly type: "CreateAssets";
      readonly assets: readonly {
        readonly assetId: AssetId;
        readonly fields: AssetFields;
        /** Bare ved gjør om etter angre (tilstanden ressursen hadde). */
        readonly archived?: boolean;
      }[];
    }
  | { readonly type: "UpdateAsset"; readonly assetId: AssetId; readonly fields: AssetFields }
  | { readonly type: "SetAssetArchived"; readonly assetId: AssetId; readonly archived: boolean }
  | {
      readonly type: "CreateAssetVariant";
      readonly variantId: AssetVariantId;
      readonly assetId: AssetId;
      readonly fields: AssetVariantFields;
      readonly archived?: boolean;
    }
  | {
      readonly type: "UpdateAssetVariant";
      readonly variantId: AssetVariantId;
      readonly fields: AssetVariantFields;
    }
  | {
      readonly type: "SetAssetVariantArchived";
      readonly variantId: AssetVariantId;
      readonly archived: boolean;
    }
  | {
      readonly type: "AddAssetVersion";
      readonly versionId: AssetVersionId;
      readonly variantId: AssetVariantId;
      readonly media: AssetMedia;
      readonly note: string;
      /** Bare ved gjør om etter angre: opprinnelig versjonsnummer (brukes hvis ledig). */
      readonly number?: number;
    }
  | {
      /** Eksplisitt godkjenning (REQ-0136, REQ-0145). null = ingen godkjent versjon. */
      readonly type: "ApproveAssetVersion";
      readonly variantId: AssetVariantId;
      readonly versionId: AssetVersionId | null;
    }
  // Interne inverser for opprettelse (brukes bare av angre; feiler hvis materialet er tatt i bruk).
  | { readonly type: "UndoCreateProduction"; readonly productionId: ProductionId }
  | {
      readonly type: "UndoCreateScene";
      readonly sceneId: SceneId;
      readonly variantId: VariantId;
      readonly occurrenceId: OccurrenceId;
      /** Blokkene opprettelsen laget. Angring nektes hvis scenen har fått andre blokker siden (ingen andres tekst slettes). */
      readonly blockIds: readonly BlockId[];
    }
  | { readonly type: "UndoInsertBlock"; readonly blockId: BlockId }
  | {
      readonly type: "UndoForkVariant";
      readonly occurrenceId: OccurrenceId;
      readonly previousVariantId: VariantId;
      readonly newVariantId: VariantId;
    }
  | { readonly type: "UndoAddOccurrence"; readonly occurrenceId: OccurrenceId }
  | { readonly type: "UndoCreateSegments"; readonly segmentIds: readonly SegmentId[] }
  | { readonly type: "UndoCreateAssets"; readonly assetIds: readonly AssetId[] }
  | { readonly type: "UndoCreateAssetVariant"; readonly variantId: AssetVariantId }
  | { readonly type: "UndoAddAssetVersion"; readonly versionId: AssetVersionId }
  // ---------- Notater i manus (DEC-0031) ----------
  | {
      readonly type: "AddAnnotations";
      readonly annotations: readonly NewAnnotation[];
      /** Fra en importert fil: navn og tidspunkt fra filen beholdes. Ellers setter serveren stempelet. */
      readonly imported?: boolean;
    }
  | { readonly type: "UndoAddAnnotations"; readonly annotationIds: readonly AnnotationId[] }
  | {
      readonly type: "EditAnnotation";
      readonly annotationId: AnnotationId;
      readonly text: string;
      /** Hvem som endrer (stemples «endret av …»). Settes av serveren fra profilen ved vanlige endringer. */
      readonly editedByName?: string | null;
      /** Bare ved angre: tidspunktet som skal tilbake. Ellers settes det til nå. */
      readonly editedAt?: string | null;
    }
  | {
      /** Slett (eller hent tilbake) et notat. Historikken beholdes og kan angres. */
      readonly type: "SetAnnotationRemoved";
      readonly annotationId: AnnotationId;
      readonly removed: boolean;
    }
  // ---------- Prosjektets format (DEC-0039) ----------
  | {
      /** Bildeformat og bildefrekvens for hele prosjektet. Alle 2D-scener tilpasses. */
      readonly type: "SetProjectFormat";
      readonly width: number;
      readonly height: number;
      readonly fps: Rational;
    }
  | {
      /** Angre SetProjectFormat: alt slik det var (bare som invers). */
      readonly type: "UndoSetProjectFormat";
      readonly project: { readonly width: number; readonly height: number; readonly fps: Rational };
      readonly productionFps: readonly {
        readonly productionId: ProductionId;
        readonly fps: Rational;
      }[];
      readonly compositions: readonly Composition[];
      readonly layers: readonly CompositionLayer[];
    }
  // ---------- 2D-sceneeditor (M3 del 2, DEC-0035) ----------
  | {
      readonly type: "CreateComposition";
      readonly compositionId: CompositionId;
      readonly variantId: VariantId;
      readonly fields: CompositionFields;
    }
  | { readonly type: "UndoCreateComposition"; readonly compositionId: CompositionId }
  | {
      readonly type: "UpdateComposition";
      readonly compositionId: CompositionId;
      readonly fields: CompositionFields;
      /** Kamera (kameraeditoren). Utelatt = uendret. */
      readonly camera?: CompositionCamera;
    }
  | {
      readonly type: "SetCompositionRemoved";
      readonly compositionId: CompositionId;
      readonly removed: boolean;
    }
  | { readonly type: "AddLayers"; readonly layers: readonly NewLayer[] }
  | { readonly type: "UndoAddLayers"; readonly layerIds: readonly LayerId[] }
  | {
      /** Endre ett eller flere lag samtidig (f.eks. flytte en gruppe). Én angring. */
      readonly type: "UpdateLayers";
      readonly layers: readonly { readonly layerId: LayerId; readonly fields: LayerFields }[];
    }
  | {
      /** Flytt et lag i lagrekkefølgen: rett bak `beforeLayerId` (tegnes før det). null = helt foran. */
      readonly type: "MoveLayer";
      readonly layerId: LayerId;
      readonly beforeLayerId: LayerId | null;
    }
  | {
      readonly type: "SetLayersRemoved";
      readonly layerIds: readonly LayerId[];
      readonly removed: boolean;
    };

export type CommandType = Command["type"];

export interface CommandEnvelope {
  readonly id: CommandId;
  readonly actor: UserId;
  readonly at: string; // ISO-tidspunkt
  /** Forventet revisjon per entitet kommandoen bygger på (INV-C1). */
  readonly baseRevisions?: Readonly<Record<string, number>>;
  readonly command: Command;
}

export type CommandErrorCode =
  | "not_found"
  | "invalid"
  | "duplicate_id"
  | "revision_conflict"
  | "must_fork_variant"
  | "referenced"
  | "invariant_violation";

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
  readonly details?: readonly string[];
}
