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
import { L, localized } from "../i18n";

export type QualityCriterion =
  "script" | "characters" | "style" | "continuity" | "camera" | "technical";

export const QUALITY_LABEL: Record<QualityCriterion, string> = localized({
  script: ["Manus", "Script"],
  characters: ["Karakterreferanser", "Character references"],
  style: ["Stil", "Style"],
  continuity: ["Kontinuitet", "Continuity"],
  camera: ["Kamera", "Camera"],
  technical: ["Teknisk", "Technical"],
});

export interface QualityCheck {
  readonly criterion: QualityCriterion;
  /** «ok»: ingenting å merke seg; «warn»: se nøye på dette; «unknown»: kan ikke vurderes. */
  readonly status: "ok" | "warn" | "unknown";
  readonly text: string;
}

/** Fast tekst som alltid vises sammen med sjekklisten (REQ-0288). */
export const qualityDisclaimer = () =>
  L(
    "Rådgivende: sjekklisten bygger på beskrivelsen og filens egenskaper, ikke på hva som faktisk vises. Se på videoen og avgjør selv.",
    "Advisory: the checklist is based on the description and the file's properties, not on what is actually shown. Watch the video and decide for yourself.",
  );
/** Norsk versjon av qualityDisclaimer(), for eldre kode. Bruk qualityDisclaimer() i ny kode. */
export const QUALITY_DISCLAIMER = // i18n-ignore
  "Rådgivende: sjekklisten bygger på beskrivelsen og filens egenskaper, ikke på hva som faktisk vises. Se på videoen og avgjør selv."; // i18n-ignore

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
          text: L(
            "Manuset er endret etter at videoen ble laget.",
            "The script has changed since the video was made.",
          ),
        }
      : !prompt
        ? {
            criterion: "script",
            status: "unknown",
            text: L(
              "Beskrivelsen som ble sendt, er ikke kjent.",
              "The description that was sent is not known.",
            ),
          }
        : missing.length
          ? {
              criterion: "script",
              status: "warn",
              text: L(
                `${missing.length} ${missing.length === 1 ? "replikk var" : "replikker var"} ikke med i beskrivelsen.`,
                `${missing.length} ${missing.length === 1 ? "line was" : "lines were"} not included in the description.`,
              ),
            }
          : {
              criterion: "script",
              status: "ok",
              text: dialogue.length
                ? L(
                    "Alle replikkene i segmentet var med, ordrett.",
                    "All the lines in the segment were included, word for word.",
                  )
                : L(
                    "Beskrivelsen bygger på manuset slik det er nå.",
                    "The description is based on the script as it is now.",
                  ),
            },
  );

  // Karakterreferanser: startbildet og om det er godkjent
  const start = job?.referencePath ?? null;
  if (!job)
    out.push({
      criterion: "characters",
      status: "unknown",
      text: L("Ukjent startbilde.", "Unknown start image."),
    });
  else if (!start)
    out.push({
      criterion: "characters",
      status: "warn",
      text: L(
        "Videoen ble laget uten startbilde – figurene kan se annerledes ut enn i godkjente bilder.",
        "The video was made without a start image – the figures may look different from the approved images.",
      ),
    });
  else if (/\/films\/[^/]+\/last-frame\.png$/.test(start))
    out.push({
      criterion: "characters",
      status: "ok",
      text: L(
        "Startet fra siste bilde i segmentet før (sammenheng).",
        "Started from the last frame of the previous segment (continuity).",
      ),
    });
  else {
    const v = Object.values(s.assetVersions).find((x) => x.mediaPath === start);
    const va = v ? s.assetVariants[v.variantId] : undefined;
    out.push(
      va && va.approvedVersionId === v!.id
        ? {
            criterion: "characters",
            status: "ok",
            text: L("Startbildet var et godkjent bilde.", "The start image was an approved image."),
          }
        : {
            criterion: "characters",
            status: "warn",
            text: L(
              "Startbildet var ikke (lenger) den godkjente versjonen.",
              "The start image was not (any longer) the approved version.",
            ),
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
          text: L(
            "Filmens visuelle stil er ikke fylt ut (prosjektoversikten).",
            "The film's visual style is not filled in (project overview).",
          ),
        }
      : !prompt
        ? {
            criterion: "style",
            status: "unknown",
            text: L("Beskrivelsen er ikke kjent.", "The description is not known."),
          }
        : prompt.includes("film look:") || prompt.includes("technique:")
          ? {
              criterion: "style",
              status: "ok",
              text: L(
                "Filmens visuelle stil var med i beskrivelsen.",
                "The film's visual style was included in the description.",
              ),
            }
          : {
              criterion: "style",
              status: "warn",
              text: L(
                "Filmens visuelle stil var ikke med (tatt bort for lengden eller laget før stilen).",
                "The film's visual style was not included (removed for length, or made before the style).",
              ),
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
          text: L(
            "Ingen forandringer i utseendet i segmentet.",
            "No changes in appearance within the segment.",
          ),
        }
      : prompt && prompt.includes("during this shot")
        ? {
            criterion: "continuity",
            status: "ok",
            text: L(
              "Forandringen i segmentet var beskrevet – sjekk at den synes.",
              "The change within the segment was described – check that it shows.",
            ),
          }
        : {
            criterion: "continuity",
            status: "warn",
            text: L(
              "En figur forandrer seg i segmentet, men det sto ikke i beskrivelsen.",
              "A figure changes within the segment, but this was not in the description.",
            ),
          },
  );

  // Kamera fra 2D-animaticen
  out.push(
    !prompt
      ? {
          criterion: "camera",
          status: "unknown",
          text: L("Beskrivelsen er ikke kjent.", "The description is not known."),
        }
      : prompt.includes("camera (from the animatic)")
        ? {
            criterion: "camera",
            status: "ok",
            text: L(
              "Kamerabevegelsen fra animaticen var med.",
              "The camera movement from the animatic was included.",
            ),
          }
        : {
            criterion: "camera",
            status: "unknown",
            text: L(
              "Ingen kamerabevegelse ble beskrevet (ingen i animaticen, eller tatt bort for lengden).",
              "No camera movement was described (none in the animatic, or removed for length).",
            ),
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
      notes.push(
        L(
          `kortere enn segmentet (${got.toFixed(1)} av ${want.toFixed(1)} s)`,
          `shorter than the segment (${got.toFixed(1)} of ${want.toFixed(1)} s)`,
        ),
      );
    }
  }
  if (m?.width && m.height) {
    const pa = s.project.frameWidth / s.project.frameHeight;
    const va = m.width / m.height;
    if (Math.abs(pa - va) / pa > 0.03) {
      warn = true;
      notes.push(
        L(
          `annet format enn prosjektet (${m.width}×${m.height})`,
          `different format from the project (${m.width}×${m.height})`,
        ),
      );
    }
    if (m.height < s.project.frameHeight * 0.66) {
      warn = true;
      notes.push(
        L(
          `lavere oppløsning enn prosjektet (${m.height} mot ${s.project.frameHeight} linjer)`,
          `lower resolution than the project (${m.height} vs ${s.project.frameHeight} lines)`,
        ),
      );
    }
  }
  if (m && !m.hasAudio && dialogue.length)
    notes.push(
      L(
        "ingen lyd i videoen – dialogen må legges på dialogsporet",
        "no sound in the video – the dialogue must be added to the dialogue track",
      ),
    );
  out.push(
    !m
      ? {
          criterion: "technical",
          status: "unknown",
          text: L("Filinformasjonen mangler.", "The file information is missing."),
        }
      : {
          criterion: "technical",
          status: warn ? "warn" : "ok",
          text: notes.length
            ? `${notes.join("; ")}.`
            : L("Lengde, format og oppløsning passer.", "Length, format and resolution are fine."),
        },
  );
  return out;
}
