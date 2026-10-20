/**
 * Skrivecanvaset i Story Lab (SL7): et parallelt, visuelt arbeidsrom ved siden av manuset. Noder og kanter er
 * prosjektdata som skrives med kommandoer (AddCanvasNodes …). Denne modulen er ren: validering, et foreslått
 * førsteoppsett fra manuset (layoutFromStructure) og en kort tekst om canvaset til intervjuprompten.
 */

import type { CanvasNodeId } from "../ids";
import {
  mainProduction,
  type CanvasEdgeFields,
  type CanvasEdgeKind,
  type CanvasNodeFields,
  type CanvasNodeKind,
  type ProjectState,
} from "../model";
import { storyTimesCached } from "../continuity";
import { formatHeading } from "../screenplay/paginate";
import { compareKeys } from "../order-key";
import { t as tk } from "@/core/i18n/keyed";

export const CANVAS_NODE_KINDS: readonly CanvasNodeKind[] = [
  "premise",
  "plot",
  "subplot",
  "plot_point",
  "turning_point",
  "event",
  "consequence",
  "scene",
  "character",
  "location",
  "relation",
  "note",
  "idea",
  "alternative",
  "group",
];

export const CANVAS_EDGE_KINDS: readonly CanvasEdgeKind[] = [
  "leads_to",
  "causes",
  "conflicts",
  "relation",
  "alternative_of",
  "belongs_to",
];

export const CANVAS_TITLE_MAX = 300;
export const CANVAS_BODY_MAX = 8000;
export const CANVAS_LABEL_MAX = 200;
export const CANVAS_SIZE_MAX = 10000;
/** Største koordinat (i begge retninger) på canvaset. */
export const CANVAS_COORD_MAX = 1_000_000;
export const CANVAS_DEFAULT_W = 220;
export const CANVAS_DEFAULT_H = 120;
const COLOR_RE = /^[a-z][a-z0-9-]{0,39}$/;

export function canvasNodeKindLabel(k: CanvasNodeKind): string {
  const labels: Record<CanvasNodeKind, string> = {
    premise: tk("core-storylab-canvas.premise.premise.9de77c48671c"),
    plot: tk("core-storylab-canvas.plot.plot.114cb2d727ef"),
    subplot: tk("core-storylab-canvas.subplot.subplot.36571c5f9b8c"),
    plot_point: tk("core-storylab-canvas.plot-point.plot-point.e581413c6812"),
    turning_point: tk("core-storylab-canvas.turning-point.turning-point.aec313970a40"),
    event: tk("core-storylab-canvas.event.event.bc94a5307323"),
    consequence: tk("core-storylab-canvas.consequence.consequence.071d5046b0f8"),
    scene: tk("core-storylab-canvas.scene.scene.6296666a38fc"),
    character: tk("core-storylab-canvas.character.character.7f4c710fdd24"),
    location: tk("core-storylab-canvas.location.location.5be3d87e0de8"),
    relation: tk("core-storylab-canvas.relation.relation.0a6e501cc1c7"),
    note: tk("core-storylab-canvas.note.note.1ed1091a5b73"),
    idea: tk("core-storylab-canvas.idea.idea.fd9111ab288c"),
    alternative: tk("core-storylab-canvas.alternative.alternative.ab9b197fc451"),
    group: tk("core-storylab-canvas.group.group.8d4eac26b119"),
  };
  return labels[k];
}

export function canvasEdgeKindLabel(k: CanvasEdgeKind): string {
  const labels: Record<CanvasEdgeKind, string> = {
    leads_to: tk("core-storylab-canvas.leads-to.leads-to.42ec5cf12796"),
    causes: tk("core-storylab-canvas.causes.causes.2af860c88540"),
    conflicts: tk("core-storylab-canvas.conflicts.conflicts.9fd834e4ddae"),
    relation: tk("core-storylab-canvas.relation.relation.0a6e501cc1c7.2"),
    alternative_of: tk("core-storylab-canvas.alternative-of.alternative-of.d63a45d859f8"),
    belongs_to: tk("core-storylab-canvas.belongs-to.belongs-to.8abbcc03cc04"),
  };
  return labels[k];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Feil i feltene til en node (null = gyldig). Sjekker ikke at koblinger finnes (det gjør kommandoen). */
export function canvasNodeError(f: unknown): string | null {
  if (!f || typeof f !== "object") return tk("core-storylab-canvas.canvas-node-error.message.4d10d1fbf882");
  const o = f as Record<string, unknown>;
  if (!CANVAS_NODE_KINDS.includes(o["kind"] as CanvasNodeKind))
    return tk("core-storylab-canvas.canvas-node-error.message.f4702edfa6e3");
  if (typeof o["title"] !== "string" || o["title"].length > CANVAS_TITLE_MAX)
    return tk("core-storylab-canvas.canvas-node-error.message.876cb4f2f1d3", { CANVAS_TITLE_MAX: String(CANVAS_TITLE_MAX) });
  if (typeof o["body"] !== "string" || o["body"].length > CANVAS_BODY_MAX)
    return tk("core-storylab-canvas.canvas-node-error.message.431a2384fc72", { CANVAS_BODY_MAX: String(CANVAS_BODY_MAX) });
  for (const k of ["x", "y"] as const)
    if (!finite(o[k]) || Math.abs(o[k]) > CANVAS_COORD_MAX)
      return tk("core-storylab-canvas.canvas-node-error.message.839ddfe433ba");
  for (const k of ["w", "h"] as const)
    if (!finite(o[k]) || o[k] <= 0 || o[k] > CANVAS_SIZE_MAX)
      return tk("core-storylab-canvas.canvas-node-error.message.264cfc65ae16");
  if (o["color"] !== null && (typeof o["color"] !== "string" || !COLOR_RE.test(o["color"])))
    return tk("core-storylab-canvas.canvas-node-error.message.98bdc81a7e8f");
  for (const k of ["groupId", "assetId", "sceneId"] as const)
    if (o[k] !== null && typeof o[k] !== "string") return tk("core-storylab-canvas.canvas-node-error.message.7030a4ec6247");
  return null;
}

/** Feil i feltene til en kant (null = gyldig). */
export function canvasEdgeError(f: unknown): string | null {
  if (!f || typeof f !== "object") return tk("core-storylab-canvas.canvas-edge-error.message.7c744edf6e9e");
  const o = f as Record<string, unknown>;
  if (typeof o["fromNodeId"] !== "string" || typeof o["toNodeId"] !== "string")
    return tk("core-storylab-canvas.canvas-edge-error.message.a13e6154d7cd");
  if (o["fromNodeId"] === o["toNodeId"])
    return tk("core-storylab-canvas.canvas-edge-error.message.79cd4cb252b2");
  if (!CANVAS_EDGE_KINDS.includes(o["kind"] as CanvasEdgeKind))
    return tk("core-storylab-canvas.canvas-edge-error.message.883454015909");
  if (typeof o["label"] !== "string" || o["label"].length > CANVAS_LABEL_MAX)
    return tk("core-storylab-canvas.canvas-edge-error.message.e911d3a0a98b", { CANVAS_LABEL_MAX: String(CANVAS_LABEL_MAX) });
  return null;
}

/** En ny node med standardverdier. */
export function canvasNodeDefaults(
  kind: CanvasNodeKind,
  over: Partial<CanvasNodeFields> = {},
): CanvasNodeFields {
  return {
    kind,
    title: "",
    body: "",
    x: 0,
    y: 0,
    w: kind === "group" ? 480 : CANVAS_DEFAULT_W,
    h: kind === "group" ? 320 : CANVAS_DEFAULT_H,
    color: null,
    groupId: null,
    assetId: null,
    sceneId: null,
    ...over,
  };
}

/** En scene i hovedproduksjonen, i fortellingstid. `time` er null når scenen ikke har tidspunkt. */
export interface StoryScene {
  readonly sceneId: string;
  readonly occurrenceId: string;
  readonly heading: string;
  readonly time: number | null;
}

/**
 * Scenene i hovedproduksjonen sortert i fortellingstid. Scener uten tidspunkt kommer først («Uten
 * tidspunkt»), så resten; lik tid sorteres etter rekkefølgen i filmen.
 */
export function scenesInStoryTime(state: ProjectState): StoryScene[] {
  const main = mainProduction(state);
  if (!main) return [];
  const times = storyTimesCached(state);
  const occ = Object.values(state.occurrences)
    .filter((o) => o.productionId === main.id && o.active)
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
  const rows = occ.map((o, i) => {
    const v = state.variants[o.variantId];
    const t = times.get(o.sceneId);
    return {
      sceneId: o.sceneId,
      occurrenceId: o.id,
      heading: v ? formatHeading(v.heading) : "",
      time: t === undefined || !Number.isFinite(t) ? null : t,
      i,
    };
  });
  rows.sort((a, b) => {
    if (a.time === null && b.time !== null) return -1;
    if (b.time === null && a.time !== null) return 1;
    if (a.time !== null && b.time !== null && a.time !== b.time) return a.time - b.time;
    return a.i - b.i;
  });
  return rows.map(({ i: _i, ...r }) => r);
}

export interface LayoutNode extends CanvasNodeFields {
  /** Midlertidig nøkkel; kommandoen får ekte ID-er. */
  readonly key: string;
}

/**
 * Et foreslått førsteoppsett fra manuset: én premissnode og en scenenode per scene i fortellingstid langs
 * en vannrett tidslinje. Ren funksjon; ingenting lagres før brukeren velger «Bygg fra manuset».
 * Scener som allerede har en node på canvaset, hoppes over.
 */
export function layoutFromStructure(
  state: ProjectState,
  opts: { readonly originX?: number; readonly originY?: number; readonly gap?: number } = {},
): LayoutNode[] {
  const x0 = opts.originX ?? 0;
  const y0 = opts.originY ?? 0;
  const gap = opts.gap ?? 40;
  const taken = new Set(
    Object.values(state.canvasNodes)
      .filter((n) => !n.removed && n.sceneId)
      .map((n) => n.sceneId as string),
  );
  const hasPremise = Object.values(state.canvasNodes).some(
    (n) => !n.removed && n.kind === "premise",
  );
  const out: LayoutNode[] = [];
  if (!hasPremise)
    out.push({
      key: "premise",
      ...canvasNodeDefaults("premise", {
        title: state.project.name.slice(0, CANVAS_TITLE_MAX),
        x: x0,
        y: y0,
        w: 320,
      }),
    });
  const scenes = scenesInStoryTime(state).filter((s) => !taken.has(s.sceneId));
  scenes.forEach((s, i) =>
    out.push({
      key: `scene:${s.sceneId}`,
      ...canvasNodeDefaults("scene", {
        title: (s.heading || tk("core-storylab-canvas.title.s-heading-l-scene-uten-overskrift-untitled-scene-slice.5ae82d998c5e")).slice(
          0,
          CANVAS_TITLE_MAX,
        ),
        x: x0 + i * (CANVAS_DEFAULT_W + gap),
        y: y0 + CANVAS_DEFAULT_H + 2 * gap,
        sceneId: s.sceneId as never,
      }),
    }),
  );
  return out;
}

export const CANVAS_SUMMARY_MAX = 4000;

/**
 * Kort tekst om canvaset til intervjuprompten (høyst 4000 tegn). Bare nodenes type, tittel og et utdrag av
 * teksten, og kantene mellom dem. Tar aldri med fakta eller hemmeligheter fra Story Lab (story_facts).
 */
export function canvasSummary(state: ProjectState, max = CANVAS_SUMMARY_MAX): string {
  const nodes = Object.values(state.canvasNodes).filter((n) => !n.removed && n.kind !== "group");
  const title = new Map<string, string>(nodes.map((n) => [n.id, n.title || n.kind]));
  const lines: string[] = [];
  for (const n of nodes) {
    const body = n.body.replace(/\s+/g, " ").trim().slice(0, 160);
    lines.push(`- [${n.kind}] ${n.title || "(untitled)"}${body ? `: ${body}` : ""}`);
  }
  for (const e of Object.values(state.canvasEdges)) {
    if (e.removed) continue;
    const a = title.get(e.fromNodeId);
    const b = title.get(e.toNodeId);
    if (!a || !b) continue;
    lines.push(`- ${a} --${e.kind}${e.label ? ` (${e.label})` : ""}--> ${b}`);
  }
  let out = "";
  for (const l of lines) {
    if (out.length + l.length + 1 > max) break;
    out += (out ? "\n" : "") + l;
  }
  return out;
}

/** Kanter som berører nodene (også fjernede kanter når `withRemoved`). */
export function edgesOfNodes(
  state: ProjectState,
  ids: readonly (CanvasNodeId | string)[],
  withRemoved = false,
): string[] {
  const set = new Set<string>(ids);
  return Object.values(state.canvasEdges)
    .filter(
      (e) => (withRemoved || !e.removed) && (set.has(e.fromNodeId) || set.has(e.toNodeId)),
    )
    .map((e) => e.id);
}

export type { CanvasEdgeFields, CanvasNodeFields };
