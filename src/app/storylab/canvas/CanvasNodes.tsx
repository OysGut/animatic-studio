/**
 * Skrivecanvaset (SL7): nodekomponentene, én per type, med ikon og tokenfarge. Karakter- og stednoder viser
 * miniatyr fra biblioteket når de er koblet; scenenoder viser sceneoverskrift og tidspunkt i fortellingen.
 */
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  BookOpen,
  Box,
  Clapperboard,
  Flag,
  GitBranch,
  GitFork,
  Lightbulb,
  Link2,
  MapPin,
  Milestone,
  StickyNote,
  Undo2,
  User,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { memo, type ComponentType } from "react";
import { L, canvasNodeKindLabel, type CanvasNode, type CanvasNodeKind, type ProjectState } from "@/core";
import { AssetThumb } from "@/app/library/AssetThumb";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export const KIND_ICON: Record<CanvasNodeKind, LucideIcon> = {
  premise: BookOpen,
  plot: Waypoints,
  subplot: GitBranch,
  plot_point: Flag,
  turning_point: Zap,
  event: Milestone,
  consequence: Undo2,
  scene: Clapperboard,
  character: User,
  location: MapPin,
  relation: Link2,
  note: StickyNote,
  idea: Lightbulb,
  alternative: GitFork,
  group: Box,
};

/** Kantfarge per type (tokens). */
export const KIND_ACCENT: Record<CanvasNodeKind, string> = {
  premise: "border-accent-brand",
  plot: "border-accent-warm",
  subplot: "border-accent-warm",
  plot_point: "border-status-running",
  turning_point: "border-status-danger",
  event: "border-status-running",
  consequence: "border-status-discrepancy",
  scene: "border-status-success",
  character: "border-status-uncertain",
  location: "border-status-moved",
  relation: "border-status-neutral",
  note: "border-note",
  idea: "border-note",
  alternative: "border-status-discrepancy",
  group: "border-border-strong",
};

/** Fargene brukeren kan velge (token-navn → klasse). */
export const COLOR_TOKENS: Record<string, string> = {
  "accent-brand": "border-accent-brand",
  "accent-warm": "border-accent-warm",
  "status-success": "border-status-success",
  "status-danger": "border-status-danger",
  "status-running": "border-status-running",
  "status-uncertain": "border-status-uncertain",
  "status-discrepancy": "border-status-discrepancy",
  note: "border-note",
};

export function colorLabel(token: string): string {
  const labels: Record<string, string> = {
    "accent-brand": t("app-storylab-canvas-canvas-nodes.accent-brand.accent-brand.0b1cc44ff2cf"),
    "accent-warm": t("app-storylab-canvas-canvas-nodes.accent-warm.accent-warm.79e6a4bde59b"),
    "status-success": t("app-storylab-canvas-canvas-nodes.status-success.status-success.b1fc5276ed8f"),
    "status-danger": t("app-storylab-canvas-canvas-nodes.status-danger.status-danger.39de3665e2e0"),
    "status-running": t("app-storylab-canvas-canvas-nodes.status-running.status-running.3ef4ba5dd95d"),
    "status-uncertain": t("app-storylab-canvas-canvas-nodes.status-uncertain.status-uncertain.301fff7cbc3e"),
    "status-discrepancy": t("app-storylab-canvas-canvas-nodes.status-discrepancy.status-discrepancy.9c6225d46104"),
    note: t("app-storylab-canvas-canvas-nodes.note.note.280ce95b5018"),
  };
  return labels[token] ?? token;
}

export interface CanvasNodeData extends Record<string, unknown> {
  readonly node: CanvasNode;
  readonly state: ProjectState;
  readonly sceneInfo: { heading: string; time: string } | null;
  /** U5: URL til ressursens forsidebilde, hentet samlet i canvaset. */
  readonly cover?: string | undefined;
  readonly onOpen: ((n: CanvasNode) => void) | null;
}
export type StoryFlowNode = Node<CanvasNodeData>;

function NodeBody({ data, selected, kind }: NodeProps<StoryFlowNode> & { kind: CanvasNodeKind }) {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const n = data.node;
  const Icon = KIND_ICON[kind];
  const accent = (n.color && COLOR_TOKENS[n.color]) || KIND_ACCENT[kind];
  const linked = n.assetId || n.sceneId;
  if (kind === "group")
    return (
      <div
        data-testid="canvas-node"
        data-kind={kind}
        data-node-id={n.id}
        className={`h-full w-full rounded-md border-2 border-dashed bg-surface-1/40 p-2 text-[12px] ${accent} ${selected ? "ring-2 ring-focus-ring" : ""}`}
      >
        <span className="flex items-center gap-1 font-medium text-text-secondary">
          <Icon className="size-3.5" aria-hidden />
          {n.title || canvasNodeKindLabel(kind)}
        </span>
      </div>
    );
  return (
    <div
      data-testid="canvas-node"
      data-kind={kind}
      data-node-id={n.id}
      className={`flex h-full w-full flex-col overflow-hidden rounded-sm border-l-4 border bg-surface-2 p-2 text-[12px] text-text-primary shadow-sm ${accent} ${selected ? "ring-2 ring-focus-ring" : ""}`}
    >
      <Handle type="target" position={Position.Left} aria-label={t("app-storylab-canvas-canvas-nodes.node-body.aria-label.60e39e1fafa3")} />
      <div className="flex min-w-0 items-center gap-1.5">
        {(kind === "character" || kind === "location") && n.assetId ? (
          <AssetThumb state={data.state} assetId={n.assetId} url={data.cover} size="sm" />
        ) : (
          <Icon className="size-3.5 shrink-0 text-text-secondary" aria-hidden />
        )}
        <span className="text-chrome-label uppercase tracking-label text-text-tertiary">{canvasNodeKindLabel(kind)}</span>
        {linked && data.onOpen ? (
          <button
            type="button"
            data-testid="canvas-node-open"
            className="nodrag ml-auto rounded-sm px-1 text-[11px] text-accent-brand hover:bg-surface-3 focus-visible:ring-1 focus-visible:ring-focus-ring"
            onClick={(e) => {
              e.stopPropagation();
              data.onOpen?.(n);
            }}
            aria-label={n.sceneId ? t("app-storylab-canvas-canvas-nodes.node-body.aria-label.5bbbbf07456c") : t("app-storylab-canvas-canvas-nodes.node-body.aria-label.406f71ff7ff1")}
          >
            {t("app-storylab-canvas-canvas-nodes.node-body.button.73160a1f3319")}
          </button>
        ) : null}
      </div>
      <strong className="mt-1 line-clamp-2 break-words font-medium">{n.title || t("app-storylab-canvas-canvas-nodes.node-body.strong.53b4cb83313f")}</strong>
      {data.sceneInfo ? (
        <span className="text-[11px] text-text-secondary">
          {data.sceneInfo.heading} · {data.sceneInfo.time}
        </span>
      ) : null}
      {n.body ? <p className="mt-1 line-clamp-3 break-words text-text-secondary">{n.body}</p> : null}
      <Handle type="source" position={Position.Right} aria-label={t("app-storylab-canvas-canvas-nodes.node-body.aria-label.e00fa4c90f76")} />
    </div>
  );
}

const make = (kind: CanvasNodeKind) => {
  const C = memo((p: NodeProps<StoryFlowNode>) => <NodeBody {...p} kind={kind} />);
  C.displayName = `CanvasNode_${kind}`;
  return C;
};

/** Egne komponenter per nodetype (nodeTypes til React Flow). */
export const NODE_TYPES: Record<CanvasNodeKind, ComponentType<NodeProps<StoryFlowNode>>> = {
  premise: make("premise"),
  plot: make("plot"),
  subplot: make("subplot"),
  plot_point: make("plot_point"),
  turning_point: make("turning_point"),
  event: make("event"),
  consequence: make("consequence"),
  scene: make("scene"),
  character: make("character"),
  location: make("location"),
  relation: make("relation"),
  note: make("note"),
  idea: make("idea"),
  alternative: make("alternative"),
  group: make("group"),
};


