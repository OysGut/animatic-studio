/**
 * Teknisk visning i monteringen (DEC-0072, REQ-0103): tidskoder, bildenummer, materiale, kilde-inn/-ut og
 * filinformasjon for en scene og delene den består av – samlet i et eget panel, så den vanlige visningen
 * forblir enkel. Bare lesing.
 */
import type { ProjectState } from "../model";
import { formatTimecode, framesToSeconds, type Rational } from "../time";
import { locale } from "../i18n";
import { takeLabel } from "./edit";
import type { FilmClip } from "./film";
import { clipTimeLevels } from "./time-levels";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

export interface TechRow {
  readonly label: string;
  readonly value: string;
}

export interface TechPart {
  readonly title: string;
  readonly rows: readonly TechRow[];
}

const SOURCE_LABEL: Record<string, string> = tLocalized({ composition: "core-assembly-technical.source-label.composition.b3e0746d3264", film: "core-assembly-technical.source-label.film.230bab96d6d8", placeholder: "core-assembly-technical.source-label.placeholder.28aa44e5468d", mixed: "core-assembly-technical.source-label.mixed.f0269663c045" });

const DURATION_LABEL: Record<string, string> = tLocalized({ set: "core-assembly-technical.duration-label.set.7e87afd7387e", estimate: "core-assembly-technical.duration-label.estimate.3295c0fa5562", film: "core-assembly-technical.duration-label.film.9e214ccf7c5c", planned: "core-assembly-technical.duration-label.planned.9552e05ff3b9", parts: "core-assembly-technical.duration-label.parts.59e3effca87b" });

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
    ? tk("core-assembly-technical.overlap.message.ca5d56e365a2", { overlapFrames: String(clip.overlapFrames) })
    : "";
  const scene: TechRow[] = [
    { label: tk("core-assembly-technical.label.label.0dc1abe78f92"), value: formatTimecode(clip.startFrame, fps) },
    { label: tk("core-assembly-technical.label.label.81c95bc8eb6e"), value: formatTimecode(end, fps) },
    {
      label: tk("core-assembly-technical.label.label.9ee0bad191bb"),
      value: tk("core-assembly-technical.value.value.c12393fee493", { value1: String(formatTimecode(clip.durationFrames, fps)), durationFrames: String(clip.durationFrames), seconds: String(seconds) }),
    },
    { label: tk("core-assembly-technical.label.label.996d3af02644"), value: `${clip.startFrame}–${end - 1}` },
    {
      label: tk("core-assembly-technical.label.label.7c545c9f8b78"),
      value: tk("core-assembly-technical.value.value.375d627b1629", { rateText: String(rateText) }),
    },
    {
      label: tk("core-assembly-technical.label.label.478ce56e48f3"),
      value: `${s.project.frameWidth} × ${s.project.frameHeight}`,
    },
    {
      label: tk("core-assembly-technical.label.label.d0f773af4ef6"),
      value: SOURCE_LABEL[clip.source] ?? clip.source,
    },
    {
      label: tk("core-assembly-technical.label.label.34fe32c75dca"),
      value: DURATION_LABEL[clip.durationKind] ?? clip.durationKind,
    },
    {
      label: tk("core-assembly-technical.label.label.627d90478419"),
      value:
        clip.transition.kind === "cut"
          ? tk("core-assembly-technical.value.value.9edeb928ebe7")
          : tk("core-assembly-technical.value.value.22cb8469a4e5", { kind: String(clip.transition.kind), frames: String(clip.transition.frames), overlap: String(overlap) }),
    },
  ];
  if (clip.productionNumber)
    scene.unshift({ label: tk("core-assembly-technical.label.label.e446454b3c63"), value: clip.productionNumber });
  const parts: TechPart[] = clip.parts.map((p, i) => {
    const rows: TechRow[] = [
      {
        label: tk("core-assembly-technical.label.label.10b8504b954f"),
        value: tk("core-assembly-technical.value.value.a395f5c89880", { value1: String(formatTimecode(p.startFrame, fps)), value2: String(formatTimecode(p.startFrame + p.durationFrames, fps)), durationFrames: String(p.durationFrames) }),
      },
    ];
    if (p.source === "take" && p.take) {
      const t = p.take;
      rows.push({
        label: tk("core-assembly-technical.label.label.551da5a56131"),
        value:
          t.kind === "still"
            ? tk("core-assembly-technical.value.value.e66208ff61c3")
            : `${msTc(p.inMs, fps)} – ${msTc(p.outMs, fps)}`,
      });
      const m = t.media;
      if (m) {
        rows.push({ label: tk("core-assembly-technical.label.label.d6353caf4a5c"), value: m.fileName });
        const fileFps = m.fps
          ? tk("core-assembly-technical.file-fps.clip-parts-map.61be0459c670", { value1: String(m.fps.toLocaleString(locale(), { maximumFractionDigits: 3 })) })
          : null;
        rows.push({
          label: tk("core-assembly-technical.label.label.6b81d3cb0f63"),
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
          label: tk("core-assembly-technical.label.label.b69e3a26e8a3"),
          value: m.hasAudio ? tk("core-assembly-technical.value.value.e8bb4ac19f03") : tk("core-assembly-technical.value.value.ed10be234b4b"),
        });
        if (m.fps && Math.abs(m.fps - rate) > 0.01)
          rows.push({
            label: tk("core-assembly-technical.label.label.f6d804950dd9"),
            value: tk("core-assembly-technical.value.value.ba0d651d3c7b"),
          });
      }
      rows.push({
        label: tk("core-assembly-technical.label.label.0ae498c4caab"),
        value:
          t.status === "approved"
            ? tk("core-assembly-technical.value.value.692bc0f2f22b")
            : t.status === "in_progress"
              ? tk("core-assembly-technical.value.value.80d60ff86353")
              : tk("core-assembly-technical.value.value.70d847eb7842"),
      });
      if (p.transitionMs)
        rows.push({
          label: tk("core-assembly-technical.label.label.2cf1f40659b8"),
          value: `${p.transitionMs} ms`,
        });
      return { title: `${i + 1}. ${takeLabel(s, t)}`, rows };
    }
    if (p.source === "composition") {
      rows.push({
        label: tk("core-assembly-technical.label.label.ead6c0f6cbe0"),
        value: `${p.inFrame}–${p.inFrame + p.durationFrames - 1}`,
      });
      if (p.transitionMs)
        rows.push({
          label: tk("core-assembly-technical.label.label.2cf1f40659b8.2"),
          value: `${p.transitionMs} ms`,
        });
      return { title: `${i + 1}. ${tk("core-assembly-technical.title.title.d288d68d9db0")}`, rows };
    }
    return { title: `${i + 1}. ${tk("core-assembly-technical.title.title.b039b9affa74")}`, rows };
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
      label: tk("core-assembly-technical.label.label.541f2aca4ba5"),
      value: tk("core-assembly-technical.value.value.88704f3e1708", { value1: String(formatTimecode(at.filmFrame, fps)), filmFrame: String(at.filmFrame) }),
    },
    {
      label: tk("core-assembly-technical.label.label.10b8504b954f.2"),
      value: tk("core-assembly-technical.value.value.39fcaa5c46f2", { value1: String(formatTimecode(at.sceneFrame, fps)), sceneFrame: String(at.sceneFrame) }),
    },
  ];
  if (clip.parts.length > 1)
    rows.push({
      label: tk("core-assembly-technical.label.label.f1a628819f02", { value1: String(at.partIndex + 1) }),
      value: tk("core-assembly-technical.value.value.efe572e06fca", { value1: String(formatTimecode(at.partFrame, fps)), partFrame: String(at.partFrame) }),
    });
  const src = at.source;
  if (src.kind === "take") {
    const takeSuffix = part.take ? ` · ${takeLabel(s, part.take)}` : "";
    const secs = (src.ms / 1000).toLocaleString(locale(), { maximumFractionDigits: 3 });
    rows.push({
      label: tk("core-assembly-technical.label.label.34fc6d3dd695"),
      value:
        part.take?.kind === "still"
          ? tk("core-assembly-technical.value.value.7a9dd36e5edb", { value1: String(takeLabel(s, part.take)) })
          : tk("core-assembly-technical.value.value.cc6ea7c26663", { value1: String(msTc(src.ms, fps)), secs: String(secs), takeSuffix: String(takeSuffix) }),
    });
  } else if (src.kind === "composition")
    rows.push({
      label: tk("core-assembly-technical.label.label.34fc6d3dd695.2"),
      value: tk("core-assembly-technical.value.value.c81f0aa535a7", { frame: String(src.frame) }),
    });
  else
    rows.push({
      label: tk("core-assembly-technical.label.label.34fc6d3dd695.3"),
      value: tk("core-assembly-technical.value.value.0cfb2f827b2a"),
    });
  return rows;
}
