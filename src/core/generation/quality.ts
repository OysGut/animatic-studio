/**
 * Kvalitetskontroll uten AI (mandat 19.8, REQ-0287, REQ-0288, DEC-0071): en rådgivende sjekkliste for en
 * AI-video, per kriterium (manus, karakterreferanser, stil, kontinuitet, kamera og det tekniske). Den bygger på
 * det programmet vet: beskrivelsen som ble sendt, manuset nå, bildene som ble brukt og filens egenskaper.
 * Den ser ikke på selve bildene, så den er støtte – aldri en garanti – og godkjenner eller forkaster ingenting.
 */
import type { FilmClip } from "../assembly/film";
import { materialChanges } from "../assembly/discrepancy";
import type { ProjectState, Take } from "../model";
import { blocksOfVariant } from "../views";
import { continuityCutBlocks } from "../continuity";
import type { GenerationJob } from "./cost";
import { styleProfileFor } from "./style";
import { sceneVideoWork } from "./video";

export type QualityCriterion =
  "script" | "characters" | "style" | "continuity" | "camera" | "technical";

export const QUALITY_LABEL: Record<QualityCriterion, string> = {
  script: "Manus",
  characters: "Karakterreferanser",
  style: "Stil",
  continuity: "Kontinuitet",
  camera: "Kamera",
  technical: "Teknisk",
};

export interface QualityCheck {
  readonly criterion: QualityCriterion;
  /** «ok»: ingenting å merke seg; «warn»: se nøye på dette; «unknown»: kan ikke vurderes. */
  readonly status: "ok" | "warn" | "unknown";
  readonly text: string;
}

/** Fast tekst som alltid vises sammen med sjekklisten (REQ-0288). */
export const QUALITY_DISCLAIMER =
  "Rådgivende: sjekklisten bygger på beskrivelsen og filens egenskaper, ikke på hva som faktisk vises. Se på videoen og avgjør selv.";

const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

export function videoQualityChecks(
  s: ProjectState,
  productionId: string,
  clip: FilmClip,
  take: Take,
  job: GenerationJob | null,
): QualityCheck[] {
  const out: QualityCheck[] = [];
  const work = sceneVideoWork(s, productionId, clip);
  const i = take.segmentId ? work.stored.findIndex((g) => g.id === take.segmentId) : -1;
  const seg = i >= 0 ? work.plan[i] : undefined;
  const inSeg = new Set<string>(seg ? seg.blockIds : []);
  const blocks = blocksOfVariant(s, clip.variantId).filter((b) => !seg || inSeg.has(b.id));
  const prompt = job ? norm(job.prompt) : null;

  // Manus: avvik siden videoen ble laget, og om replikkene var med i beskrivelsen
  // Direkte mot videoens eget utgangspunkt, også for kandidater som ikke er i bruk
  const changed =
    materialChanges(
      s,
      clip.variantId,
      (take.acceptedFrom ?? take.producedFrom).blockRevisions,
      take.coverage ?? null,
    ).length > 0;
  const dialogue = blocks.filter((b) => b.kind === "dialogue" && b.text.trim());
  const missing = prompt ? dialogue.filter((b) => !prompt.includes(norm(b.text))) : [];
  out.push(
    changed
      ? {
          criterion: "script",
          status: "warn",
          text: "Manuset er endret etter at videoen ble laget.",
        }
      : !prompt
        ? {
            criterion: "script",
            status: "unknown",
            text: "Beskrivelsen som ble sendt, er ikke kjent.",
          }
        : missing.length
          ? {
              criterion: "script",
              status: "warn",
              text: `${missing.length} ${missing.length === 1 ? "replikk var" : "replikker var"} ikke med i beskrivelsen.`,
            }
          : {
              criterion: "script",
              status: "ok",
              text: dialogue.length
                ? "Alle replikkene i segmentet var med, ordrett."
                : "Beskrivelsen bygger på manuset slik det er nå.",
            },
  );

  // Karakterreferanser: startbildet og om det er godkjent
  const start = job?.referencePath ?? null;
  if (!job) out.push({ criterion: "characters", status: "unknown", text: "Ukjent startbilde." });
  else if (!start)
    out.push({
      criterion: "characters",
      status: "warn",
      text: "Videoen ble laget uten startbilde – figurene kan se annerledes ut enn i godkjente bilder.",
    });
  else if (/\/films\/[^/]+\/last-frame\.png$/.test(start))
    out.push({
      criterion: "characters",
      status: "ok",
      text: "Startet fra siste bilde i segmentet før (sammenheng).",
    });
  else {
    const v = Object.values(s.assetVersions).find((x) => x.mediaPath === start);
    const va = v ? s.assetVariants[v.variantId] : undefined;
    out.push(
      va && va.approvedVersionId === v!.id
        ? { criterion: "characters", status: "ok", text: "Startbildet var et godkjent bilde." }
        : {
            criterion: "characters",
            status: "warn",
            text: "Startbildet var ikke (lenger) den godkjente versjonen.",
          },
    );
  }

  // Stil: var filmens visuelle stil med?
  const style = styleProfileFor(s, "ai_video");
  out.push(
    !style
      ? {
          criterion: "style",
          status: "unknown",
          text: "Filmens visuelle stil er ikke fylt ut (prosjektoversikten).",
        }
      : !prompt
        ? { criterion: "style", status: "unknown", text: "Beskrivelsen er ikke kjent." }
        : prompt.includes("film look:") || prompt.includes("technique:")
          ? {
              criterion: "style",
              status: "ok",
              text: "Filmens visuelle stil var med i beskrivelsen.",
            }
          : {
              criterion: "style",
              status: "warn",
              text: "Filmens visuelle stil var ikke med (tatt bort for lengden eller laget før stilen).",
            },
  );

  // Kontinuitet: forandringer midt i segmentet
  const cuts = new Set<string>(continuityCutBlocks(s, clip.variantId).map((b) => b.id));
  const hasChange = [...inSeg].some((id) => cuts.has(id));
  out.push(
    !hasChange
      ? {
          criterion: "continuity",
          status: "ok",
          text: "Ingen forandringer i utseendet i segmentet.",
        }
      : prompt && prompt.includes("during this shot")
        ? {
            criterion: "continuity",
            status: "ok",
            text: "Forandringen i segmentet var beskrevet – sjekk at den synes.",
          }
        : {
            criterion: "continuity",
            status: "warn",
            text: "En figur forandrer seg i segmentet, men det sto ikke i beskrivelsen.",
          },
  );

  // Kamera fra 2D-animaticen
  out.push(
    !prompt
      ? { criterion: "camera", status: "unknown", text: "Beskrivelsen er ikke kjent." }
      : prompt.includes("camera (from the animatic)")
        ? { criterion: "camera", status: "ok", text: "Kamerabevegelsen fra animaticen var med." }
        : {
            criterion: "camera",
            status: "unknown",
            text: "Ingen kamerabevegelse ble beskrevet (ingen i animaticen, eller tatt bort for lengden).",
          },
  );

  // Teknisk: lengde, format og oppløsning
  const m = take.media;
  const notes: string[] = [];
  let warn = false;
  if (m && seg) {
    const want = (seg.endMs - seg.startMs) / 1000;
    const got = m.durationMs / 1000;
    if (got + 0.25 < want) {
      warn = true;
      notes.push(`kortere enn segmentet (${got.toFixed(1)} av ${want.toFixed(1)} s)`);
    }
  }
  if (m?.width && m.height) {
    const pa = s.project.frameWidth / s.project.frameHeight;
    const va = m.width / m.height;
    if (Math.abs(pa - va) / pa > 0.03) {
      warn = true;
      notes.push(`annet format enn prosjektet (${m.width}×${m.height})`);
    }
    if (m.height < s.project.frameHeight * 0.66) {
      warn = true;
      notes.push(
        `lavere oppløsning enn prosjektet (${m.height} mot ${s.project.frameHeight} linjer)`,
      );
    }
  }
  if (m && !m.hasAudio && dialogue.length)
    notes.push("ingen lyd i videoen – dialogen må legges på dialogsporet");
  out.push(
    !m
      ? { criterion: "technical", status: "unknown", text: "Filinformasjonen mangler." }
      : {
          criterion: "technical",
          status: warn ? "warn" : "ok",
          text: notes.length ? `${notes.join("; ")}.` : "Lengde, format og oppløsning passer.",
        },
  );
  return out;
}
