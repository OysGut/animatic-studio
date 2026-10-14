/**
 * Teknisk visning i monteringen (DEC-0072, REQ-0103): tidskoder, bildenummer, materiale, kilde-inn/-ut og
 * filinformasjon for en scene og delene den består av – samlet i et eget panel, så den vanlige visningen
 * forblir enkel. Bare lesing.
 */
import type { ProjectState } from "../model";
import { formatTimecode, framesToSeconds, type Rational } from "../time";
import { L, localized, locale } from "../i18n";
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

const SOURCE_LABEL: Record<string, string> = localized({
  composition: ["2D-scene", "2D scene"],
  film: ["Film", "Film"],
  placeholder: ["Tittelkort", "Title card"],
  mixed: ["Sammensatt", "Mixed"],
});

const DURATION_LABEL: Record<string, string> = localized({
  set: ["satt i 2D-scenen eller monteringen", "set in the 2D scene or the assembly"],
  estimate: ["beregnet fra manuset", "estimated from the script"],
  film: ["filmens lengde", "the film's length"],
  planned: ["planlagt lengde", "planned length"],
  parts: ["sum av delene", "sum of the parts"],
});

const msTc = (ms: number, fps: Rational) =>
  formatTimecode(Math.round((ms / 1000) * (fps.num / fps.den)), fps);

export function technicalInfo(
  s: ProjectState,
  clip: FilmClip,
  fps: Rational,
): { readonly scene: readonly TechRow[]; readonly parts: readonly TechPart[] } {
  const end = clip.startFrame + clip.durationFrames;
  const rate = fps.num / fps.den;
  const seconds = framesToSeconds(clip.durationFrames, fps).toLocaleString(locale(), {
    maximumFractionDigits: 3,
  });
  const rateText = rate.toLocaleString(locale(), { maximumFractionDigits: 3 });
  const overlap = clip.overlapFrames
    ? L(` (overlapp ${clip.overlapFrames})`, ` (overlap ${clip.overlapFrames})`)
    : "";
  const scene: TechRow[] = [
    { label: L("Inn (film)", "In (film)"), value: formatTimecode(clip.startFrame, fps) },
    { label: L("Ut (film)", "Out (film)"), value: formatTimecode(end, fps) },
    {
      label: L("Lengde", "Length"),
      value: L(
        `${formatTimecode(clip.durationFrames, fps)} · ${clip.durationFrames} bilder · ${seconds} s`,
        `${formatTimecode(clip.durationFrames, fps)} · ${clip.durationFrames} frames · ${seconds} s`,
      ),
    },
    { label: L("Bildenummer", "Frame number"), value: `${clip.startFrame}–${end - 1}` },
    {
      label: L("Bildefrekvens", "Frame rate"),
      value: L(`${rateText} bilder/s`, `${rateText} frames/s`),
    },
    {
      label: L("Format", "Format"),
      value: `${s.project.frameWidth} × ${s.project.frameHeight}`,
    },
    {
      label: L("Materiale", "Material"),
      value: SOURCE_LABEL[clip.source] ?? clip.source,
    },
    {
      label: L("Lengden er", "Length is"),
      value: DURATION_LABEL[clip.durationKind] ?? clip.durationKind,
    },
    {
      label: L("Overgang inn", "Transition in"),
      value:
        clip.transition.kind === "cut"
          ? L("Kutt", "Cut")
          : L(
              `${clip.transition.kind} · ${clip.transition.frames} bilder${overlap}`,
              `${clip.transition.kind} · ${clip.transition.frames} frames${overlap}`,
            ),
    },
  ];
  if (clip.productionNumber)
    scene.unshift({ label: L("Scenenummer", "Scene number"), value: clip.productionNumber });
  const parts: TechPart[] = clip.parts.map((p, i) => {
    const rows: TechRow[] = [
      {
        label: L("I scenen", "In the scene"),
        value: L(
          `${formatTimecode(p.startFrame, fps)} – ${formatTimecode(p.startFrame + p.durationFrames, fps)} (${p.durationFrames} bilder)`,
          `${formatTimecode(p.startFrame, fps)} – ${formatTimecode(p.startFrame + p.durationFrames, fps)} (${p.durationFrames} frames)`,
        ),
      },
    ];
    if (p.source === "take" && p.take) {
      const t = p.take;
      rows.push({
        label: L("Kilde inn/ut", "Source in/out"),
        value:
          t.kind === "still"
            ? L(
                "Stillbilde (samme bilde hele delen)",
                "Still image (the same image for the whole part)",
              )
            : `${msTc(p.inMs, fps)} – ${msTc(p.outMs, fps)}`,
      });
      const m = t.media;
      if (m) {
        rows.push({ label: L("Fil", "File"), value: m.fileName });
        const fileFps = m.fps
          ? L(
              `${m.fps.toLocaleString(locale(), { maximumFractionDigits: 3 })} bilder/s`,
              `${m.fps.toLocaleString(locale(), { maximumFractionDigits: 3 })} frames/s`,
            )
          : null;
        rows.push({
          label: L("Video", "Video"),
          value: [
            m.width && m.height ? `${m.width} × ${m.height}` : null,
            fileFps,
            m.videoCodec,
            `${(m.byteSize / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`,
          ]
            .filter(Boolean)
            .join(" · "),
        });
        rows.push({
          label: L("Lyd i filen", "Audio in the file"),
          value: m.hasAudio ? L("Ja", "Yes") : L("Nei", "No"),
        });
        if (m.fps && Math.abs(m.fps - rate) > 0.01)
          rows.push({
            label: L("Merk", "Note"),
            value: L(
              "Filmens bildefrekvens er en annen enn prosjektets; bilder gjentas eller hoppes over",
              "The film's frame rate differs from the project's; frames are repeated or skipped",
            ),
          });
      }
      rows.push({
        label: L("Status", "Status"),
        value:
          t.status === "approved"
            ? L("Godkjent", "Approved")
            : t.status === "in_progress"
              ? L("Under arbeid", "In progress")
              : L("Referanse", "Reference"),
      });
      if (p.transitionMs)
        rows.push({
          label: L("Myk overgang inn", "Soft transition in"),
          value: `${p.transitionMs} ms`,
        });
      return { title: `${i + 1}. ${takeLabel(s, t)}`, rows };
    }
    if (p.source === "composition") {
      rows.push({
        label: L("2D-scene bilde", "2D scene frame"),
        value: `${p.inFrame}–${p.inFrame + p.durationFrames - 1}`,
      });
      if (p.transitionMs)
        rows.push({
          label: L("Myk overgang inn", "Soft transition in"),
          value: `${p.transitionMs} ms`,
        });
      return { title: `${i + 1}. ${L("Animatic (2D-scene)", "Animatic (2D scene)")}`, rows };
    }
    return { title: `${i + 1}. ${L("Tittelkort", "Title card")}`, rows };
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
    {
      label: L("Film", "Film"),
      value: L(
        `${formatTimecode(at.filmFrame, fps)} (bilde ${at.filmFrame})`,
        `${formatTimecode(at.filmFrame, fps)} (frame ${at.filmFrame})`,
      ),
    },
    {
      label: L("I scenen", "In the scene"),
      value: L(
        `${formatTimecode(at.sceneFrame, fps)} (bilde ${at.sceneFrame})`,
        `${formatTimecode(at.sceneFrame, fps)} (frame ${at.sceneFrame})`,
      ),
    },
  ];
  if (clip.parts.length > 1)
    rows.push({
      label: L(`I del ${at.partIndex + 1}`, `In part ${at.partIndex + 1}`),
      value: L(
        `${formatTimecode(at.partFrame, fps)} (bilde ${at.partFrame})`,
        `${formatTimecode(at.partFrame, fps)} (frame ${at.partFrame})`,
      ),
    });
  const src = at.source;
  if (src.kind === "take") {
    const takeSuffix = part.take ? ` · ${takeLabel(s, part.take)}` : "";
    const secs = (src.ms / 1000).toLocaleString(locale(), { maximumFractionDigits: 3 });
    rows.push({
      label: L("I kilden", "In the source"),
      value:
        part.take?.kind === "still"
          ? L(`Stillbilde: ${takeLabel(s, part.take)}`, `Still image: ${takeLabel(s, part.take)}`)
          : L(
              `${msTc(src.ms, fps)} · ${secs} s${takeSuffix}`,
              `${msTc(src.ms, fps)} · ${secs} s${takeSuffix}`,
            ),
    });
  } else if (src.kind === "composition")
    rows.push({
      label: L("I kilden", "In the source"),
      value: L(`2D-scene bilde ${src.frame}`, `2D scene frame ${src.frame}`),
    });
  else
    rows.push({
      label: L("I kilden", "In the source"),
      value: L("Tittelkort (ingen kilde)", "Title card (no source)"),
    });
  return rows;
}
