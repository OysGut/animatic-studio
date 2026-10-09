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
}

export interface ParsedElement {
  readonly kind: BlockKind;
  readonly text: string;
  readonly source: SourceRef;
  /** Satt når tolkningen er usikker (mandat 4.3 punkt 9). */
  readonly uncertain?: string;
}

export interface ParsedScene {
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
