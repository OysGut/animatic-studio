/** Canvaset lastes bare i nettleseren (React Flow bruker DOM-API-er). */
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { L } from "@/core";
import type { CanvasViewProps } from "./CanvasView";

const CanvasView = lazy(() => import("./CanvasView"));

export function LazyCanvasView(p: CanvasViewProps) {
  const loading = <p className="p-6 text-[13px] text-text-tertiary">{L("Henter canvaset …", "Loading the canvas …")}</p>;
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        <CanvasView {...p} />
      </Suspense>
    </ClientOnly>
  );
}
