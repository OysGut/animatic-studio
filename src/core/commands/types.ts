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
  AudioClipId,
  BlockId,
  ClipPartId,
  CommandId,
  CompositionId,
  LayerId,
  OccurrenceId,
  ProductionId,
  SceneId,
  SegmentId,
  TakeId,
  TimeLinkId,
  ContinuityEventId,
  TranslationId,
  AssetRelationId,
  PosterId,
  StyleProfileId,
  StoryProfileId,
  StoryProfileStageId,
  StoryFactId,
  CanvasNodeId,
  CanvasEdgeId,
  GenerationPromptId,
  UserId,
  VariantId,
} from "../ids";
import type { LineLinkFields } from "../translation/line-align-prompt";
import type { VersionView } from "../library/view";
import type { StoryProfile, StoryProfilePatch } from "../storylab/profile";
import type { StoryFactFields } from "../storylab/facts";
import type {
  AssetKind,
  CanvasEdgeFields,
  CanvasNodeFields,
  AssetName,
  AudioKind,
  ExportSettings,
  BlockKind,
  Composition,
  CompositionCamera,
  CompositionLayer,
  ContinuityDuration,
  ContinuityKind,
  Keyframe,
  LanguageImage,
  PosterDocument,
  StyleGuide,
  PosterKind,
  RelationKind,
  LayerKind,
  LayerTransform,
  ProductionKind,
  SceneHeading,
  SegmentReason,
  StoryTime,
  TakeKind,
  ContextName,
  AssetVoice,
  StyleUse,
  TakeCoverage,
  SoundLink,
  TakeStatus,
  TakeMedia,
  Transition,
  ProducedFrom,
  VisualStyle,
  VolumeKey,
  ImageSwap,
  MotionPath,
  LayerMask,
  LayerActiveRange,
  BlendMode,
} from "../model";
import type { Rational } from "../time";
import type { DurationAssumptions } from "../screenplay/duration";

/** Redigerbare felter på et lydklipp (mandat 13.3, DEC-0044). Alt erstattes samlet. */
export interface AudioClipFields {
  readonly occurrenceId: OccurrenceId;
  readonly kind: AudioKind;
  readonly name: string;
  readonly assetId: AssetId;
  readonly assetVariantId: AssetVariantId | null;
  readonly versionId: AssetVersionId | null;
  readonly blockId: BlockId | null;
  readonly offsetMs: number;
  readonly sourceInMs: number;
  readonly lengthMs: number;
  readonly gainDb: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly muted: boolean;
  readonly continues: boolean;
  readonly volumeKeys: readonly VolumeKey[];
  /** Språket (DEC-0059): språkkode eller «*» (felles). Utelatt/null = standard for lydtypen. */
  readonly language?: string | null;
  /** Hastighet 0,25–4 (DEC-0079). Utelatt = 1 (uendret). */
  readonly speed?: number;
}

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
  /** Bildeskifter, bevegelsesbane og gruppens ankerpunkt (DEC-0052). */
  readonly swaps: readonly ImageSwap[];
  readonly path: MotionPath | null;
  readonly anchor: { readonly x: number; readonly y: number } | null;
  /** Språkavhengige bilder (DEC-0059). Utelatt = uendret ved endring, ingen ved nytt lag. */
  readonly languageImages?: readonly LanguageImage[];
  /** Maske og blandingsmodus (REQ-0175). Utelatt = uendret ved endring, ingen/«normal» ved nytt lag. */
  readonly mask?: LayerMask | null;
  readonly blend?: BlendMode;
  /** Aktivt tidsområde (AS2). Utelatt = uendret ved endring, hele scenen ved nytt lag. null = hele scenen. */
  readonly activeRange?: LayerActiveRange | null;
  /** Tekst, form, effekter og malfelt (MTS). Utelatt = uendret ved endring, ingen ved nytt lag. */
  readonly text?: import("../typography/types").TextSpec | null;
  readonly shape?: import("../typography/types").ShapeSpec | null;
  readonly effects?: import("../typography/types").LayerEffects | null;
  readonly template?: import("../typography/types").TemplateSlotRef | null;
  /** Overgangen inn i siden (bare sidelag, MTS MT6). Utelatt = uendret ved endring, kutt ved nytt lag. */
  readonly pageTransition?: import("../model").Transition | null;
}

export interface NewLayer {
  readonly layerId: LayerId;
  readonly compositionId: CompositionId;
  /** Plassering i lagrekkefølgen. Utelatt = øverst, men lokasjon og miljø (bakgrunnsbilder) nederst. */
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
  readonly resolved?: boolean;
  readonly blockId: BlockId | null;
  readonly variantId: VariantId | null;
  readonly start: number;
  readonly end: number;
  readonly quote: string;
  readonly text: string;
  readonly authorName: string;
  /** Tidsstempel (ISO). Utelatt = nå. Ved import fra fil: originalens tidspunkt. */
  readonly stampAt?: string;
  /** Merknad fra programmet (DEC-0088). */
  readonly source?: "system";
  /** Oppgaven merknaden hører til (DEC-0088). */
  readonly taskId?: string;
  /** Forsøksvis manusredigering (AS3): type og foreslått tekst. */
  readonly kind?: "trial_edit";
  readonly suggestedText?: string;
}

/** Opplastet bilde for en ressursversjon (filen ligger i den private bøtten «assets»). */
export interface AssetMedia {
  readonly path: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number;
  readonly sha256: string;
  /** Lengde i millisekunder (bare lydfiler). */
  readonly durationMs?: number | null;
  /** Avledede filer (arbeidskopi, proxy, miniatyr, rå TIFF) for bildeversjoner (B-105a, migrasjon 0078). */
  readonly derivedFiles?: import("../library/image-ingest").DerivedImageFiles;
}

export interface NewBlock {
  readonly blockId: BlockId;
  readonly kind: BlockKind;
  readonly text: string;
  readonly orderKey: string;
  readonly sourceRef?: { readonly page: number; readonly y: number; readonly documentId?: string } | null;
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

export type Command = import("../animation/rig-commands").RigCommand
  | import("../print/measure/commands").MeasureSetCommand
  | import("../print/job/commands").PrintJobCommand
  | import("../rig/multiplane-commands").MultiplaneRigCommand
  | import("../animation/behavior-commands").BehaviorCommand
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
      /** Scenetype (MTS MT6): utelatt/«scene» = vanlig manusscene. */
      readonly kind?: import("../model").OccurrenceKind;
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
      /** Planlagte lengder delingen fjernet (forekomst → ms), settes tilbake (REQ-0111). */
      readonly plans?: Readonly<Record<string, number>>;
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
      /** Målscenens planlagte lengde før sammenslåingen (REQ-0111), settes tilbake. */
      readonly targetPlannedMs?: number;
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
      /** Ny ID for hver gjeldende oversettelse av scenen som følger med (DEC-0058). Utelatt = ingen kopi. */
      readonly translationIdMap?: Readonly<Record<string, TranslationId>>;
      /**
       * Ny ID for hvert notat på teksten eller scenen som følger med (KI-33). Utelatt = alle synlige notater
       * kopieres med ID-er avledet av den nye varianten og notatet (samme ID-er ved gjør om).
       */
      readonly annotationIdMap?: Readonly<Record<string, AnnotationId>>;
      /**
       * Tilbakeføring (DEC-0060): kopier innholdet fra denne varianten av scenen (f.eks. spinoffens versjon)
       * i stedet for forekomstens nåværende. Utelatt = forekomstens variant.
       */
      readonly sourceVariantId?: VariantId;
    }
    | {
      readonly type: "AddOccurrence";
      readonly productionId: ProductionId;
      readonly occurrenceId: OccurrenceId;
      readonly sceneId: SceneId;
      readonly variantId: VariantId;
      readonly orderKey: string;
      /** Scenetypen (MTS MT6). Utelatt = «scene». */
      readonly kind?: import("../model").OccurrenceKind;
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
      /** Importert film: filinformasjon (DEC-0047). */
      readonly media?: TakeMedia;
    }
  | {
      /** Overgangen inn i scenen i filmen (DEC-0047). */
      readonly type: "SetTransition";
      readonly occurrenceId: OccurrenceId;
      /** null: scenen følger prosjektets standardovergang (DEC-0051). */
      readonly transition: Transition | null;
    }
  | {
      /** Prosjektets standardovergang (DEC-0051, REQ-0577). null = kutt. */
      readonly type: "SetDefaultTransition";
      readonly transition: Transition | null;
    }
  | {
      /**
       * AI-budsjett for prosjektet (DEC-0053, REQ-0282/0284/0528): høyeste antall genereringer per måned
       * (null = bare de faste grensene) og anslått pris per bilde (null = ukjent). Bare eieren.
       */
      readonly type: "SetAiBudget";
      readonly monthLimit: number | null;
      readonly pricePerImage: number | null;
    }
  | {
      /**
       * Egen genereringsbeskrivelse for et segment (DEC-0053, REQ-0252/0253/0256). Finnes beskrivelsen,
       * endres den; ellers lages den. `text` null = tilbake til den automatiske (beskrivelsen fjernes).
       */
      readonly type: "SetGenerationPrompt";
      readonly promptId: GenerationPromptId;
      readonly occurrenceId: OccurrenceId;
      readonly segmentId: SegmentId;
      readonly text: string | null;
      readonly basedOn: string;
    }
  | {
      /**
       * Ny inndeling av scenen i segmenter for generering (DEC-0053, REQ-0260/0267): segmentene i
       * `removeSegmentIds` fjernes og `segments` legges til. Manusets struktur endres aldri. Segmenter med
       * materiale eller en egen beskrivelse kan ikke fjernes.
       */
      readonly type: "ReplaceSegments";
      readonly occurrenceId: OccurrenceId;
      readonly reason: SegmentReason;
      /** Må være nøyaktig de nåværende segmentene med samme grunn (ellers har noen endret dem samtidig). */
      readonly removeSegmentIds: readonly SegmentId[];
      readonly segments: readonly {
        readonly segmentId: SegmentId;
        readonly orderKey: string;
        readonly startBlockId: BlockId | null;
        readonly endBlockId: BlockId | null;
        /** Tidsrom i scenen (ms); påkrevd for segmenter til generering («model_limit»). */
        readonly startMs?: number;
        readonly endMs?: number;
      }[];
    }
  | {
      /**
       * Godkjenn manusendringene for materiale (DEC-0054, REQ-0306/0307): 2D-scenen og/eller versjonene
       * regnes som laget fra manuset slik det er nå. Avviket forsvinner; endringen logges.
       */
      readonly type: "AcceptScriptChanges";
      readonly occurrenceId: OccurrenceId;
      readonly compositionIds: readonly CompositionId[];
      readonly takeIds: readonly TakeId[];
    }
  | {
      /** Sett grunnlaget for materiale direkte (angre av AcceptScriptChanges). */
      readonly type: "SetProducedFrom";
      /**
       * `assetVersions` (REQ-0022): ressurs-ID → versjons-ID. Utelatt eller null = ukjent (fjernes).
       */
      readonly compositions: readonly {
        readonly compositionId: CompositionId;
        readonly blockRevisions: Readonly<Record<string, number>>;
        readonly assetVersions?: Readonly<Record<string, string>> | null;
      }[];
      readonly takes: readonly {
        readonly takeId: TakeId;
        readonly blockRevisions: Readonly<Record<string, number>>;
        readonly assetVersions?: Readonly<Record<string, string>> | null;
      }[];
    }
  | {
      /** Instrukser til AI-video av scenen (DEC-0083, migrasjon 0032); tom tekst fjerner dem. */
      readonly type: "SetSceneVideoInstructions";
      readonly occurrenceId: OccurrenceId;
      readonly text: string;
    }
  | {
      /** Planlagt lengde for scenen (REQ-0111/0113); null fjerner planen. */
      readonly type: "SetPlannedDuration";
      readonly occurrenceId: OccurrenceId;
      readonly plannedMs: number | null;
    }
  | {
      /** Svart-hvitt for scenen, i visning og eksport (DEC-0051, REQ-0574). */
      readonly type: "SetOccurrenceMonochrome";
      readonly occurrenceId: OccurrenceId;
      readonly monochrome: boolean;
    }
  | {
      /** Arbeidsstatus for scenen i produksjonen (B-118); null fjerner statusen. */
      readonly type: "SetOccurrenceWorkStatus";
      readonly occurrenceId: OccurrenceId;
      readonly workStatus: string | null;
    }
  | {
      /** Scenefarge som palettnøkkel (B-118); null fjerner fargen. */
      readonly type: "SetOccurrenceColor";
      readonly occurrenceId: OccurrenceId;
      readonly color: string | null;
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
        /** Hentet fra det globale biblioteket (GP2). */
        readonly globalAssetId?: string;
      }[];
    }
  | { readonly type: "UpdateAsset"; readonly assetId: AssetId; readonly fields: AssetFields }
  | { readonly type: "SetAssetArchived"; readonly assetId: AssetId; readonly archived: boolean }
  /** «Slettede objekter» (DEC-0079): slett eller hent inn igjen ressurser. */
  | {
      readonly type: "SetAssetsRemoved";
      readonly assetIds: readonly AssetId[];
      readonly removed: boolean;
    }
  /** «Slettede objekter» (DEC-0079): slett eller hent inn igjen enkeltbilder (versjoner). */
  | {
      readonly type: "SetAssetVersionsRemoved";
      readonly versionIds: readonly AssetVersionId[];
      readonly removed: boolean;
    }
  /** Vinkelen et bilde viser (DEC-0080): front, side, bak …; null fjerner merket. */
  | {
      readonly type: "SetVersionView";
      readonly versionId: AssetVersionId;
      readonly view: VersionView | null;
    }
  /** Ord-til-lyd for et opptak (DEC-0095): ny analyse eller manuell retting; null fjerner koblingen. */
  | {
      readonly type: "SetVersionAlignment";
      readonly versionId: AssetVersionId;
      readonly alignment: import("../audio/alignment").WordAlignment | null;
    }
  /** Visuelt faktaark for en ressurs (DEC-0080): engelsk tekst; tom fjerner det. */
  | {
      readonly type: "SetAssetVisualBrief";
      readonly assetId: AssetId;
      readonly text: string;
    }
  /** «Animer på toere» (DEC-0079): bevegelsen oppdateres hvert n-te bilde (1–4) i 2D-scenen. */
  | {
      readonly type: "SetCompositionStep";
      readonly compositionId: CompositionId;
      readonly step: number;
    }
  /** Koblingene til en lydressurs (REQ-0204, DEC-0070); erstatter hele listen. */
  | {
      readonly type: "SetSoundLinks";
      readonly assetId: AssetId;
      readonly links: readonly SoundLink[];
      /** Angring: koblinger til noe som er fjernet siden, kan settes tilbake. */
      readonly restore?: boolean;
    }
  /** Betegnelser i bestemte manuslinjer (REQ-0127, DEC-0071); erstatter hele listen. */
  | {
      /**
       * Planlegg et element i flere scener (DEC-0088): legges til i elementets scenePlans. Finnes det fra før
       * en plan for samme scene, erstattes den.
       */
      readonly type: "PlanAssetInScenes";
      readonly assetId: AssetId;
      readonly taskId: string;
      readonly fromOccurrenceId: string;
      readonly occurrenceIds: readonly string[];
    }
  | {
      /** Fjern planer (alle for oppgaven, eller bare for noen scener). */
      readonly type: "RemoveScenePlans";
      readonly assetId: AssetId;
      readonly taskId?: string;
      readonly occurrenceIds?: readonly string[];
    }
  | {
      /** Sett planene tilbake (angre). */
      readonly type: "SetScenePlans";
      readonly assetId: AssetId;
      readonly plans: readonly import("../model").ScenePlan[];
    }
  | {
      readonly type: "SetContextNames";
      readonly assetId: AssetId;
      readonly contextNames: readonly ContextName[];
      readonly restore?: boolean;
    }
  /**
   * Arbeidslisten for oppdaterte ressurser (DEC-0072): versjoner brukeren har gått gjennom og valgt å beholde
   * det gamle bildet mot, for et lag eller en versjon av scenen (stillbilde, AI-video).
   */
  | {
      readonly type: "SetReviewedVersions";
      readonly target: "layer" | "take";
      readonly id: string;
      readonly versionIds: readonly string[];
    }
  /** Eksportinnstillingene sist brukt for produksjonen (DEC-0072, REQ-0407). */
  | {
      readonly type: "SetExportSettings";
      readonly productionId: ProductionId;
      /**
       * null fjerner alt. `titlePage` (KI-20): utelatt = tittelsiden beholdes som den er (så eksport av
       * animatic ikke sletter den); null = fjernes; liste = settes (må holde seg under grensen).
       */
      readonly settings:
        | (Omit<ExportSettings, "titlePage"> & { readonly titlePage?: readonly string[] | null })
        | null;
    }
  /** Antakelsene for varighetsestimatet for hele prosjektet (KI-28, migrasjon 0028); null = standard. */
  | {
      readonly type: "SetDurationAssumptions";
      readonly assumptions: DurationAssumptions | null;
    }
  /** Hvilken del av manuset en film dekker (REQ-0237, DEC-0071), eller null for hele scenen. */
  | {
      readonly type: "SetTakeCoverage";
      readonly takeId: TakeId;
      readonly coverage: TakeCoverage | null;
    }
  /** Stemmen for AI-dialog (DEC-0071), eller null. */
  | {
      readonly type: "SetAssetVoice";
      readonly assetId: AssetId;
      readonly voice: AssetVoice | null;
    }
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
      /**
       * Lydkomposisjonen versjonen er laget av (DEC-0094, migrasjon 0036). Lydfilen i `media` er miksen av
       * den; komposisjonen kan redigeres videre uten at kildeopptakene endres.
       */
      readonly composition?: import("../audio/composition").AudioComposition;
      readonly alignment?: import("../audio/alignment").WordAlignment;
      /** Kopiert fra en global versjon (GP2). Bare metadata. */
      readonly globalSource?: import("../model").GlobalSource;
      /** Maldefinisjonen (MTS MT4) når ressursen er en mal; filen er malens miniatyr. */
      readonly template?: import("../typography/template").TemplateDefinition;
      /** Fontmetadata (B-098) når ressursen er en font; filen er fontpakken. */
      readonly font?: import("../typography/project-fonts").FontSpec;
      /** Versjonen den nye er frilagt fra eller erstatter (REQ-0037, migrasjon 0069). Samme ressurs. */
      readonly derivedFromVersionId?: AssetVersionId;
    }
  | {
      /** Eksplisitt godkjenning (REQ-0136, REQ-0145). null = ingen godkjent versjon. */
      readonly type: "ApproveAssetVersion";
      readonly variantId: AssetVariantId;
      readonly versionId: AssetVersionId | null;
    }
  // Interne inverser for opprettelse (brukes bare av angre; feiler hvis materialet er tatt i bruk).
  | { readonly type: "UndoCreateProduction"; readonly productionId: ProductionId }
  /** Notat om hva produksjonen er (DEC-0082); tomt fjerner det. */
  | {
      readonly type: "SetProductionNote";
      readonly productionId: ProductionId;
      readonly note: string;
    }
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
      /** Varianten innholdet ble kopiert fra, når det ikke var den forrige (tilbakeføring, DEC-0060). */
      readonly sourceVariantId?: VariantId;
      /**
       * Originalnotat → kopi i den nye versjonen (KI-33), slik ForkVariant laget dem. Utelatt (eldre
       * angresteg) = kopiene har ID-er avledet av den nye varianten og originalen.
       */
      readonly annotationIdMap?: Readonly<Record<string, AnnotationId>>;
    }
  | { readonly type: "UndoAddOccurrence"; readonly occurrenceId: OccurrenceId }
  | {
      /** Ny deltaker i rulleteksten (MTS MT7). */
      readonly type: "AddCreditParticipant";
      readonly participantId: import("../ids").CreditParticipantId;
      readonly fields: {
        readonly orderKey: string;
        readonly groupKey: string;
        readonly hidden: boolean;
        readonly fields: Readonly<Record<string, string>>;
        readonly logoAssetId?: AssetId | null;
        readonly logoVersionId?: AssetVersionId | null;
        readonly imageAssetId?: AssetId | null;
        readonly imageVersionId?: AssetVersionId | null;
      };
    }
  | {
      /** Endre en deltaker (feltnivå; bare feltene som er med, endres). */
      readonly type: "UpdateCreditParticipant";
      readonly participantId: import("../ids").CreditParticipantId;
      readonly fields: Partial<{
        readonly orderKey: string;
        readonly groupKey: string;
        readonly hidden: boolean;
        readonly fields: Readonly<Record<string, string>>;
        readonly logoAssetId: AssetId | null;
        readonly logoVersionId: AssetVersionId | null;
        readonly imageAssetId: AssetId | null;
        readonly imageVersionId: AssetVersionId | null;
      }>;
    }
  | {
      /** Fjern en deltaker (removed = true; kan angres). */
      readonly type: "RemoveCreditParticipant";
      readonly participantId: import("../ids").CreditParticipantId;
    }
  | {
      /** Lag eller endre rulletekstsekvensen for en forekomst (MTS MT7). */
      readonly type: "SetCreditSequence";
      readonly sequenceId: import("../ids").CreditSequenceId;
      readonly occurrenceId: OccurrenceId;
      readonly fields: {
        readonly presentation: import("../model").CreditPresentation;
        readonly durationFrames: number;
        readonly pauseFrames: number;
        readonly transition?: import("../model").Transition | null;
        readonly speed: number;
        readonly direction: "up" | "down";
        readonly groupTemplates?: Readonly<Record<string, AssetVersionId>>;
      };
    }
  | {
      /** Fjern rulletekstsekvensen (removed = true; kan angres). */
      readonly type: "RemoveCreditSequence";
      readonly sequenceId: import("../ids").CreditSequenceId;
    }
  | {
      /**
       * Overfør en ny scene fra en avledet produksjon til en annen produksjon (hovedfilmen, DEC-0060,
       * REQ-0381): ny forekomst med egen kopi av spinoffens versjon (blokker, historikk, oversettelser).
       * Spinoffens versjon endres ikke.
       */
      readonly type: "TransferScene";
      readonly productionId: ProductionId;
      readonly occurrenceId: OccurrenceId;
      readonly orderKey: string;
      readonly sourceVariantId: VariantId;
      readonly newVariantId: VariantId;
      readonly blockIdMap: Readonly<Record<string, BlockId>>;
      readonly translationIdMap?: Readonly<Record<string, TranslationId>>;
    }
  | {
      readonly type: "UndoTransferScene";
      readonly occurrenceId: OccurrenceId;
      readonly sourceVariantId: VariantId;
      readonly newVariantId: VariantId;
    }
  | { readonly type: "UndoCreateSegments"; readonly segmentIds: readonly SegmentId[] }
  | { readonly type: "UndoCreateAssets"; readonly assetIds: readonly AssetId[] }
  | { readonly type: "UndoCreateAssetVariant"; readonly variantId: AssetVariantId }
  | { readonly type: "UndoAddAssetVersion"; readonly versionId: AssetVersionId }
  | {
      /**
       * Setter eller erstatter de avledede filene til en bildeversjon (B-105a): brukes av opplastingen og
       * av bakgrunnsoppgraderingen av eldre bilder. null fjerner merkingen (bare i angre).
       */
      readonly type: "SetAssetVersionDerived";
      readonly versionId: AssetVersionId;
      readonly derived: import("../library/image-ingest").DerivedImageFiles | null;
    }
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
  | { readonly type: "SetAnnotationResolved"; readonly annotationId: AnnotationId; readonly resolved: boolean }
  // ---------- Prosjektets format (DEC-0039) ----------
  | { readonly type: "SetInterchangeSettings"; readonly code: string | null; readonly capture: import("../interchange/settings").CaptureSettings }
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
      /**
       * Overganger og utdrag i bilder slik de var (KI-48), for forekomster som hadde dem. Utelatt (eldre
       * angresteg) = overganger og utdrag ble ikke regnet om og røres ikke.
       */
      readonly occurrences?: readonly {
        readonly occurrenceId: OccurrenceId;
        readonly transition: Transition | null;
        readonly excerpt: { readonly inFrame: number; readonly outFrame: number } | null;
      }[];
      /** Prosjektets standardovergang slik den var (KI-48); null = ingen. */
      readonly defaultTransition?: Transition | null;
      /** Lengden i bilder for versjonene av scenene slik den var (KI-48). */
      readonly takeFrames?: readonly {
        readonly takeId: TakeId;
        readonly durationFrames: number | null;
      }[];
    }
  // ---------- 2D-sceneeditor (M3 del 2, DEC-0035) ----------
  | {
      readonly type: "CreateComposition";
      readonly compositionId: CompositionId;
      readonly variantId: VariantId;
      readonly fields: CompositionFields;
      /** Grunnlaget (gjør om etter angre beholder det opprinnelige, DEC-0054). Mangler = manuset nå. */
      readonly producedFrom?: ProducedFrom;
    }
  | { readonly type: "UndoCreateComposition"; readonly compositionId: CompositionId }
  | {
      readonly type: "UpdateComposition";
      readonly compositionId: CompositionId;
      readonly fields: CompositionFields;
      /** Kamera (kameraeditoren). Utelatt = uendret. */
      readonly camera?: CompositionCamera;
      /** Låste tidsrom og fyll i ny tid (SV1, migrasjon 0042). Utelatt = uendret. */
      readonly timing?: import("../composition/timing").CompositionTiming;
    }
  | {
      /**
       * Ny varighet for hele scenen (SV1, B-041): alle endringene samlet, så de lagres i én transaksjon og
       * angres med én angring. Lages av planRetime; trinnene er bare tidsendringer i scenen.
       */
      readonly type: "RetimeScene";
      readonly occurrenceId: OccurrenceId;
      readonly compositionId: CompositionId;
      readonly steps: readonly Command[];
    }
  | {
      /**
       * Asset Studio (AS1, B5): utkastet for scenen lagres som én kommando – én transaksjon og én angring.
       * Trinnene er bare scenekommandoer (lag, lydklipp, scenens timing); bibliotek og notater skrives direkte.
       */
      readonly type: "UpdateSceneDraft";
      readonly occurrenceId: OccurrenceId;
      readonly compositionId: CompositionId;
      readonly steps: readonly Command[];
    }
  | {
      readonly type: "SetCompositionRemoved";
      readonly compositionId: CompositionId;
      readonly removed: boolean;
    }
  | { readonly type: "AddLayers"; readonly layers: readonly NewLayer[] }
  // ---------- Maler (MTS MT4) ----------
  | {
      readonly type: "AddTemplateInstance";
      readonly instanceId: import("../ids").TemplateInstanceId;
      readonly fields: import("../typography/template").TemplateInstanceFields;
    }
  | {
      readonly type: "UndoAddTemplateInstance";
      readonly instanceId: import("../ids").TemplateInstanceId;
    }
  | {
      /** Nytt innhold eller ny malversjon for en forekomst. */
      readonly type: "UpdateTemplateInstance";
      readonly instanceId: import("../ids").TemplateInstanceId;
      readonly fields: {
        readonly values: import("../typography/template").TemplateValues;
        readonly templateVersionId: AssetVersionId;
      };
    }
  | {
      /**
       * Bruk mal, nytt innhold eller ny malversjon som én samlet kommando (ett angretrinn, én revisjon per rad).
       * Trinnene er vanlige kommandoer (TEMPLATE_STEPS).
       */
      readonly type: "ApplyTemplate";
      readonly steps: readonly Command[];
    }
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
    }
  // ---------- Lyd i filmen (M4 del 2, DEC-0044) ----------
  | {
      readonly type: "AddAudioClips";
      readonly clips: readonly { readonly clipId: AudioClipId; readonly fields: AudioClipFields }[];
      readonly dialogueMeta?: import("../dialogue/versions").DialogueVersionMeta;
    }
  | { readonly type: "UndoAddAudioClips"; readonly clipIds: readonly AudioClipId[] }
  | {
      readonly type: "UpdateAudioClips";
      readonly clips: readonly { readonly clipId: AudioClipId; readonly fields: AudioClipFields }[];
      /**
       * DV2: lydversjoner kommandoen opprettet (ny fil på en versjonert replikk) og som inversen fjerner igjen.
       * Settes bare av inversen; versjoner som er aktive eller brukt av leppesynk, fjernes aldri.
       */
      readonly dropDialogueVersions?: readonly string[];
      /** DV2: slettede versjoner kommandoen hentet inn igjen (gammelt take valgt på nytt), som inversen sletter igjen. */
      readonly reRemoveDialogueVersions?: readonly string[];
      /** DV2: nøyaktig hvilken versjon som skal bli aktiv per klipp (brukes av inversen når flere versjoner har samme fil). */
      readonly activeVersionIds?: Readonly<Record<string, string>>;
    }
  // ---------- Lydversjoner per replikk (DV2, migrasjon 0060) ----------
  | {
      readonly type: "SetDialogueLanguage";
      readonly target: "project" | "variant" | "block" | "clip" | "blockSpeech";
      readonly targetId: string;
      readonly language: string | null;
    }
  | {
      readonly type: "ApplyGeneratedDialogue";
      readonly occurrenceId: string;
      readonly blockId: string;
      readonly characterId: string;
      readonly assetId: string;
      readonly variantId: string;
      readonly versionId: string;
      readonly clipId: string;
      readonly dialogueVersionId: string;
      readonly compositionId: string;
      readonly media: AssetMedia;
      readonly metadata: import("../dialogue/versions").DialogueVersionMeta;
      readonly language: string;
      /** DV7 (R6): gjennomgangen med grunnlaget «generated» for revisjonen lyden ble laget fra. */
      readonly reviewId?: string;
    }
  | { readonly type: "UndoGeneratedDialogue"; readonly steps: readonly Command[] }
  /** DV7 (A9): «Merk som gjennomgått» for aktiv versjon ved blokkens gjeldende revisjon. */
  | { readonly type: "ReviewDialogueDrift"; readonly reviewId: string; readonly clipId: string; readonly basis?: "manual" | "generated" }
  | { readonly type: "UndoReviewDialogueDrift"; readonly reviewId: string }
  /** DV8: gule huskelapper. */
  | { readonly type: "AddNoteFlag"; readonly flagId: string; readonly targetKind: import("../notes/flags").NoteFlagTargetKind; readonly targetId: string; readonly text: string }
  | { readonly type: "UndoAddNoteFlag"; readonly flagId: string }
  | { readonly type: "UpdateNoteFlag"; readonly flagId: string; readonly text?: string; readonly enabled?: boolean }
  | { readonly type: "SetNoteFlagRemoved"; readonly flagId: string; readonly removed: boolean }
  // M8 kvalitetsprofiler (REQ-0854–0862, migrasjon 0063)
  // ML3: språkversjoner per prosjekt (migrasjon 0066). Fjerning sletter aldri oversettelser.
  | { readonly type: "AddLanguageVersion"; readonly versionId: string; readonly language: string; readonly name: string; readonly status?: import("../translation/language-versions").LanguageVersionStatus }
  | { readonly type: "UndoAddLanguageVersion"; readonly versionId: string }
  | { readonly type: "UpdateLanguageVersion"; readonly versionId: string; readonly name?: string; readonly status?: import("../translation/language-versions").LanguageVersionStatus }
  | { readonly type: "SetLanguageVersionRemoved"; readonly versionId: string; readonly removed: boolean }
  | { readonly type: "AddQualityProfile"; readonly profileId: string; readonly name: string; readonly spec: import("../generation/quality-profile").QualityProfileSpec; readonly restoreActive?: boolean }
  | { readonly type: "UndoAddQualityProfile"; readonly profileId: string; readonly restoreActive?: boolean }
  | { readonly type: "UpdateQualityProfile"; readonly profileId: string; readonly name?: string; readonly spec?: import("../generation/quality-profile").QualityProfileSpec }
  | { readonly type: "SetQualityProfileRemoved"; readonly profileId: string; readonly removed: boolean; readonly restoreActive?: boolean }
  | { readonly type: "SetActiveQualityProfile"; readonly profileId: string | null }
  | {
      readonly type: "SetDialogueCharacter";
      readonly clipIds: readonly AudioClipId[];
      readonly characterAssetId: AssetId | null;
    }
  | {
      readonly type: "RestoreDialogueCharacters";
      readonly links: readonly { readonly clipId: AudioClipId; readonly characterAssetId: AssetId | null }[];
    }
  | {
      /** Ny lydversjon for en replikkforekomst (opptak, AI, opplasting). Ingenting overskrives. */
      readonly type: "AddDialogueVersion";
      readonly dialogueVersionId: string;
      readonly clipId: AudioClipId;
      readonly fields: import("../dialogue/versions").DialogueVersionFields;
      /** Gjør den nye versjonen aktiv. */
      readonly activate: boolean;
    }
  | {
      /** Bare som invers av AddDialogueVersion. `restoreActiveId`: aktiv versjon igjen hvis denne var aktiv. */
      readonly type: "UndoAddDialogueVersion";
      readonly dialogueVersionId: string;
      readonly restoreActiveId: string | null;
    }
  | {
      /** Velg hvilken versjon som spilles i scenen. Plasseringen og alle versjoners redigering er uendret. */
      readonly type: "SetActiveDialogueVersion";
      readonly clipId: AudioClipId;
      readonly dialogueVersionId: string;
    }
  | {
      /** Endre redigeringen i én lydversjon (trim, volum, fades, volumpunkter, hastighet, komposisjon). */
      readonly type: "UpdateDialogueVersionEdit";
      readonly dialogueVersionId: string;
      readonly edit: import("../dialogue/versions").DialogueEdit;
    }
  | {
      /** Flytt replikken i scenen. Versjonenes redigering endres ikke; andre replikker flyttes aldri. */
      readonly type: "MoveDialogueLine";
      readonly clipId: AudioClipId;
      readonly offsetMs: number;
      /** Tillat overlapp med samme taler (brukeren har bekreftet). */
      readonly allowOverlap?: boolean;
    }
  | {
      /** Eksplisitt «Slett versjon» (etter bekreftelse) eller angring av den. Aktiv versjon kan ikke slettes. */
      readonly type: "SetDialogueVersionRemoved";
      readonly dialogueVersionId: string;
      readonly removed: boolean;
    }
  | {
      readonly type: "SetAudioClipsRemoved";
      readonly clipIds: readonly AudioClipId[];
      readonly removed: boolean;
    }
  // ---------- Montering del 4 (DEC-0048) ----------
  | {
      /**
       * Materialet i en scene: aktiv versjon og eventuelle deler (kutt, splitting, animatic-rest). Delene
       * erstatter de forrige (som merkes fjernet). Tom liste = hele den aktive versjonen eller 2D-scenen.
       */
      readonly type: "SetSceneEdit";
      readonly occurrenceId: OccurrenceId;
      readonly activeTakeId: TakeId | null;
      readonly parts: readonly ClipPartFields[];
    }
  | { readonly type: "SetTakeStatus"; readonly takeId: TakeId; readonly status: TakeStatus }
  // ---------- Språkversjoner av filmen (M7 del 3, DEC-0059) ----------
  | {
      /** Dialogen i filmens egen lyd: språkkode, «none» (bare musikk og effekter) eller null (ikke angitt). */
      readonly type: "SetTakeAudioLanguage";
      readonly takeId: TakeId;
      readonly audioLanguage: string | null;
    }
  | {
      readonly type: "AddTimeLinks";
      readonly links: readonly { readonly linkId: TimeLinkId; readonly fields: TimeLinkFields }[];
    }
  | {
      readonly type: "UpdateTimeLinks";
      readonly links: readonly { readonly linkId: TimeLinkId; readonly fields: TimeLinkFields }[];
    }
  | {
      readonly type: "SetTimeLinksRemoved";
      readonly linkIds: readonly TimeLinkId[];
      readonly removed: boolean;
    }
  | {
      /** Kontinuitetshendelser (M6 del 2, DEC-0055): godkjent eller avvist forslag, eller lagt inn selv. */
      readonly type: "AddContinuityEvents";
      readonly events: readonly {
        readonly eventId: ContinuityEventId;
        readonly fields: ContinuityEventFields;
      }[];
    }
  | {
      readonly type: "UpdateContinuityEvents";
      readonly events: readonly {
        readonly eventId: ContinuityEventId;
        readonly fields: ContinuityEventFields;
      }[];
    }
  // ---------- Presentasjon (M8 del 1, DEC-0061) ----------
  | {
      readonly type: "AddRelations";
      readonly items: readonly {
        readonly relationId: AssetRelationId;
        readonly fields: RelationFields;
      }[];
    }
  | {
      readonly type: "UpdateRelations";
      readonly items: readonly {
        readonly relationId: AssetRelationId;
        readonly fields: RelationFields;
      }[];
    }
  | {
      /** Angre godkjenning/opprettelse av relasjoner: radene slettes (ressursene kan da angres). */
      readonly type: "UndoAddRelations";
      readonly relationIds: readonly AssetRelationId[];
    }
  | {
      readonly type: "SetRelationsRemoved";
      readonly relationIds: readonly AssetRelationId[];
      readonly removed: boolean;
    }
  | { readonly type: "CreatePoster"; readonly posterId: PosterId; readonly fields: PosterFields }
  | { readonly type: "UndoCreatePoster"; readonly posterId: PosterId }
  | { readonly type: "UpdatePoster"; readonly posterId: PosterId; readonly fields: PosterFields }
  | { readonly type: "SetPosterRemoved"; readonly posterId: PosterId; readonly removed: boolean }
  /** Filmens visuelle stil for AI (DEC-0065). */
  | {
      readonly type: "CreateStyleProfile";
      readonly profileId: StyleProfileId;
      readonly fields: StyleProfileFields;
    }
  | { readonly type: "UndoCreateStyleProfile"; readonly profileId: StyleProfileId }
  | {
      readonly type: "UpdateStyleProfile";
      readonly profileId: StyleProfileId;
      readonly fields: StyleProfileFields;
    }
  | {
      readonly type: "SetStyleProfileRemoved";
      readonly profileId: StyleProfileId;
      readonly removed: boolean;
    }
  /** Hva stilprofilen gjelder for (REQ-0148, DEC-0071). */
  | {
      readonly type: "SetStyleAppliesTo";
      readonly profileId: StyleProfileId;
      readonly appliesTo: readonly StyleUse[];
    }
  | {
      /** Slå en arvet kontinuitetshendelse av eller på i en avledet produksjon (DEC-0060, REQ-0166/0167). */
      readonly type: "SetContinuityEventDisabled";
      readonly eventId: ContinuityEventId;
      readonly productionId: ProductionId;
      readonly disabled: boolean;
    }
  | {
      readonly type: "SetContinuityEventsRemoved";
      readonly eventIds: readonly ContinuityEventId[];
      readonly removed: boolean;
    }
  | {
      /** Oversettelser (språkversjon, DEC-0058). Endrer aldri det norske manuset (REQ-0331). */
      readonly type: "AddTranslations";
      readonly items: readonly {
        readonly translationId: TranslationId;
        readonly fields: TranslationFields;
      }[];
    }
  | {
      readonly type: "UpdateTranslations";
      readonly items: readonly {
        readonly translationId: TranslationId;
        readonly fields: TranslationFields;
      }[];
    }
  | {
      readonly type: "SetTranslationsRemoved";
      readonly translationIds: readonly TranslationId[];
      readonly removed: boolean;
    }
  | { readonly type: "SetLineLink"; readonly linkId: string; readonly fields: LineLinkFields; readonly removed?: boolean }
  | { readonly type: "UndoAddLineLink"; readonly linkId: string }
  /** B-050: keep imported translated lines without a rule pair; older unpaired lines of the same scenes can be retired. */
  | { readonly type: "AddTranslationLines"; readonly items: readonly { readonly lineId: string; readonly fields: import("../translation/line-align-prompt").TranslationLineFields }[]; readonly removeLineIds?: readonly string[] }
  | { readonly type: "UndoAddTranslationLines"; readonly lineIds: readonly string[]; readonly restore: readonly import("../translation/line-align-prompt").TranslationLine[] }
  | { readonly type: "ApproveLineLinks"; readonly linkIds: readonly string[]; readonly additions?: readonly { readonly linkId: string; readonly fields: LineLinkFields }[] }
  | { readonly type: "RejectLineLinks"; readonly linkIds: readonly string[]; readonly removed: boolean }
  | { readonly type: "RestoreLineLinks"; readonly items: readonly import("../translation/line-align-prompt").TranslationLineLink[] }
  /** P8 (REQ-0137–0145): et harmonisert bilde lagret som ny versjon, med metadata om kilden. */
  | {
      readonly type: "ApplyHarmonizedImage";
      readonly harmonizationId: string;
      readonly variantId: AssetVariantId;
      readonly versionId: AssetVersionId;
      readonly media: AssetMedia;
      readonly note: string;
      readonly fields: import("../generation/style-harmonize").StyleHarmonizationFields;
      /** Ny variant («Harmonisert – …») når bildet ikke skal inn i en eksisterende variant. */
      readonly newVariant?: { readonly assetId: AssetId; readonly fields: AssetVariantFields; /** «Bare her» (REQ-0141): varianten arkiveres, så ressursens bibliotek ikke endres. */ readonly archived?: boolean };
    }
  | { readonly type: "UndoApplyHarmonizedImage"; readonly harmonizationId: string; readonly variantId: AssetVariantId; readonly versionId: AssetVersionId; readonly createdVariant: boolean }
  /** Endrer bruksvalget eller fjerner metadataen (removed). Originalbildet røres aldri. */
  | { readonly type: "SetStyleHarmonization"; readonly harmonizationId: string; readonly fields: import("../generation/style-harmonize").StyleHarmonizationFields; readonly removed?: boolean }
  | { readonly type: "UndoAddStyleHarmonization"; readonly harmonizationId: string }
  | { readonly type: "RestoreStyleHarmonizations"; readonly items: readonly import("../generation/style-harmonize").StyleHarmonization[] }
  /** REQ-0144: foretrukket referanse per (karakter, stilprofil) – bytter pekeren atomisk. */
  | { readonly type: "SetPreferredStyleReference"; readonly referenceId: string; readonly fields: import("../generation/style-harmonize").StylePreferredReferenceFields }
  | { readonly type: "UndoSetPreferredStyleReference"; readonly addedId: string | null; readonly restored: readonly import("../generation/style-harmonize").StylePreferredReference[] }
  /** Story Lab (SL1): karakterprofil – oppretter eller erstatter profilen for ressursen. */
  | {
      readonly type: "SetStoryProfile";
      readonly profileId: StoryProfileId;
      readonly assetId: AssetId;
      readonly profile: StoryProfile;
    }
  | { readonly type: "UndoCreateStoryProfile"; readonly profileId: StoryProfileId }
  /** Fjerner (removed: true) eller henter tilbake (false) profilen. Stadier og fakta røres ikke. */
  | {
      readonly type: "RemoveStoryProfile";
      readonly profileId: StoryProfileId;
      readonly removed: boolean;
    }
  | {
      readonly type: "AddStoryProfileStage";
      readonly stageId: StoryProfileStageId;
      readonly assetId: AssetId;
      readonly fromSceneId: SceneId;
      readonly patch: StoryProfilePatch;
    }
  | { readonly type: "UndoAddStoryProfileStage"; readonly stageId: StoryProfileStageId }
  | {
      readonly type: "UpdateStoryProfileStage";
      readonly stageId: StoryProfileStageId;
      readonly fromSceneId: SceneId;
      readonly patch: StoryProfilePatch;
    }
  | {
      readonly type: "RemoveStoryProfileStage";
      readonly stageId: StoryProfileStageId;
      readonly removed: boolean;
    }
  | {
      readonly type: "AddStoryFact";
      readonly factId: StoryFactId;
      readonly fields: StoryFactFields;
    }
  | { readonly type: "UndoAddStoryFact"; readonly factId: StoryFactId }
  | {
      readonly type: "UpdateStoryFact";
      readonly factId: StoryFactId;
      readonly fields: StoryFactFields;
    }
  | { readonly type: "RemoveStoryFact"; readonly factId: StoryFactId; readonly removed: boolean }
  // ---------- Skrivecanvaset (SL7) ----------
  | {
      readonly type: "AddCanvasNodes";
      readonly nodes: readonly (CanvasNodeFields & { readonly id: CanvasNodeId })[];
    }
  | { readonly type: "UndoAddCanvasNodes"; readonly nodeIds: readonly CanvasNodeId[] }
  | {
      readonly type: "UpdateCanvasNode";
      readonly nodeId: CanvasNodeId;
      readonly patch: Partial<CanvasNodeFields>;
    }
  | {
      readonly type: "MoveCanvasNodes";
      readonly moves: readonly {
        readonly nodeId: CanvasNodeId;
        readonly x: number;
        readonly y: number;
        readonly w?: number;
        readonly h?: number;
      }[];
    }
  | {
      /**
       * Fjerner (removed: true) nodene og kantene deres, eller tar dem tilbake (removed: false). Ved
       * tilbakeføring gjelder `edgeIds` (kantene som ble fjernet sammen med nodene).
       */
      readonly type: "RemoveCanvasNodes";
      readonly nodeIds: readonly CanvasNodeId[];
      readonly removed: boolean;
      readonly edgeIds?: readonly CanvasEdgeId[];
    }
  | {
      readonly type: "AddCanvasEdge";
      readonly edgeId: CanvasEdgeId;
      readonly fields: CanvasEdgeFields;
    }
  | { readonly type: "UndoAddCanvasEdge"; readonly edgeId: CanvasEdgeId }
  | {
      readonly type: "UpdateCanvasEdge";
      readonly edgeId: CanvasEdgeId;
      readonly patch: Partial<Pick<CanvasEdgeFields, "label" | "kind">>;
    }
  | { readonly type: "RemoveCanvasEdge"; readonly edgeId: CanvasEdgeId; readonly removed: boolean };

/** En oversettelse av en manuslinje eller et scenehode (DEC-0058). */
export interface TranslationFields {
  readonly blockId: BlockId | null;
  readonly variantId: VariantId | null;
  readonly language: string;
  readonly text: string;
  readonly basedOnRev: number;
  readonly status: "approved" | "uncertain";
}

/** En kontinuitetshendelse (DEC-0055). */
/** En relasjon mellom to ressurser (DEC-0061). */
export interface RelationFields {
  readonly fromAssetId: AssetId;
  readonly toAssetId: AssetId;
  readonly kind: RelationKind;
  readonly label: string;
  readonly description: string;
  readonly status: "approved" | "dismissed";
}

/** En plakat eller et karakterkart; alle feltene erstattes samlet (DEC-0061). */
export interface StyleProfileFields {
  readonly name: string;
  readonly isDefault: boolean;
  readonly guide: StyleGuide;
}

export interface PosterFields {
  readonly productionId: ProductionId;
  readonly name: string;
  readonly kind: PosterKind;
  readonly language: "nb" | "en";
  readonly widthMm: number;
  readonly heightMm: number;
  readonly document: PosterDocument;
}

export interface ContinuityEventFields {
  readonly assetId: AssetId;
  readonly kind: ContinuityKind;
  readonly description: string;
  readonly fromVariantId: AssetVariantId | null;
  readonly toVariantId: AssetVariantId | null;
  readonly duration: ContinuityDuration;
  readonly sceneId: SceneId;
  readonly blockId: BlockId | null;
  readonly untilSceneId: SceneId | null;
  readonly status: "approved" | "dismissed";
  /** Lokal for en avledet produksjon (DEC-0060). Utelatt ved endring = uendret; null = hovedfilmens. */
  readonly productionId?: ProductionId | null;
}

/** En del av et klipp (DEC-0048). Rekkefølgen er rekkefølgen i lista. */
export interface ClipPartFields {
  readonly partId: ClipPartId;
  readonly source: "take" | "composition";
  readonly takeId: TakeId | null;
  readonly inMs: number;
  readonly outMs: number;
  /** Myk overgang inn i delen fra delen før (ms, 0–5000), DEC-0071. */
  readonly transitionMs?: number;
}

/** Tidskobling for en manusblokk (DEC-0048). */
export interface TimeLinkFields {
  readonly occurrenceId: OccurrenceId;
  readonly blockId: BlockId;
  readonly startMs: number;
  readonly endMs: number | null;
  /** Hendelse i 2D-scenen: laget den gjelder (tiden er da i 2D-scenens egen tid). DEC-0051. */
  readonly layerId?: LayerId | null;
}

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
