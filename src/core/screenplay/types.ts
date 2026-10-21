/**
 * Manusformat (screenplay-engineering, ADR-0007). Plattformnøytrale typer for import, visning og eksport.
 */
import type { BlockKind, SceneHeading } from "../model";

/** Én tekstlinje slik den står i kildedokumentet (PDF eller DOCX), i punkter (1/72 tomme). */
export interface RawLine {
  readonly page: number; // 1-basert
  readonly x: number; // venstre kant
  readonly y: number; // topp, økende nedover
  readonly text: string;
  /** Avsnittsstil fra DOCX (f.eks. «SCENE OVERSKRIFT»), ellers udefinert. */
  readonly style?: string;
}

export interface SourceRef {
  readonly page: number;
  readonly y: number;
  /** Fountain-markering manusmodellen ikke har egne felt for (DEC-0073, KI-164). Se FountainMarks. */
  readonly fountain?: FountainMarks;
}

/**
 * Fountain-markering som bevares fra import til eksport uten nye blokktyper eller databasekolonner
 * (DEC-0073, KI-164). Lagres i blokkens `sourceRef` (jsonb-kolonnen `script_blocks.source_ref`), som kopieres
 * uendret ved import, splitting og sammenslåing. Teksten i blokken er alltid ren (uten `^`, `> <` eller `~`),
 * så manusvisning, PDF/DOCX, karakterlister og oversettelse ser vanlig tekst. Linjenumrene gjelder
 * blokktekstens linjer (delt på «\n»); linjer som ikke lenger finnes etter redigering, ignoreres ved eksport.
 */
export interface FountainMarks {
  /** Karakterblokken er andre taler i dobbel dialog (`NAVN ^`): replikken sies samtidig med den foran. */
  readonly dual?: true;
  /** Linjer i handlingen som var sentrert (`> tekst <`). */
  readonly centered?: readonly number[];
  /** Linjer i handling eller replikk som var sangtekst (`~tekst`). */
  readonly lyrics?: readonly number[];
  /**
   * Kontrollsum av blokkens tekst ved import (DEC-0073): linjemerkene (sentrert, sangtekst) brukes bare så
   * lenge teksten er den samme – etter redigering, eller for en oversatt tekst, kunne de truffet feil linje.
   */
  readonly textHash?: string;
}

export interface ParsedElement {
  readonly kind: BlockKind;
  readonly text: string;
  readonly source: SourceRef;
  /** Satt når tolkningen er usikker (mandat 4.3 punkt 9). */
  readonly uncertain?: string;
}

export interface ParsedScene {
  /**
   * Midlertidig ID gitt én gang ved tolking (REQ-0037, `identifyParsedScenes`). Koblinger i importen peker på
   * den, aldri på plassen i listen. Lagres ikke.
   */
  readonly id?: string;
  /** Scenenummer slik det står i manuset (visning, aldri identitet – INV-02). */
  readonly number: string | null;
  readonly rawHeading: string;
  readonly heading: SceneHeading;
  readonly elements: readonly ParsedElement[];
  readonly source: SourceRef;
  /** Tekst før første sceneoverskrift i et delmanus (mandat 4.1/4.3). */
  readonly isContinuation?: boolean;
  readonly warnings: readonly string[];
}

export interface ParsedScreenplay {
  readonly format: "pdf" | "docx" | "fountain";
  readonly pageCount: number;
  readonly titlePage: readonly string[];
  readonly scenes: readonly ParsedScene[];
  readonly warnings: readonly string[];
  readonly stats: {
    readonly numbered: number;
    readonly unnumbered: number;
    readonly uncertain: number;
    readonly duplicateNumbers: readonly string[];
  };
}
