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

import { t as tk, tLocalized } from "@/core/i18n/keyed";

export type QualityCriterion =
  "script" | "characters" | "style" | "continuity" | "camera" | "technical";

export const QUALITY_LABEL: Record<QualityCriterion, string> = tLocalized({ script: "core-generation-quality.quality-label.script.7f82367341a5", characters: "core-generation-quality.quality-label.characters.092d98880025", style: "core-generation-quality.quality-label.style.087d90d2d146", continuity: "core-generation-quality.quality-label.continuity.677e61fefbf1", camera: "core-generation-quality.quality-label.camera.ee064275c9c4", technical: "core-generation-quality.quality-label.technical.55f2fc08d633" });

export interface QualityCheck {
  readonly criterion: QualityCriterion;
  /** «ok»: ingenting å merke seg; «warn»: se nøye på dette; «unknown»: kan ikke vurderes. */
  readonly status: "ok" | "warn" | "unknown";
  readonly text: string;
}

/** Fast tekst som alltid vises sammen med sjekklisten (REQ-0288). */
export const qualityDisclaimer = () =>
  tk("core-generation-quality.quality-disclaimer.message.87b81bc24bfa");
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
          text: tk("core-generation-quality.text.text.7df96843c16b"),
        }
      : !prompt
        ? {
            criterion: "script",
            status: "unknown",
            text: tk("core-generation-quality.text.text.8b2d3026ceb6"),
          }
        : missing.length
          ? {
              criterion: "script",
              status: "warn",
              text: tk("core-generation-quality.lines-not-in-description", { count: missing.length }),
            }
          : {
              criterion: "script",
              status: "ok",
              text: dialogue.length
                ? tk("core-generation-quality.text.text.a8f38437e2a6")
                : tk("core-generation-quality.text.text.3dcd2ab235a6"),
            },
  );

  // Karakterreferanser: startbildet og om det er godkjent
  const start = job?.referencePath ?? null;
  if (!job)
    out.push({
      criterion: "characters",
      status: "unknown",
      text: tk("core-generation-quality.text.text.5c1743d47351"),
    });
  else if (!start)
    out.push({
      criterion: "characters",
      status: "warn",
      text: tk("core-generation-quality.text.text.173d0843aabd"),
    });
  else if (/\/films\/[^/]+\/last-frame\.png$/.test(start))
    out.push({
      criterion: "characters",
      status: "ok",
      text: tk("core-generation-quality.text.text.daeb3dfe0872"),
    });
  else {
    const v = Object.values(s.assetVersions).find((x) => x.mediaPath === start);
    const va = v ? s.assetVariants[v.variantId] : undefined;
    out.push(
      va && va.approvedVersionId === v!.id
        ? {
            criterion: "characters",
            status: "ok",
            text: tk("core-generation-quality.text.text.511ac5dd5117"),
          }
        : {
            criterion: "characters",
            status: "warn",
            text: tk("core-generation-quality.text.text.fb5d9259daa3"),
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
          text: tk("core-generation-quality.text.text.90cf03eb6baa"),
        }
      : !prompt
        ? {
            criterion: "style",
            status: "unknown",
            text: tk("core-generation-quality.text.text.75a8fd313c6b"),
          }
        : prompt.includes("film look:") || prompt.includes("technique:")
          ? {
              criterion: "style",
              status: "ok",
              text: tk("core-generation-quality.text.text.f07402db35d5"),
            }
          : {
              criterion: "style",
              status: "warn",
              text: tk("core-generation-quality.text.text.4d9ded05170d"),
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
          text: tk("core-generation-quality.text.text.e22eed0d12cc"),
        }
      : prompt && prompt.includes("during this shot")
        ? {
            criterion: "continuity",
            status: "ok",
            text: tk("core-generation-quality.text.text.fed066e25f13"),
          }
        : {
            criterion: "continuity",
            status: "warn",
            text: tk("core-generation-quality.text.text.a0c038390823"),
          },
  );

  // Kamera fra 2D-animaticen
  out.push(
    !prompt
      ? {
          criterion: "camera",
          status: "unknown",
          text: tk("core-generation-quality.text.text.75a8fd313c6b.2"),
        }
      : prompt.includes("camera (from the animatic)")
        ? {
            criterion: "camera",
            status: "ok",
            text: tk("core-generation-quality.text.text.06951331981c"),
          }
        : {
            criterion: "camera",
            status: "unknown",
            text: tk("core-generation-quality.text.text.dfee3b2d484e"),
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
        tk("core-generation-quality.video-quality-checks.notes-push.094725f64a4b", { value1: String(got.toFixed(1)), value2: String(want.toFixed(1)) }),
      );
    }
  }
  if (m?.width && m.height) {
    const pa = s.project.frameWidth / s.project.frameHeight;
    const va = m.width / m.height;
    if (Math.abs(pa - va) / pa > 0.03) {
      warn = true;
      notes.push(
        tk("core-generation-quality.video-quality-checks.notes-push.a51837cf157a", { width: String(m.width), height: String(m.height) }),
      );
    }
    if (m.height < s.project.frameHeight * 0.66) {
      warn = true;
      notes.push(
        tk("core-generation-quality.video-quality-checks.notes-push.2eda3c2c5f27", { height: String(m.height), frameHeight: String(s.project.frameHeight) }),
      );
    }
  }
  if (m && !m.hasAudio && dialogue.length)
    notes.push(
      tk("core-generation-quality.video-quality-checks.notes-push.c57101666488"),
    );
  out.push(
    !m
      ? {
          criterion: "technical",
          status: "unknown",
          text: tk("core-generation-quality.text.text.3cbb9b93bc21"),
        }
      : {
          criterion: "technical",
          status: warn ? "warn" : "ok",
          text: notes.length
            ? `${notes.join("; ")}.`
            : tk("core-generation-quality.text.text.ff041b8a845c"),
        },
  );
  return out;
}
