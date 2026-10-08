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
