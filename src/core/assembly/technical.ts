/**
 * Teknisk visning i monteringen (DEC-0072, REQ-0103): tidskoder, bildenummer, materiale, kilde-inn/-ut og
 * filinformasjon for en scene og delene den består av – samlet i et eget panel, så den vanlige visningen
 * forblir enkel. Bare lesing.
 */
import type { ProjectState } from "../model";
import { formatTimecode, framesToSeconds, type Rational } from "../time";
import { takeLabel } from "./edit";
import type { FilmClip } from "./film";
import { clipTimeLevels } from "./time-levels";

export interface TechRow {
  readonly label: string;
  readonly value: string;
}

export interface TechPart {
  readonly title: string;
  readonly rows: readonly TechRow[];
}

const SOURCE_LABEL: Record<string, string> = {
  composition: "2D-scene",
  film: "Film",
  placeholder: "Tittelkort",
  mixed: "Sammensatt",
};

const DURATION_LABEL: Record<string, string> = {
  set: "satt i 2D-scenen eller monteringen",
  estimate: "beregnet fra manuset",
  film: "filmens lengde",
  planned: "planlagt lengde",
  parts: "sum av delene",
};

const msTc = (ms: number, fps: Rational) =>
  formatTimecode(Math.round((ms / 1000) * (fps.num / fps.den)), fps);

export function technicalInfo(
  s: ProjectState,
  clip: FilmClip,
  fps: Rational,
): { readonly scene: readonly TechRow[]; readonly parts: readonly TechPart[] } {
  const end = clip.startFrame + clip.durationFrames;
  const rate = fps.num / fps.den;
  const scene: TechRow[] = [
    { label: "Inn (film)", value: formatTimecode(clip.startFrame, fps) },
    { label: "Ut (film)", value: formatTimecode(end, fps) },
    {
      label: "Lengde",
      value: `${formatTimecode(clip.durationFrames, fps)} · ${clip.durationFrames} bilder · ${framesToSeconds(clip.durationFrames, fps).toLocaleString("nb-NO", { maximumFractionDigits: 3 })} s`,
    },
    { label: "Bildenummer", value: `${clip.startFrame}–${end - 1}` },
    {
      label: "Bildefrekvens",
      value: `${rate.toLocaleString("nb-NO", { maximumFractionDigits: 3 })} bilder/s`,
    },
    {
      label: "Format",
      value: `${s.project.frameWidth} × ${s.project.frameHeight}`,
    },
    {
      label: "Materiale",
      value: SOURCE_LABEL[clip.source] ?? clip.source,
    },
    {
      label: "Lengden er",
      value: DURATION_LABEL[clip.durationKind] ?? clip.durationKind,
    },
    {
      label: "Overgang inn",
      value:
        clip.transition.kind === "cut"
          ? "Kutt"
          : `${clip.transition.kind} · ${clip.transition.frames} bilder${clip.overlapFrames ? ` (overlapp ${clip.overlapFrames})` : ""}`,
    },
  ];
  if (clip.productionNumber) scene.unshift({ label: "Scenenummer", value: clip.productionNumber });
  const parts: TechPart[] = clip.parts.map((p, i) => {
    const rows: TechRow[] = [
      {
        label: "I scenen",
        value: `${formatTimecode(p.startFrame, fps)} – ${formatTimecode(p.startFrame + p.durationFrames, fps)} (${p.durationFrames} bilder)`,
      },
    ];
    if (p.source === "take" && p.take) {
      const t = p.take;
      rows.push({
        label: "Kilde inn/ut",
        value:
          t.kind === "still"
            ? "Stillbilde (samme bilde hele delen)"
            : `${msTc(p.inMs, fps)} – ${msTc(p.outMs, fps)}`,
      });
      const m = t.media;
      if (m) {
        rows.push({ label: "Fil", value: m.fileName });
        rows.push({
          label: "Video",
          value: [
            m.width && m.height ? `${m.width} × ${m.height}` : null,
            m.fps
              ? `${m.fps.toLocaleString("nb-NO", { maximumFractionDigits: 3 })} bilder/s`
              : null,
            m.videoCodec,
            `${(m.byteSize / 1e6).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB`,
          ]
            .filter(Boolean)
            .join(" · "),
        });
        rows.push({ label: "Lyd i filen", value: m.hasAudio ? "Ja" : "Nei" });
        if (m.fps && Math.abs(m.fps - rate) > 0.01)
          rows.push({
            label: "Merk",
            value:
              "Filmens bildefrekvens er en annen enn prosjektets; bilder gjentas eller hoppes over",
          });
      }
      rows.push({
        label: "Status",
        value:
          t.status === "approved"
            ? "Godkjent"
            : t.status === "in_progress"
              ? "Under arbeid"
              : "Referanse",
      });
      if (p.transitionMs) rows.push({ label: "Myk overgang inn", value: `${p.transitionMs} ms` });
      return { title: `${i + 1}. ${takeLabel(s, t)}`, rows };
    }
    if (p.source === "composition") {
      rows.push({
        label: "2D-scene bilde",
        value: `${p.inFrame}–${p.inFrame + p.durationFrames - 1}`,
      });
      if (p.transitionMs) rows.push({ label: "Myk overgang inn", value: `${p.transitionMs} ms` });
      return { title: `${i + 1}. Animatic (2D-scene)`, rows };
    }
    return { title: `${i + 1}. Tittelkort`, rows };
  });
  return { scene, parts };
}

/**
 * Avspillingshodet på alle tidsnivåer (REQ-0105): filmtid, tid i scenen, i delen og i kilden. Null når hodet
 * ikke står i klippet.
 */
export function playheadRows(
  s: ProjectState,
  clip: FilmClip,
  filmFrame: number,
  fps: Rational,
): TechRow[] | null {
  if (filmFrame < clip.startFrame || filmFrame >= clip.startFrame + clip.durationFrames)
    return null;
  const at = clipTimeLevels(clip, 0, filmFrame, fps);
  const part = clip.parts[at.partIndex]!;
  const rows: TechRow[] = [
    { label: "Film", value: `${formatTimecode(at.filmFrame, fps)} (bilde ${at.filmFrame})` },
    { label: "I scenen", value: `${formatTimecode(at.sceneFrame, fps)} (bilde ${at.sceneFrame})` },
  ];
  if (clip.parts.length > 1)
    rows.push({
      label: `I del ${at.partIndex + 1}`,
      value: `${formatTimecode(at.partFrame, fps)} (bilde ${at.partFrame})`,
    });
  const src = at.source;
  if (src.kind === "take")
    rows.push({
      label: "I kilden",
      value:
        part.take?.kind === "still"
          ? `Stillbilde: ${takeLabel(s, part.take)}`
          : `${msTc(src.ms, fps)} · ${(src.ms / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 3 })} s${part.take ? ` · ${takeLabel(s, part.take)}` : ""}`,
    });
  else if (src.kind === "composition")
    rows.push({ label: "I kilden", value: `2D-scene bilde ${src.frame}` });
  else rows.push({ label: "I kilden", value: "Tittelkort (ingen kilde)" });
  return rows;
}
