/**
 * Skrivecanvaset i Story Lab (SL7): et parallelt, visuelt arbeidsrom ved siden av manuset. Noder og kanter er
 * prosjektdata som skrives med kommandoer (AddCanvasNodes …). Denne modulen er ren: validering, et foreslått
 * førsteoppsett fra manuset (layoutFromStructure) og en kort tekst om canvaset til intervjuprompten.
 */
import { L } from "../i18n";
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
    premise: L("Premiss", "Premise"),
    plot: L("Plot", "Plot"),
    subplot: L("Sideplot", "Subplot"),
    plot_point: L("Plotpunkt", "Plot point"),
    turning_point: L("Vendepunkt", "Turning point"),
    event: L("Hendelse", "Event"),
    consequence: L("Konsekvens", "Consequence"),
    scene: L("Scene", "Scene"),
    character: L("Karakter", "Character"),
    location: L("Sted", "Location"),
    relation: L("Relasjon", "Relation"),
    note: L("Notat", "Note"),
    idea: L("Idé", "Idea"),
    alternative: L("Alternativ", "Alternative"),
    group: L("Gruppe", "Group"),
  };
  return labels[k];
}

export function canvasEdgeKindLabel(k: CanvasEdgeKind): string {
  const labels: Record<CanvasEdgeKind, string> = {
    leads_to: L("Fører til", "Leads to"),
    causes: L("Forårsaker", "Causes"),
    conflicts: L("Er i konflikt med", "Conflicts with"),
    relation: L("Relasjon", "Relation"),
    alternative_of: L("Alternativ til", "Alternative of"),
    belongs_to: L("Hører til", "Belongs to"),
  };
  return labels[k];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Feil i feltene til en node (null = gyldig). Sjekker ikke at koblinger finnes (det gjør kommandoen). */
export function canvasNodeError(f: unknown): string | null {
  if (!f || typeof f !== "object") return L("Ugyldig node", "Invalid node");
  const o = f as Record<string, unknown>;
  if (!CANVAS_NODE_KINDS.includes(o["kind"] as CanvasNodeKind))
    return L("Ukjent nodetype", "Unknown node type");
  if (typeof o["title"] !== "string" || o["title"].length > CANVAS_TITLE_MAX)
    return L(
      `Tittelen kan være høyst ${CANVAS_TITLE_MAX} tegn`,
      `The title can be at most ${CANVAS_TITLE_MAX} characters`,
    );
  if (typeof o["body"] !== "string" || o["body"].length > CANVAS_BODY_MAX)
    return L(
      `Teksten kan være høyst ${CANVAS_BODY_MAX} tegn`,
      `The text can be at most ${CANVAS_BODY_MAX} characters`,
    );
  for (const k of ["x", "y"] as const)
    if (!finite(o[k]) || Math.abs(o[k]) > CANVAS_COORD_MAX)
      return L("Ugyldig posisjon", "Invalid position");
  for (const k of ["w", "h"] as const)
    if (!finite(o[k]) || o[k] <= 0 || o[k] > CANVAS_SIZE_MAX)
      return L("Ugyldig størrelse", "Invalid size");
  if (o["color"] !== null && (typeof o["color"] !== "string" || !COLOR_RE.test(o["color"])))
    return L("Ugyldig farge", "Invalid colour");
  for (const k of ["groupId", "assetId", "sceneId"] as const)
    if (o[k] !== null && typeof o[k] !== "string") return L("Ugyldig kobling", "Invalid link");
  return null;
}

/** Feil i feltene til en kant (null = gyldig). */
export function canvasEdgeError(f: unknown): string | null {
  if (!f || typeof f !== "object") return L("Ugyldig kobling", "Invalid connection");
  const o = f as Record<string, unknown>;
  if (typeof o["fromNodeId"] !== "string" || typeof o["toNodeId"] !== "string")
    return L("Koblingen mangler en node", "The connection is missing a node");
  if (o["fromNodeId"] === o["toNodeId"])
    return L("En node kan ikke kobles til seg selv", "A node cannot be connected to itself");
  if (!CANVAS_EDGE_KINDS.includes(o["kind"] as CanvasEdgeKind))
    return L("Ukjent koblingstype", "Unknown connection type");
  if (typeof o["label"] !== "string" || o["label"].length > CANVAS_LABEL_MAX)
    return L(
      `Etiketten kan være høyst ${CANVAS_LABEL_MAX} tegn`,
      `The label can be at most ${CANVAS_LABEL_MAX} characters`,
    );
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
        title: (s.heading || L("Scene uten overskrift", "Untitled scene")).slice(
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
