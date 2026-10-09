/**
 * Kommandoer (ADR-0005, DEC-0011). Alle endringer i prosjektstrukturen og manusinnholdet
 * uttrykkes som kommandoer. ID-er for nye entiteter oppgis av kalleren, slik at kommandoen
 * og dens invers er deterministiske og kan lagres i change_log.
 */
import type {
  BlockId,
  CommandId,
  OccurrenceId,
  ProductionId,
  SceneId,
  SegmentId,
  TakeId,
  UserId,
  VariantId,
} from "../ids";
import type {
  BlockKind,
  ProductionKind,
  SceneHeading,
  SegmentReason,
  StoryTime,
  TakeKind,
  TakeStatus,
} from "../model";

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
  | { readonly type: "UndoCreateSegments"; readonly segmentIds: readonly SegmentId[] };

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
