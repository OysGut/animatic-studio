import type { AnimationRig, AnimationRigVersion, AnimationUse } from "./animation/rig";
import type { LipsyncResult } from "./animation/lipsync";
import type { AnimationPattern } from "./animation/patterns";
/**
 * Domenemodell (docs/architecture/DOMAIN_MODEL.md, DATA_RELATIONSHIPS.md).
 * Tilstanden speiler databasetabellene. Alle entiteter har permanent `id` og `revision`
 * (samtidighetskontroll, INV-C1). Ingen entitet har scenenummer som nøkkel (INV-02).
 */
import type {
  AnnotationId,
  AssetId,
  AudioClipId,
  ClipPartId,
  CompositionId,
  TimeLinkId,
  GenerationPromptId,
  ContinuityEventId,
  TranslationId,
  LayerId,
  AssetVariantId,
  AssetVersionId,
  BlockId,
  OccurrenceId,
  ProductionId,
  AssetRelationId,
  PosterId,
  StyleProfileId,
  ProjectId,
  SceneId,
  SegmentId,
  TakeId,
  UserId,
  VariantId,
  StoryProfileId,
  StoryProfileStageId,
  StoryFactId,
  CanvasNodeId,
  CanvasEdgeId,
} from "./ids";
import type { Rational } from "./time";
import type { DurationAssumptions } from "./screenplay/duration";
import type { StoryProfile, StoryProfilePatch } from "./storylab/profile";

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
  readonly code?: string | null;
  readonly capture?: import("./interchange/settings").CaptureSettings;
  /** Bildefrekvens for hele prosjektet (DEC-0039). */
  readonly fps: Rational;
  /** Bildeformat for hele prosjektet i piksler (DEC-0039); alle 2D-scener følger det. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly primaryLanguage: typeof PRIMARY_LANGUAGE;
  readonly scriptLanguage?: string | null;
  /** Overgangen scener får når de ikke har en egen (DEC-0051, REQ-0577). Mangler = kutt. */
  readonly defaultTransition?: Transition;
  /**
   * AI-budsjett (DEC-0053, REQ-0282/0284): høyeste antall AI-genereringer per kalendermåned for hele
   * prosjektet. Mangler = bare de faste grensene. Settes av eieren.
   */
  readonly aiMonthLimit?: number;
  /** Anslått pris per AI-bilde (kreditter), satt av eieren; mangler = ukjent (REQ-0279–0281). */
  readonly aiPricePerImage?: number;
  /** Antakelsene for varighetsestimatet, felles for prosjektet (KI-28, migrasjon 0028). Mangler = standard. */
  readonly durationAssumptions?: DurationAssumptions;
  /** Aktiv kvalitetsprofil (M8, migrasjon 0063). Mangler/null = oppførselen er som før profilene fantes. */
  readonly activeQualityProfileId?: string | null;
}

export interface Production extends Entity<ProductionId> {
  readonly kind: ProductionKind;
  readonly name: string;
  readonly parentProductionId: ProductionId | null;
  readonly fps: Rational;
  /** Eksportinnstillingene sist brukt for produksjonen (DEC-0072, REQ-0407, migrasjon 0027). */
  readonly exportSettings?: ExportSettings | null;
  /**
   * Notat om hva produksjonen er (DEC-0082, migrasjon 0031): vises på prosjektlisten. Mangler/tom = ingen.
   */
  readonly note?: string;
  /** Når produksjonen ble laget (settes av databasen; bare lest). */
  readonly createdAt?: string;
}

/** Bildetyper som kan vises og eksporteres som stillbilde (dekodes likt i visning og eksport, DEC-0072). */
export const STILL_MIME_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

/** Lagrede eksportinnstillinger (DEC-0072). */
export interface ExportSettings {
  readonly size: "full" | "half";
  readonly monochrome: boolean;
  readonly output: "video" | "dialogue";
  /**
   * Tittelsiden i manuseksporten, én linje per element (KI-20): lest ved import og endret i
   * eksportdialogen. Mangler = ikke satt (prosjektnavnet foreslås); tom liste = ingen tittelside.
   */
  readonly titlePage?: readonly string[];
  /**
   * «Inkluder rulletekst» i eksporten (MTS MT8, §26/§57): filtrerer bort forekomster med kind «credits»
   * bare i eksporten; ingenting slettes eller deaktiveres. Mangler = på (standard).
   */
  readonly includeCredits?: boolean;
}

/** Største lagrede eksportinnstillinger i byte (sjekken i migrasjon 0027 er 4096 byte for jsonb). */
export const EXPORT_SETTINGS_MAX_BYTES = 4096;
/** Grensen tittelsiden kortes til, med margin for jsonb-lagringen og de andre feltene. */
export const TITLE_PAGE_MAX_BYTES = 3200;
/** Flest linjer og lengste linje på en lagret tittelside. */
export const TITLE_PAGE_MAX_LINES = 40;
export const TITLE_PAGE_MAX_LINE = 300;

/** Standard eksportinnstillinger (som i eksportdialogen for animatic) når bare tittelsiden er satt. */
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  size: "full",
  monochrome: false,
  output: "video",
};

/** Fjerner et halvt tegnpar (emoji o.l.) som ble kuttet på slutten. */
function noLoneSurrogate(text: string): string {
  return text.replace(/[\uD800-\uDBFF]$/, "");
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Tittelsiden tilpasset lagringsgrensen (KI-20): tomme linjer fjernes, lange linjer og for mange linjer
 * kortes, og summen holdes under TITLE_PAGE_MAX_BYTES. `truncated` sier om noe ble kortet bort.
 */
export function fitTitlePage(lines: readonly string[]): {
  readonly lines: readonly string[];
  readonly truncated: boolean;
} {
  let truncated = false;
  const out: string[] = [];
  let used = 2; // [ ]
  for (const raw of lines) {
    const line = String(raw).trim();
    if (!line) continue;
    if (out.length >= TITLE_PAGE_MAX_LINES) {
      truncated = true;
      break;
    }
    let l = line;
    if (l.length > TITLE_PAGE_MAX_LINE) {
      l = noLoneSurrogate(l.slice(0, TITLE_PAGE_MAX_LINE)).trimEnd();
      truncated = true;
    }
    // JSON-tekst med anførselstegn og komma; tegn som må skrives med \ teller dobbelt
    let cost = utf8Bytes(JSON.stringify(l)) + 1;
    while (used + cost > TITLE_PAGE_MAX_BYTES && l.length > 0) {
      const over = Math.max(1, used + cost - TITLE_PAGE_MAX_BYTES);
      l = noLoneSurrogate(l.slice(0, Math.max(0, l.length - over))).trimEnd();
      cost = utf8Bytes(JSON.stringify(l)) + 1;
      truncated = true;
    }
    if (!l) {
      truncated = true;
      break;
    }
    out.push(l);
    used += cost;
  }
  return { lines: out, truncated };
}

/** Byte de lagrede eksportinnstillingene tar som JSON (UTF-8). */
export function exportSettingsBytes(x: ExportSettings): number {
  return utf8Bytes(JSON.stringify(x));
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
  readonly scriptLanguage?: string | null;
  readonly sceneId: SceneId;
  /** null = delt hovedvariant; ellers eid av én produksjon (24.5). */
  readonly ownerProductionId: ProductionId | null;
  readonly basedOnVariantId: VariantId | null;
  readonly heading: SceneHeading;
  /** Usikker tolkning av overskriften ved import (mandat 4.3 punkt 9). null = avklart. */
  readonly uncertainty: string | null;
}

export interface ScriptBlock extends Entity<BlockId> {
  readonly scriptLanguage?: string | null;
  readonly speechLanguage?: string | null;
  readonly variantId: VariantId;
  readonly kind: BlockKind;
  readonly orderKey: string;
  readonly currentRev: number;
  readonly text: string; // tekst i gjeldende revisjon (current_rev)
  readonly language: typeof PRIMARY_LANGUAGE;
  /** Hvor blokken kom fra i originaldokumentet (side og høyde), for sammenligning med originalen (mandat 4.2). */
  readonly sourceRef: { readonly page: number; readonly y: number; readonly documentId?: string } | null;
  /** Usikker tolkning ved import (mandat 4.3 punkt 9). null = avklart. */
  readonly uncertainty: string | null;
  /** Fjernet fra manuset (historikken beholdes; kan gjenopprettes). Fjernede blokker vises ikke. */
  readonly removed: boolean;
}

/**
 * Innholdsmessig grunnlag for materiale (REQ-0022, DEC-0054, DEC-0078): manuslinjenes revisjoner og
 * ressursversjonene materialet er laget fra.
 */
export interface ProducedFrom {
  readonly blockRevisions: Readonly<Record<string, number>>;
  /**
   * Ressursversjonene scenen viste da materialet ble laget eller sist godkjent (ressurs-ID → versjons-ID,
   * REQ-0022). Dekker også lag som følger varianten (ikke låst) og importert film (scenens 2D-scene da
   * filmen ble lagt inn). Mangler = ikke kjent (laget før feltet fantes); da flagges ingenting herfra.
   */
  readonly assetVersions?: Readonly<Record<string, string>>;
}

/** Uforanderlig historikk for blokktekst (DEC-0020 pkt. 5). */
export interface BlockRevision {
  readonly blockId: BlockId;
  readonly rev: number;
  readonly text: string;
  readonly author: UserId;
  readonly createdAt: string;
}

/**
 * Scenetypen til en forekomst (MTS MT6, migrasjon 0050): «scene» er en vanlig manusscene. «title»
 * (filmtittel), «text» (tekstscene) og «credits» (rulletekst) er deler av filmen, ikke av manuset: de
 * vises aldri i manusvisningen (unntatt som markør), nummereres aldri og hoppes over av manusutforskeren,
 * den automatiske gjenkjenningen (OG2) og oversettelseskoblingen. Mangler = «scene».
 */
export type OccurrenceKind = "scene" | "title" | "text" | "credits";
export const OCCURRENCE_KINDS: readonly OccurrenceKind[] = ["scene", "title", "text", "credits"];

/** Scenetypen (mangler = «scene»). */
export function occurrenceKind(o: { readonly kind?: OccurrenceKind }): OccurrenceKind {
  return o.kind ?? "scene";
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
  /** Overgangen inn i scenen i filmen (DEC-0047). Mangler = kutt. */
  readonly transition?: Transition;
  /** Scenen vises og eksporteres i svart-hvitt (DEC-0051, REQ-0574). */
  readonly monochrome?: boolean;
  /**
   * Brukerens planlagte lengde for scenen i millisekunder (mandat 7.1–7.2, REQ-0111/0113): erstatter
   * manusestimatet til 2D-scenen har satt lengde eller filmen er lagt inn. Mangler = ingen plan.
   */
  readonly plannedMs?: number;
  /**
   * Brukerens instrukser til AI-video av scenen (DEC-0083, migrasjon 0032): hva som skal skje og hvordan
   * figurene skal spille. Sendes sammen med filmens stil og figurenes beskrivelser. Mangler/tom = ingen.
   */
  readonly videoInstructions?: string;
  /** Scenetypen (MTS MT6). Mangler = «scene». */
  readonly kind?: OccurrenceKind;
  /** Arbeidsstatus (B-118, migrasjon 0083). Mangler = ingen status. */
  readonly workStatus?: import("./assembly/scene-marks").WorkStatus;
  /** Scenefarge som palettnøkkel (B-118, migrasjon 0083). Mangler = ingen farge. */
  readonly color?: import("./assembly/scene-marks").SceneColor;
}

/**
 * Overgang mellom scener (mandat 15, REQ-0223, DEC-0051): kutt, overtoning, via svart, via hvitt, tørk
 * (wipe), skyv (push) og iris.
 */
export type TransitionKind = "cut" | "dissolve" | "dip" | "dipWhite" | "wipe" | "push" | "iris";

export const TRANSITION_KINDS: readonly TransitionKind[] = [
  "cut",
  "dissolve",
  "dip",
  "dipWhite",
  "wipe",
  "push",
  "iris",
];

export interface Transition {
  readonly kind: TransitionKind;
  /** Lengde i bilder (0 for kutt). */
  readonly frames: number;
  /**
   * Overlapp (DEC-0051, REQ-0576): scenen skyves inn over slutten av forrige scene, og filmen blir kortere
   * med overgangens lengde. Uten overlapp ligger overgangen midt på klippet, og lengden endres ikke.
   */
  readonly overlap?: boolean;
}

/** Lengste overgang i bilder. */
export const MAX_TRANSITION_FRAMES = 600;

export interface ProductionSegment extends Entity<SegmentId> {
  readonly occurrenceId: OccurrenceId;
  readonly reason: SegmentReason;
  readonly orderKey: string;
  readonly startBlockId: BlockId | null;
  readonly endBlockId: BlockId | null;
  /**
   * Tidsrommet i scenen (ms fra scenens start) for segmenter til generering (DEC-0053). Slike segmenter
   * er ikke festet til manusblokker, så manuset kan redigeres fritt; blokkene i segmentet regnes ut fra
   * tiden.
   */
  readonly startMs?: number;
  readonly endMs?: number;
}

export interface Take extends Entity<TakeId> {
  readonly occurrenceId: OccurrenceId;
  readonly segmentId: SegmentId | null;
  readonly kind: TakeKind;
  readonly status: TakeStatus;
  readonly durationFrames: number | null;
  /** Grunnlag for avviksdeteksjon: hvilke blokkrevisjoner og ressursversjoner materialet ble laget fra. */
  readonly producedFrom: ProducedFrom;
  /**
   * Manuset versjonen sist er godkjent mot (DEC-0054). `producedFrom` er uforanderlig (INV-07); en
   * godkjenning av manusendringer lagres her. Mangler = som `producedFrom`.
   */
  readonly acceptedFrom?: ProducedFrom;
  readonly mediaRef: string | null;
  /** Filinformasjon for importert film (DEC-0047). Uforanderlig, som mediaRef. */
  readonly media?: TakeMedia;
  /**
   * Dialogen i filmens egen lyd (DEC-0059, REQ-0341/0342): språkkoden når dialog og øvrig lyd er blandet,
   * eller «none» når lyden bare er musikk og effekter. Mangler = ikke angitt (regnes som blandet med
   * norsk dialog, hovedspråket).
   */
  readonly audioLanguage?: string;
  /**
   * Hvilken del av manuset filmen dekker (REQ-0237, DEC-0071): første og siste manuslinje. Mangler = hele
   * scenen. Avvik fra manuset gjelder da bare linjene i dette området.
   */
  readonly coverage?: TakeCoverage | null;
  /** Ressursversjoner gjennomgått med «Behold» i arbeidslisten (DEC-0072, migrasjon 0027). */
  readonly reviewedVersions?: readonly string[];
}

export interface TakeCoverage {
  readonly startBlockId: string;
  readonly endBlockId: string;
}

/** Metadata for en importert filmfil (REQ-0238), lest i nettleseren ved import. */
export interface TakeMedia {
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  /** Bilder per sekund i filen (gjennomsnitt), om det er kjent. */
  readonly fps: number | null;
  readonly durationMs: number;
  readonly videoCodec: string | null;
  readonly hasAudio: boolean;
}

// ---------- Ressursbibliotek (M3 del 1; mandat kap. 8–9, REQ-0121–0136, REQ-0146, REQ-0149) ----------

/** Ressurstype. «sound» = lydfil (dialog, musikk, effekter …) i samme bibliotek (mandat 13.2, DEC-0044). */
export type AssetKind =
  | "character"
  | "object"
  | "location"
  | "animal"
  | "environment"
  | "other"
  | "sound"
  /** Grafisk mal (MTS MT4, migrasjon 0049): versjonene bærer maldefinisjonen i `template`. */
  | "template"
  /** Font lagt til fra Google Fonts (B-098, migrasjon 0074): versjonene bærer fontpakken og `font`. */
  | "font";

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
  /**
   * Hva en lydressurs hører til (mandat 13.2, REQ-0204, DEC-0070): karakterer og andre ressurser, replikker,
   * scener, delsekvenser (segmenter), hendelser og produksjoner – med permanente ID-er. Bare lyd.
   */
  readonly soundLinks?: readonly SoundLink[];
  /**
   * Betegnelser som gjelder ressursen bare i bestemte manuslinjer (mandat 8.2, REQ-0127, DEC-0071): «onkel»
   * er Laurits i disse replikkene, uten at alle «onkel» blir Laurits. Linjene har permanente ID-er.
   */
  readonly contextNames?: readonly ContextName[];
  /**
   * Scenene elementet skal inn i (DEC-0088, migrasjon 0034): lagt til fra en scene med «Legg til element i
   * scenen» og valgt for flere scener. Vises med gul ramme i «I denne scenen» til det er dratt inn på
   * lerretet der, eller planen er fjernet.
   */
  readonly scenePlans?: readonly ScenePlan[];
  /** Stemmen karakteren får når dialog lages med AI (tekst til tale, DEC-0071). */
  readonly voice?: AssetVoice | null;
  /**
   * Slettet (DEC-0079, migrasjon 0029): ligger i «Slettede objekter» og kan hentes inn igjen eller slettes
   * for godt. Mangler = ikke slettet.
   */
  readonly removed?: boolean;
  /**
   * Visuelt faktaark (DEC-0080, migrasjon 0030): kort, engelsk beskrivelse av hvordan ressursen ser ut –
   * alder, kropp, ansikt, hår, klær, farger, kjennetegn – laget fra manuset og rettet av brukeren. Brukes i
   * bildebeskrivelsene i stedet for rå manusutdrag. Mangler/tom = ikke laget.
   */
  readonly visualBrief?: string;
  /**
   * Den globale ressursen prosjektressursen er hentet fra (GP2, migrasjon 0046). Bare en kobling (metadata):
   * filene er prosjektets egne kopier, så prosjektet virker uten tilgang til arbeidsgruppen.
   */
  readonly globalAssetId?: string;
}

/** Hvilken global versjon en prosjektversjon er kopiert fra (GP2). Bare metadata. */
export interface GlobalSource {
  readonly assetId: string;
  readonly variantId: string;
  readonly versionId: string;
}

export interface ContextName {
  readonly name: string;
  readonly blockIds: readonly string[];
}

export interface AssetVoice {
  /** Leverandør-ID fra leverandørkatalogen (REQ-0269); valideres mot katalogens talekapabilitet. */
  readonly provider: string;
  /** Stemmens ID hos leverandøren. */
  readonly voiceId: string;
  /** Navnet som vises (fra leverandørens liste). */
  readonly label: string;
  readonly modelId?: string;
  readonly language?: string;
  readonly settings?: import("./dialogue/voice").SpeechSettings;
}

export type SoundLinkKind = "asset" | "block" | "scene" | "segment" | "event" | "production";

export interface SoundLink {
  readonly kind: SoundLinkKind;
  readonly id: string;
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
  /** Lengde i millisekunder for lydfiler (null for bilder). */
  readonly durationMs: number | null;
  /** Global versjon filen er kopiert fra (GP2). Mangler = prosjektets egen. */
  readonly globalSource?: GlobalSource;
  /**
   * Maldefinisjonen (MTS MT4, migrasjon 0049) når ressursen er en mal. Filen er en miniatyr av malen.
   * Uforanderlig som resten av versjonen.
   */
  readonly template?: import("./typography/template").TemplateDefinition;
  /** Fontmetadata (B-098, migrasjon 0074) når ressursen er en font. Filen er fontpakken. Uforanderlig. */
  readonly font?: import("./typography/project-fonts").FontSpec;
  /** Slettet bilde (DEC-0079): vises bare i «Slettede objekter». Selve bildet endres aldri. */
  readonly removed?: boolean;
  /**
   * Vinkelen bildet viser (DEC-0080, migrasjon 0030): front, side, bak … Et merke på bildet; selve bildet
   * endres aldri. Mangler = ikke merket.
   */
  readonly view?: import("./library/view").VersionView;
  /**
   * Lydkomposisjonen versjonen er miksen av (DEC-0094, migrasjon 0036). Mangler for vanlige opptak og bilder.
   */
  readonly composition?: import("./audio/composition").AudioComposition;
  /** Ord-til-lyd for replikken opptaket gjelder (DEC-0095, migrasjon 0037). Kan endres (manuelt eller ny analyse). */
  readonly alignment?: import("./audio/alignment").WordAlignment;
  /**
   * Versjonen denne er frilagt fra eller erstatter (REQ-0037, migrasjon 0069): permanent ID i stedet for
   * versjonsnummeret i merknaden. Mangler for eldre versjoner (opphavet slås da opp fra merknaden ved lesing).
   */
  readonly derivedFromVersionId?: AssetVersionId;
  /**
   * Avledede filer (B-105a, migrasjon 0078): arbeidskopi, avspillingsproxy og miniatyr – og rå TIFF når
   * versjonen er en renderbar konvertering. Uforanderlig som resten av versjonen; eldre versjoner mangler den.
   */
  readonly derivedFiles?: import("./library/image-ingest").DerivedImageFiles;
  /**
   * Rettigheter (B-114 C0, migrasjon 0080): kilde, lisens, kreditering, deling og bearbeiding.
   * Mangler = privat, alle rettigheter forbeholdt.
   */
  readonly rights?: import("./community").AssetRights;
}

/** Et element som skal inn i en scene (DEC-0088). */
export interface ScenePlan {
  readonly occurrenceId: string;
  /** Oppgaven (felles for alle scenene elementet ble planlagt i på én gang). */
  readonly taskId: string;
  /** Scenen elementet ble lagt til fra. */
  readonly fromOccurrenceId: string;
  /** Når planen ble laget (ISO). */
  readonly at: string;
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
  /** Løst er uavhengig av sletting; mangler på eldre sikkerhetskopier = åpent. */
  readonly resolved?: boolean;
  /** Slettet (kan angres). Slettede notater vises og eksporteres ikke. */
  readonly removed: boolean;
  /**
   * Merknad fra programmet (DEC-0088, migrasjon 0034), f.eks. «Teddybjørnen skal inn i scenen»: vises og
   * eksporteres som notat, merket som systemmerknad. Mangler = skrevet av en person.
   */
  readonly source?: "system";
  /** Oppgaven merknaden hører til (planen for et element i flere scener). */
  readonly taskId?: string;
  /** Notattype (AS3, migrasjon 0044). Mangler = vanlig notat. */
  readonly kind?: "trial_edit";
  /** Forsøksvis manusredigering (AS3, C2): den foreslåtte teksten for det markerte utdraget (`quote`). */
  readonly suggestedText?: string;
}

// ---------- 2D-sceneeditor (M3 del 2, mandat kap. 11–12, DEC-0035) ----------

/** Lagtype (mandat 11.1). Bestemmer standard dybde og hvordan laget vises i listen. */
export type LayerKind =
  | "background"
  | "midground"
  | "foreground"
  | "character"
  | "object"
  | "effect"
  | "other"
  /** Gruppe (DEC-0052, REQ-0174): viser ikke noe selv; lagene i gruppen følger dens bevegelse, synlighet og skalering. */
  | "group"
  /** Tekstlag (MTS, migrasjon 0048): redigerbar tekst og typografi i `text`. */
  | "text"
  /** Side (MTS MT6, migrasjon 0050): en side i en tittel- eller tekstscene. Oppfører seg som en gruppe
   * (lagene i den følger dens bevegelse og synlighet), med `activeRange` som synlighetsintervall og
   * `pageTransition` som overgangen inn i siden. */
  | "page";

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

/**
 * Blandingsmodus for et lag (mandat 11.2, REQ-0175): hvordan laget blandes med det som ligger under.
 * Mangler = «normal».
 */
export type BlendMode =
  "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "soft-light" | "color";

/**
 * Maske for et lag (mandat 11.2, REQ-0175). Rektangel og ellipse er i lagets egne piksler før
 * transformasjonen (0,0 = lagets øverste venstre hjørne), så masken flytter, skalerer og roterer med laget.
 * «layer»: et annet lag i samme 2D-scene der dekningen (alfa) bestemmer hva som vises (klippemaske).
 * `invert` snur masken (det utenfor vises).
 */
export type LayerMask =
  | {
      readonly kind: "rect" | "ellipse";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      /** Myk kant i piksler (0–200). */
      readonly feather: number;
      readonly invert: boolean;
    }
  | { readonly kind: "layer"; readonly layerId: string; readonly invert: boolean };

/** Egenskapene i lagets plassering som kan animeres. */
export type TransformProperty = keyof LayerTransform;
/**
 * Plassering og størrelse for en rektangel- eller ellipsemaske (DEC-0072, REQ-0175) som kan animeres med
 * samme nøkkelbilder som laget. Grunnverdien ligger i `mask` (x, y, width, height).
 */
export type MaskProperty = "maskX" | "maskY" | "maskWidth" | "maskHeight";
export type AnimatedProperty = TransformProperty | MaskProperty;
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "hold";

/** Nøkkelbilde for én egenskap (mandat 11.3, 12.5). Brukes av tidslinjen i neste leveranse. */
export interface Keyframe {
  readonly frame: number;
  readonly property: AnimatedProperty;
  readonly value: number;
  /** Hastighetskurve fram til neste nøkkelbilde. */
  readonly easing: Easing;
  /**
   * Styrken på ease ut av dette nøkkelbildet og inn i det neste, 0–1, som «influence» i After Effects
   * (DEC-0052, REQ-0582). Når en av dem er satt, brukes de i stedet for `easing` (unntatt «hold»).
   */
  readonly easeOut?: number;
  readonly easeIn?: number;
}

/** Bildeskifte i et lag (DEC-0052, REQ-0579): fra og med `frame` viser laget et annet bilde (hardt kutt). */
export interface ImageSwap {
  readonly frame: number;
  readonly assetId: AssetId;
  readonly assetVariantId: AssetVariantId | null;
  readonly versionId: AssetVersionId | null;
  /**
   * Overgang inn i bildet (Asset Studio AS2, A2): krysstoning over `frames` bilder fra `frame`. Mangler = hardt
   * kutt. Lagres i image_swaps (jsonb).
   */
  readonly transition?: { readonly kind: "crossfade"; readonly frames: number };
}

/** Lagets aktive tidsområde (AS2, A3): bildene fra og med `from` til og med `to`. */
export interface LayerActiveRange {
  readonly from: number;
  readonly to: number;
}

/** Punkt på en bevegelsesbane. `smooth`: kurvet gjennom punktet; ellers et hjørne (rette linjer). */
export interface PathPoint {
  readonly x: number;
  readonly y: number;
  readonly smooth: boolean;
}

/**
 * Bevegelsesbane for et lag (DEC-0052, REQ-0581/0582): laget følger banen fra `startFrame` til `endFrame`
 * med jevn fart langs banen, justert av ease ut/inn (0–1) og en tempokurve. Tempokurven er punkter
 * (andel av tiden → andel av veien) mellom start og slutt; de kan dras som midtpunktet i nivåer i Photoshop.
 */
export interface MotionPath {
  readonly points: readonly PathPoint[];
  readonly startFrame: number;
  readonly endFrame: number;
  readonly easeOut: number;
  readonly easeIn: number;
  readonly tempo: readonly { readonly t: number; readonly p: number }[];
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
  /**
   * Manusblokkenes revisjoner 2D-scenen er laget fra eller sist kontrollert mot (DEC-0054). Mangler eller
   * tomt = ukjent (laget før kontrollen fantes); da flagges ingen avvik.
   */
  readonly producedFrom?: ProducedFrom;
  /**
   * «Animer på toere» (DEC-0079): bevegelsen oppdateres bare hvert n-te bilde (1 = hvert bilde), som i stop
   * motion. Filmen beholder bildefrekvensen sin. Mangler = 1.
   */
  readonly step?: number;
  /** Låste tidsrom og fyll i ny tid (SV1, B-041, migrasjon 0042). Mangler = ingen. */
  readonly timing?: import("./composition/timing").CompositionTiming;
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
  /** Rigg & 2D-utskrift (B-087, migrasjon 0071): platen laget ligger på i scenens multiplanrigg, eller null. */
  readonly rigPlateId?: string | null;
  /** Dybde/tykkelse på platen for laget i mm (B-090 pkt 6, standard 0; brukes av 3D-print senere). */
  readonly rigPlateDepthMm?: number;
  readonly transform: LayerTransform;
  readonly keyframes: readonly Keyframe[];
  readonly visible: boolean;
  readonly locked: boolean;
  /** Gruppe (mandat 11.2): ID-en til gruppelaget laget hører til (DEC-0052), eller null. */
  readonly groupId: string | null;
  /** Bildeskifter i laget, sortert etter bilde (DEC-0052). */
  readonly swaps: readonly ImageSwap[];
  /** Bevegelsesbane som styrer posisjonen (DEC-0052), eller null. */
  readonly path: MotionPath | null;
  /** Gruppens ankerpunkt i scenen (bare gruppelag): der gruppen roteres og skaleres rundt. */
  readonly anchor: { readonly x: number; readonly y: number } | null;
  /**
   * Språkavhengige bilder (DEC-0059, REQ-0337): en annen variant av samme ressurs i en språkversjon (f.eks.
   * et skilt med engelsk tekst). Mangler = samme bilde i alle språk. Bildeskifter i laget gjelder fortsatt.
   */
  readonly languageImages?: readonly LanguageImage[];
  /** Maske (REQ-0175, migrasjon 0026). Mangler/null = ingen maske. */
  readonly mask?: LayerMask | null;
  /**
   * Ressursversjoner brukeren har gått gjennom og valgt å beholde det gamle bildet mot (arbeidslisten for
   * oppdaterte ressurser, DEC-0072, migrasjon 0027). Mangler = ingen.
   */
  readonly reviewedVersions?: readonly string[];
  /** Blandingsmodus (REQ-0175, migrasjon 0026). Mangler = «normal». */
  readonly blend?: BlendMode;
  /** Aktivt tidsområde (AS2, migrasjon 0043): laget tegnes bare innenfor. Mangler/null = hele scenen. */
  readonly activeRange?: LayerActiveRange | null;
  /** Tekst og typografi (MTS, migrasjon 0048). Bare tekstlag. */
  readonly text?: import("./typography/types").TextSpec | null;
  /** Grafisk form for en fargeflate (MTS, migrasjon 0048). Mangler = rektangel. */
  readonly shape?: import("./typography/types").ShapeSpec | null;
  /** Skygge, glød og kontur (MTS, migrasjon 0048). Mangler = ingen. */
  readonly effects?: import("./typography/types").LayerEffects | null;
  /** Malforekomsten og feltet laget er bygget fra (MTS MT4). Mangler = ikke fra mal. */
  readonly template?: import("./typography/types").TemplateSlotRef | null;
  /** Overgangen inn i siden (bare sidelag, MTS MT6, migrasjon 0050). Mangler = kutt. */
  readonly pageTransition?: Transition | null;
  readonly removed: boolean;
}

/** Et språkavhengig bilde i et lag (DEC-0059). */
export interface LanguageImage {
  readonly language: string;
  readonly assetVariantId: AssetVariantId;
  /** Låst versjon, eller null = variantens godkjente/nyeste. */
  readonly versionId: AssetVersionId | null;
}

/** Lydtyper på egne spor (mandat 13.1). */
export type AudioKind = "dialogue" | "narration" | "sfx" | "ambience" | "music";

/**
 * Et lydklipp i filmen (M4 del 2, mandat 13, DEC-0044). Festet til en scene (sceneforekomst) med start
 * målt fra scenens begynnelse, så lyden følger scenen når den flyttes (mandat 6.4). Tid i millisekunder
 * (uavhengig av bildefrekvensen). Lyden kan være lengre enn scenen og fortsette inn i neste.
 */
export interface AudioClip extends Entity<AudioClipId> {
  readonly occurrenceId: OccurrenceId;
  readonly kind: AudioKind;
  readonly name: string;
  /** Lydfilen: ressurs (type «sound»), eventuelt variant og låst versjon (null = godkjent/nyeste). */
  readonly assetId: AssetId;
  readonly assetVariantId: AssetVariantId | null;
  readonly versionId: AssetVersionId | null;
  /** Replikken lyden hører til (dialog), eller null. */
  readonly blockId: BlockId | null;
  /** Start i scenen (ms fra scenens begynnelse). */
  readonly offsetMs: number;
  /** Hvor i lydfilen klippet begynner (ms). */
  readonly sourceInMs: number;
  /** Klippets lengde (ms). */
  readonly lengthMs: number;
  /** Volum i desibel (0 = uendret). */
  readonly gainDb: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly muted: boolean;
  /**
   * Løper videre over flere scener (DEC-0045): starten er festet i scenen, men lyden fortsetter inn i de
   * neste scenene. Ellers stopper lyden ved slutten av scenen sin.
   */
  readonly continues: boolean;
  /** Volumpunkter (DEC-0045): nivå i dB på tidspunkter fra klippets start (ms), som i After Effects. */
  readonly volumeKeys: readonly VolumeKey[];
  /**
   * Språket lyden hører til (DEC-0059, REQ-0338/0340): språkkode, eller «*» for felles i alle språk.
   * Mangler = dialog og forteller hører til hovedspråket (norsk); musikk, atmosfære og effekter er felles.
   */
  readonly language?: string;
  /** Hastighet (DEC-0079): 0,25–4 (25–400 %). Tonehøyden følger hastigheten. Mangler = 1. */
  readonly speed?: number;
  /**
   * DV2 (migrasjon 0060): replikkens aktive lydversjon. Satt bare for dialog med replikk. Når satt, er
   * versjonen eneste kilde for fil og redigering; klippets fil- og redigeringsfelt er en speiling som bare
   * `mirrorDialogueClips` (src/core/dialogue) skriver. Mangler/null = vanlig lydklipp (musikk, effekter …).
   */
  readonly activeVersionId?: string | null;
  /** DV2: karakteren (ressurs) som sier replikken. Mangler/null = ikke koblet ennå. */
  readonly characterAssetId?: string | null;
  readonly speechLanguage?: string | null;
  readonly placementEstimated?: boolean;
  readonly removed: boolean;
}

/** Et volumpunkt i et lydklipp. */
export interface VolumeKey {
  /** Tid fra klippets start (ms). */
  readonly t: number;
  /** Nivå i desibel (0 = uendret). */
  readonly db: number;
}

export interface ProjectState {
  readonly mouthSets: Readonly<Record<string, import("./interchange/mouth-types").MouthSet>>;
  readonly mouthTracks: Readonly<Record<string, import("./interchange/mouth-types").MouthTrack>>;
  readonly animationRigs: Readonly<Record<string, AnimationRig>>;
  readonly animationRigVersions: Readonly<Record<string, AnimationRigVersion>>;
  readonly animationUses: Readonly<Record<string, AnimationUse>>;
  /** CA5: leppesynk per replikk og take (migrasjon 0056). */
  readonly lipsyncResults: Readonly<Record<string, LipsyncResult>>;
  /** CA6: navngitte minianimasjonsmønstre (migrasjon 0056). */
  readonly animationPatterns: Readonly<Record<string, AnimationPattern>>;
  /** DV2: lydversjoner per replikkforekomst (migrasjon 0060). */
  readonly dialogueVersions: Readonly<Record<string, import("./dialogue/versions").DialogueVersion>>;
  /** DV7: gjennomganger av avvik mellom manus og lyd (migrasjon 0062). */
  readonly dialogueReviews: Readonly<Record<string, import("./dialogue/drift").DialogueReview>>;
  /** DV8: gule huskelapper (migrasjon 0062). */
  readonly noteFlags: Readonly<Record<string, import("./notes/flags").NoteFlag>>;
  /** M8: navngitte kvalitetsprofiler (migrasjon 0063). */
  readonly translationLineLinks: Readonly<Record<string, import("./translation/line-align-prompt").TranslationLineLink>>;
  /** B-050: imported translated lines without a rule pair (migration 0064). */
  readonly translationLines: Readonly<Record<string, import("./translation/line-align-prompt").TranslationLine>>;
  readonly qualityProfiles: Readonly<Record<string, import("./generation/quality-profile").QualityProfile>>;
  /** P8: metadata om harmoniserte versjoner (migrasjon 0065). */
  readonly styleHarmonizations: Readonly<Record<string, import("./generation/style-harmonize").StyleHarmonization>>;
  /** P8: foretrukket referanse per (karakter, stilprofil) (REQ-0144, migrasjon 0065). */
  readonly stylePreferredReferences: Readonly<Record<string, import("./generation/style-harmonize").StylePreferredReference>>;
  /** Rigg & 2D-utskrift (B-087, migrasjon 0071): riggmaler og rigger (standardrigg og per scene). */
  readonly measureSets?: Readonly<Record<string, import("./print/measure/commands").StoredMeasureSet>>;
  /** Rigg runde 5 (B-087, migrasjon 0079): utskriftsjobber og elementene deres. */
  readonly printJobs?: Readonly<Record<string, import("./print/job/commands").StoredPrintJob>>;
  readonly printJobElements?: Readonly<Record<string, import("./print/job/commands").StoredPrintJobElement>>;
  readonly rigTemplates: Readonly<Record<string, import("./rig/multiplane").RigTemplate>>;
  readonly rigSetups: Readonly<Record<string, import("./rig/multiplane").RigSetup>>;
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
  readonly audioClips: Readonly<Record<string, AudioClip>>;
  readonly clipParts: Readonly<Record<string, ClipPart>>;
  readonly timeLinks: Readonly<Record<string, TimeLink>>;
  readonly generationPrompts: Readonly<Record<string, GenerationPrompt>>;
  readonly continuityEvents: Readonly<Record<string, ContinuityEvent>>;
  /** Oversettelser av manuset (språkversjoner, DEC-0058). */
  readonly translations: Readonly<Record<string, Translation>>;
  /** ML3: språkversjoner per prosjekt (migrasjon 0066). Tomt for eldre prosjekter. */
  readonly languageVersions: Readonly<Record<string, import("./translation/language-versions").LanguageVersion>>;
  /** Relasjoner mellom karakterene (DEC-0061). */
  readonly assetRelations: Readonly<Record<string, AssetRelation>>;
  /** Plakater og karakterkart (DEC-0061). */
  readonly posters: Readonly<Record<string, Poster>>;
  /** Filmens visuelle stil for AI (DEC-0065): stilprofiler, én er standard. */
  readonly styleProfiles: Readonly<Record<string, StyleProfile>>;
  /** Story Lab (SL1, migrasjon 0039): karakterprofiler, stadier i karakterbuen og fakta. */
  readonly storyProfiles: Readonly<Record<string, StoryCharacterProfile>>;
  readonly storyProfileStages: Readonly<Record<string, StoryProfileStage>>;
  readonly storyFacts: Readonly<Record<string, StoryFact>>;
  /** Skrivecanvaset (SL7, migrasjon 0040): noder og kanter. */
  readonly canvasNodes: Readonly<Record<string, CanvasNode>>;
  readonly canvasEdges: Readonly<Record<string, CanvasEdge>>;
  /** Malforekomster (MTS MT4, migrasjon 0049). */
  readonly templateInstances: Readonly<Record<string, TemplateInstance>>;
  /** Rulletekst (MTS MT7, migrasjon 0051): deltakerregisteret og sekvensen per forekomst. */
  readonly creditParticipants: Readonly<Record<string, CreditParticipant>>;
  readonly creditSequences: Readonly<Record<string, CreditSequence>>;
}

/**
 * En mal brukt i én 2D-scene (MTS MT4, §12): låst malversjon og innholdet. Lagene som er bygget fra den,
 * peker hit med `CompositionLayer.template`.
 */
export interface TemplateInstance extends Entity<import("./ids").TemplateInstanceId> {
  readonly compositionId: CompositionId;
  readonly templateAssetId: AssetId;
  readonly templateVersionId: AssetVersionId;
  readonly values: import("./typography/template").TemplateValues;
  readonly removed: boolean;
}

// ---------- Rulletekst (MTS MT7, §16–26, migrasjon 0051) ----------

/**
 * En deltaker i rulleteksten (§17): adskilt fra malen. `fields` er valgfrie felt (nøkkel → tekst, f.eks.
 * navn, rolle, selskap); `groupKey` grupperer (f.eks. «Regi», «Medvirkende»). `hidden` skjuler uten å
 * slette. Logo- og bildereferanser peker på ressursversjoner i prosjektet.
 */
export interface CreditParticipant extends Entity<import("./ids").CreditParticipantId> {
  readonly orderKey: string;
  readonly groupKey: string;
  readonly hidden: boolean;
  readonly fields: Readonly<Record<string, string>>;
  readonly logoAssetId?: AssetId | null | undefined;
  readonly logoVersionId?: AssetVersionId | null | undefined;
  readonly imageAssetId?: AssetId | null | undefined;
  readonly imageVersionId?: AssetVersionId | null | undefined;
  readonly removed: boolean;
}

/** Presentasjonsformene for rulleteksten (§21). */
export type CreditPresentation = "roll" | "one_at_a_time" | "positions";
export const CREDIT_PRESENTATIONS: readonly CreditPresentation[] = [
  "roll",
  "one_at_a_time",
  "positions",
];

/**
 * Rulleteksten for én forekomst (kind «credits», §19–21): presentasjonsform, varighet per deltaker,
 * pause, overgang, hastighet, retning og malvariant per gruppe. Lagene for deltakerne lagres ikke –
 * de lages virtuelt av renderFrame fra mal, deltakere og tid (§63).
 */
export interface CreditSequence extends Entity<import("./ids").CreditSequenceId> {
  readonly occurrenceId: OccurrenceId;
  readonly presentation: CreditPresentation;
  /** Varighet per deltaker i bilder (one_at_a_time/positions). */
  readonly durationFrames: number;
  /** Pause mellom deltakerne i bilder. */
  readonly pauseFrames: number;
  /** Overgangen mellom deltakerne (mangler = kutt). */
  readonly transition?: Transition | null;
  /** Rullehastighet i piksler per bilde (roll). */
  readonly speed: number;
  /** Rulleretning (roll): opp (standard) eller ned. */
  readonly direction: "up" | "down";
  /** Malvariant per gruppe (groupKey → malversjon). Mangler = standardoppsettet. */
  readonly groupTemplates?: Readonly<Record<string, AssetVersionId>>;
  readonly removed: boolean;
}

/** Øvre grenser (§63, godkjent): 2000 deltakere; ingenting kuttes stille. */
export const CREDIT_PARTICIPANTS_MAX = 2000;

/**
 * En del av et klipp i filmen (DEC-0048, REQ-0220–0222, REQ-0239): et utsnitt [inMs, outMs) av en importert
 * film (versjon) eller av scenens 2D-scene. Har forekomsten deler, er klippet delene etter hverandre
 * (sortert på orderKey); ellers er klippet hele den aktive versjonen eller hele 2D-scenen. Kildemediet
 * endres aldri (trimming og splitting endrer bare delene).
 */
export interface ClipPart extends Entity<ClipPartId> {
  readonly occurrenceId: OccurrenceId;
  readonly orderKey: string;
  readonly source: "take" | "composition";
  readonly takeId: TakeId | null;
  readonly inMs: number;
  readonly outMs: number;
  /** Myk overgang (krysstoning) inn i delen fra delen før, i ms (DEC-0071, REQ-0265). Mangler = hardt kutt. */
  readonly transitionMs?: number;
  readonly removed: boolean;
}

/**
 * Tidskobling for en manusblokk (DEC-0048, REQ-0093–0095, REQ-0107): når replikken eller handlingen skjer
 * i scenen, målt i ms fra scenens begynnelse (lokal tid, så den følger scenen når den flyttes). En blokk kan
 * ha flere koblinger. endMs null = varer til neste blokk.
 */
export interface TimeLink extends Entity<TimeLinkId> {
  readonly occurrenceId: OccurrenceId;
  readonly blockId: BlockId;
  /**
   * Ms fra scenens begynnelse. For en hendelse i 2D-scenen (`layerId` satt) er tiden i 2D-scenens egen tid
   * (bildet i sceneeditoren), så den følger 2D-scenen også når klippet kuttes (DEC-0051).
   */
  readonly startMs: number;
  readonly endMs: number | null;
  /** Laget i 2D-scenen hendelsen gjelder (REQ-0095/0096), eller null for en tidskobling i scenen. */
  readonly layerId: LayerId | null;
  readonly removed: boolean;
}

/**
 * Egen beskrivelse for generering av et segment av en scene (DEC-0053, REQ-0252/0253/0256): det brukeren
 * har skrevet selv. Den automatiske beskrivelsen lagres ikke (den bygges alltid på nytt fra manus og
 * ressurser); `basedOn` er den automatiske slik den var da brukeren skrev sin, så det kan vises at
 * grunnlaget har endret seg. Fjernet = «bruk den automatiske».
 */
export interface GenerationPrompt extends Entity<GenerationPromptId> {
  readonly occurrenceId: OccurrenceId;
  readonly segmentId: SegmentId;
  readonly text: string;
  readonly basedOn: string;
  readonly removed: boolean;
}

/** Typer kontinuitetshendelser (REQ-0153). */
export const CONTINUITY_KINDS = [
  "haircut",
  "hair_color",
  "costume",
  "injury",
  "scar",
  "dirt",
  "snow_water",
  "beard",
  "aging",
  "carried_object",
  "other",
] as const;
export type ContinuityKind = (typeof CONTINUITY_KINDS)[number];

/**
 * Hvor lenge forandringen varer (REQ-0154): «permanent» fra hendelsen og fremover i fortellingstid,
 * «temporary» fram til og med `untilSceneId`, «scene» bare i scenen der den skjer.
 */
export type ContinuityDuration = "permanent" | "temporary" | "scene";

/**
 * Kontinuitetshendelse (DEC-0055, REQ-0150–0165): en karakter (eller annen ressurs) forandrer utseende i en
 * scene (og ev. ved en bestemt manusblokk). Utseendet før og etter er varianter av ressursen. Hvilket
 * utseende som gjelder i en scene, regnes etter fortellingstid (INV-09), ikke rekkefølge i filmen.
 * Forslag fra manuset lagres først når brukeren godkjenner eller avviser dem (REQ-0157/0158).
 */
/**
 * Oversettelse av en manuslinje eller et scenehode til et annet språk (M7 del 2, DEC-0058, REQ-0329–0339).
 * Hører til samme narrative replikk (blokk-ID-en). Endrer aldri det norske manuset (REQ-0331).
 * `basedOnRev`: revisjonen av den norske teksten som ble oversatt – er norsk endret siden, må oversettelsen
 * gjennomgås (REQ-0330). For scenehoder: 0.
 */
export interface Translation extends Entity<TranslationId> {
  /** Manuslinjen (null for scenehode). */
  readonly blockId: BlockId | null;
  /** Scenevarianten (scenehodet); null for manuslinjer. */
  readonly variantId: VariantId | null;
  /** Språkkode, f.eks. «en». */
  readonly language: string;
  readonly text: string;
  readonly basedOnRev: number;
  /** «uncertain»: automatisk koblet ved import og ikke godkjent ennå (REQ-0335). */
  readonly status: "approved" | "uncertain";
  readonly removed: boolean;
  /** ML3: språkversjonen raden hører til; mangler for eldre rader (avledes fra prosjekt + språk). */
  readonly languageVersionId?: string;
}

export interface ContinuityEvent extends Entity<ContinuityEventId> {
  readonly assetId: AssetId;
  readonly kind: ContinuityKind;
  /** Hva som skjer («klipper håret»). */
  readonly description: string;
  /** Utseendet før (null = ressursens standard). */
  readonly fromVariantId: AssetVariantId | null;
  /** Utseendet etter. */
  readonly toVariantId: AssetVariantId | null;
  readonly duration: ContinuityDuration;
  /** Scenen der forandringen skjer (stabil identitet, REQ-0156). */
  readonly sceneId: SceneId;
  /** Manusblokken der det skjer (null = fra starten av scenen). */
  readonly blockId: BlockId | null;
  /** Midlertidig tilstand: siste scene den gjelder i. */
  readonly untilSceneId: SceneId | null;
  /** «approved» brukes; «dismissed» er et avvist forslag (vises ikke, foreslås ikke igjen). */
  readonly status: "approved" | "dismissed";
  /**
   * Lokal hendelse (DEC-0060, REQ-0166): gjelder bare i denne avledede produksjonen. Mangler = hovedfilmens
   * hendelse, som spinoffene arver.
   */
  readonly productionId?: ProductionId;
  /** Avledede produksjoner der en arvet hendelse er slått av (REQ-0166/0167). Mangler = ingen. */
  readonly disabledIn?: readonly ProductionId[];
  readonly removed: boolean;
}

// ---------- Presentasjon (M8 del 1, DEC-0061, mandat kap. 26) ----------

/** Relasjonstyper i relasjonskartet (mandat 26.4, REQ-0393). «other» = brukerdefinert (navnet i `label`). */
export const RELATION_KINDS = [
  "family",
  "friendship",
  "conflict",
  "care",
  "romance",
  "mentor",
  "hidden",
  "other",
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

/**
 * En relasjon mellom to karakterer (eller andre ressurser), godkjent av brukeren (REQ-0394/0395). Forslag fra
 * manuset lagres ikke før de godkjennes; et avvist forslag lagres som «dismissed» så det ikke foreslås igjen.
 */
export interface AssetRelation extends Entity<AssetRelationId> {
  readonly fromAssetId: AssetId;
  readonly toAssetId: AssetId;
  readonly kind: RelationKind;
  /** Navnet på relasjonen («mor og datter»); tomt = typens navn. */
  readonly label: string;
  /** Forklarende tekst (mandat 26.3: forklarende relasjonstekster). */
  readonly description: string;
  readonly status: "approved" | "dismissed";
  readonly removed: boolean;
}

export type PosterKind = "pitch" | "character_map";

/** Tekst på norsk og engelsk (REQ-0404). */
export interface LocalizedText {
  readonly nb: string;
  readonly en: string;
}

/** Innholdsvalgene (mandat 26.3, REQ-0390). */
export interface PosterOptions {
  readonly imagesAndNamesOnly: boolean;
  readonly shortDescriptions: boolean;
  readonly longDescriptions: boolean;
  readonly relationLines: boolean;
  readonly namedRelations: boolean;
  readonly relationTexts: boolean;
  readonly objectImages: boolean;
  readonly objectDescriptions: boolean;
  readonly placeImages: boolean;
  readonly placeDescriptions: boolean;
  readonly logline: boolean;
  readonly genreMood: boolean;
  readonly projectData: boolean;
}

export type PosterFont = "serif" | "sans";

/**
 * Et element på plakaten (REQ-0398): tekst, bilde, flate, strek eller relasjonslinje. Mål i millimeter fra
 * plakatens øvre venstre hjørne (uten utfallende kant). `auto`: plassert av programmet – flyttes når
 * innholdet endres; settes til false når brukeren endrer elementet.
 */
export interface PosterElement {
  readonly id: string;
  readonly kind: "text" | "image" | "rect" | "line" | "relation";
  /** Hva elementet viser (for nytt utkast): tittel, karakter, sted … */
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation: number;
  readonly visible: boolean;
  readonly auto: boolean;
  /** Tekst (kind text). */
  readonly text?: LocalizedText;
  readonly font?: PosterFont;
  readonly bold?: boolean;
  readonly italic?: boolean;
  /** Skriftstørrelse i punkter. */
  readonly size?: number;
  readonly color?: string;
  readonly align?: "left" | "center" | "right";
  readonly uppercase?: boolean;
  /** Sperring (em/1000). */
  readonly tracking?: number;
  readonly lineHeight?: number;
  /** Bilde (kind image): ressurs, variant og låst versjon (null = godkjent/nyeste). */
  readonly assetId?: AssetId;
  readonly assetVariantId?: AssetVariantId | null;
  readonly versionId?: AssetVersionId | null;
  readonly fit?: "cover" | "contain";
  readonly opacity?: number;
  /** Flate/strek. */
  readonly fill?: string | null;
  readonly stroke?: string | null;
  readonly strokeWidth?: number;
  /** Stiplet strek (skjulte forbindelser). */
  readonly dashed?: boolean;
  readonly radius?: number;
  /** Relasjonslinje: relasjonen og elementene den går mellom. */
  readonly relationId?: AssetRelationId;
  readonly fromElementId?: string;
  readonly toElementId?: string;
  /**
   * Feltene brukeren har endret på et element programmet laget (f.eks. «x», «y», «text», «z» for
   * rekkefølgen). Ved ny komposisjon beholdes disse, resten følger innholdet. Mangler (eldre data): alt står.
   */
  readonly overrides?: readonly string[];
}

export interface PosterDocument {
  readonly version: 1;
  readonly options: PosterOptions;
  /** Prosjekttekster: tittel, logline, sjanger og stemning, undertittel. */
  readonly title: LocalizedText;
  readonly logline: LocalizedText;
  readonly genre: LocalizedText;
  readonly tagline: LocalizedText;
  /** Visuell stil: bakgrunn og farger. */
  readonly palette: {
    readonly name: string;
    readonly background: string;
    readonly text: string;
    readonly accent: string;
    readonly muted: string;
  };
  /** Ressursene plakaten viser (utvalget fra førsteutkastet, kan endres). */
  readonly characters: readonly AssetId[];
  readonly places: readonly AssetId[];
  readonly objects: readonly AssetId[];
  readonly elements: readonly PosterElement[];
}

/** En plakat eller et karakterkart (REQ-0501): selvstendig, redigerbart og lagret element for element. */
export interface Poster extends Entity<PosterId> {
  readonly productionId: ProductionId;
  readonly name: string;
  readonly kind: PosterKind;
  /** Språket plakaten vises og eksporteres på (REQ-0404). */
  readonly language: "nb" | "en";
  /** Format i millimeter (minst 700 × 1000 stående, REQ-0386). */
  readonly widthMm: number;
  readonly heightMm: number;
  readonly document: PosterDocument;
  readonly removed: boolean;
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
  audioClips: "audio_clips",
  clipParts: "clip_parts",
  timeLinks: "time_links",
  generationPrompts: "generation_prompts",
  continuityEvents: "continuity_events",
  translations: "translations",
  languageVersions: "language_versions",
  assetRelations: "asset_relations",
  posters: "posters",
  styleProfiles: "style_profiles",
  storyProfiles: "story_profiles",
  storyProfileStages: "story_profile_stages",
  storyFacts: "story_facts",
  canvasNodes: "story_canvas_nodes",
  canvasEdges: "story_canvas_edges",
  templateInstances: "template_instances",
  creditParticipants: "credit_participants",
  creditSequences: "credit_sequences",
  animationRigs: "animation_rigs",
  animationRigVersions: "animation_rig_versions",
  animationUses: "animation_uses",
  lipsyncResults: "lipsync_results",
  mouthSets: "mouth_sets",
  mouthTracks: "mouth_tracks",
  animationPatterns: "animation_patterns",
  dialogueVersions: "dialogue_versions",
  dialogueReviews: "dialogue_reviews",
  noteFlags: "note_flags",
  qualityProfiles: "quality_profiles",
  translationLines: "translation_lines",
  translationLineLinks: "translation_line_links",
  styleHarmonizations: "style_harmonizations",
  stylePreferredReferences: "style_preferred_references",
  measureSets: "measure_sets",
  printJobs: "print_jobs",
  printJobElements: "print_job_elements",
  rigTemplates: "rig_templates",
  rigSetups: "rig_setups",
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
    audioClips: {},
    clipParts: {},
    timeLinks: {},
    generationPrompts: {},
    continuityEvents: {},
    translations: {},
    languageVersions: {},
    assetRelations: {},
    posters: {},
    styleProfiles: {},
    storyProfiles: {},
    storyProfileStages: {},
    storyFacts: {},
    canvasNodes: {},
    canvasEdges: {},
    templateInstances: {},
    creditParticipants: {},
    creditSequences: {},
    animationRigs: {}, animationRigVersions: {}, animationUses: {},
    lipsyncResults: {}, animationPatterns: {},
    mouthSets: {}, mouthTracks: {},
    dialogueVersions: {},
    dialogueReviews: {},
    noteFlags: {},
    qualityProfiles: {},
    translationLineLinks: {},
    translationLines: {},
    styleHarmonizations: {},
    stylePreferredReferences: {},
    measureSets: {},
    printJobs: {},
    printJobElements: {},
    rigTemplates: {},
    rigSetups: {},
  };
}

export function mainProduction(state: ProjectState): Production | undefined {
  return Object.values(state.productions).find((p) => p.kind === "main");
}

// ---------- Filmens visuelle stil for AI (DEC-0065, REQ-0147, REQ-0245) ----------

/**
 * «Filmens visuelle bibel»: det en AI må vite om filmen for å lage bilder som hører hjemme i den – hva
 * filmen handler om, verden og tiden, stil, teknikk, farger, lys, stemning, regler for figurer og
 * omgivelser, og hva som skal unngås. Brukes i alle bildebeskrivelser (og beskrivelsene for video).
 * Tekstene skrives helst på engelsk (beskrivelsene som sendes er på engelsk, REQ-0015).
 */
export interface StyleGuide {
  readonly version: 1;
  /** Hva filmen handler om (kort). */
  readonly premise: string;
  /** Verden: sted, tid, epoke, årstid. */
  readonly world: string;
  /** Publikum og tone (f.eks. familiefilm, varm og litt skummel). */
  readonly audience: string;
  /** Den visuelle stilen samlet. */
  readonly visualStyle: string;
  /** Teknikk og materialer (f.eks. akvarell på papir, cut-out, myke kanter). */
  readonly technique: string;
  /** Fargepaletten: farger (#rrggbb) og beskrivelse. */
  readonly palette: { readonly colors: readonly string[]; readonly description: string };
  /** Lyssetting som gjelder filmen (scenenes tid på døgnet legges til automatisk). */
  readonly lighting: string;
  /** Stemning og følelse. */
  readonly mood: string;
  /** Regler for figurer (proporsjoner, ansikter, linjer …). */
  readonly characterDesign: string;
  /** Regler for omgivelser og bakgrunner. */
  readonly environmentDesign: string;
  /** Bildeutsnitt og kameraspråk. */
  readonly composition: string;
  /** Det som aldri skal være med. */
  readonly avoid: string;
  /** Egne, generelle instrukser til AI-en for prosjektet. */
  readonly instructions: string;
  /** Godkjente bilder som viser stilen (versjons-ID-er), helst 1–6. */
  readonly referenceVersionIds: readonly string[];
  /**
   * Den samlede beskrivelsen for hele prosjektet (DEC-0085): settes når brukeren redigerer den sammensatte
   * teksten. Da er dette den ene versjonen som sendes til all AI (bilder og video) i stedet for feltene.
   * Mangler/tom = teksten settes sammen av feltene (composeStyleText).
   */
  readonly prompt?: string;
}

export interface StyleProfile extends Entity<StyleProfileId> {
  readonly name: string;
  /** Standard for prosjektet (brukes i alle beskrivelser). Høyst én er standard. */
  readonly isDefault: boolean;
  readonly guide: StyleGuide;
  /**
   * Hva profilen gjelder for (REQ-0148, DEC-0071): ressurstyper, plakater, 2D-animatic og AI-video. Tomt =
   * bare der ingen annen profil gjelder (standardprofilen dekker resten).
   */
  readonly appliesTo?: readonly StyleUse[];
  readonly removed: boolean;
}

/** Bruk en stilprofil kan gjelde for (REQ-0148). */
export type StyleUse =
  | "character"
  | "animal"
  | "object"
  | "location"
  | "environment"
  | "other"
  | "poster"
  | "animatic"
  | "ai_video";

// ---------- Story Lab (SL1, migrasjon 0039) ----------

/** Karakterprofilen for én ressurs («character» eller «animal»). Høyst én aktiv per ressurs. */
export interface StoryCharacterProfile extends Entity<StoryProfileId> {
  readonly assetId: AssetId;
  readonly profile: StoryProfile;
  readonly removed: boolean;
}

/** Profilendring fra en scene i fortellingstid (karakterbuen). Høyst ett aktivt per karakter og scene. */
export interface StoryProfileStage extends Entity<StoryProfileStageId> {
  readonly assetId: AssetId;
  readonly fromSceneId: SceneId;
  readonly patch: StoryProfilePatch;
  readonly removed: boolean;
}

export type StoryFactKind = "fact" | "secret";

/** Hvem som kjenner et faktum, og fra hvilken scene (null = fra begynnelsen). */
export interface StoryFactKnower {
  readonly assetId: AssetId;
  readonly fromSceneId: SceneId | null;
}

/** Et faktum eller en hemmelighet. Uten `knownBy` vet bare regissøren om det. */
export interface StoryFact extends Entity<StoryFactId> {
  readonly text: string;
  readonly kind: StoryFactKind;
  /** Scenen der det skjer (null = gjelder fra begynnelsen). */
  readonly atSceneId: SceneId | null;
  readonly knownBy: readonly StoryFactKnower[];
  readonly removed: boolean;
}

// ---------- Skrivecanvaset i Story Lab (SL7) ----------
export type CanvasNodeKind =
  | "premise"
  | "plot"
  | "subplot"
  | "plot_point"
  | "turning_point"
  | "event"
  | "consequence"
  | "scene"
  | "character"
  | "location"
  | "relation"
  | "note"
  | "idea"
  | "alternative"
  | "group";

export type CanvasEdgeKind =
  "leads_to" | "causes" | "conflicts" | "relation" | "alternative_of" | "belongs_to";

/** Feltene i en canvasnode (alt unntatt id, revisjon og fjernet). */
export interface CanvasNodeFields {
  readonly kind: CanvasNodeKind;
  readonly title: string;
  readonly body: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Navnet på et fargetoken (for eksempel «accent-brand»), eller null for typens standard. */
  readonly color: string | null;
  readonly groupId: CanvasNodeId | null;
  readonly assetId: AssetId | null;
  readonly sceneId: SceneId | null;
}

export interface CanvasNode extends Entity<CanvasNodeId>, CanvasNodeFields {
  readonly removed: boolean;
}

export interface CanvasEdgeFields {
  readonly fromNodeId: CanvasNodeId;
  readonly toNodeId: CanvasNodeId;
  readonly label: string;
  readonly kind: CanvasEdgeKind;
}

export interface CanvasEdge extends Entity<CanvasEdgeId>, CanvasEdgeFields {
  readonly removed: boolean;
}
