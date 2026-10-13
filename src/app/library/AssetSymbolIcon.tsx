/**
 * Ressursens enkle symbol (DEC-0079): fylt form i ressursens egen farge, uten omriss, ansikt eller øyne.
 * Brukes i lister og som erstatning når ressursen ikke har bilde ennå.
 */
import { useMemo } from "react";
import { assetSymbol, assetSymbolColors, type ProjectState } from "@/core";

export function AssetSymbolIcon({
  state,
  assetId,
  className,
  title,
}: {
  state: ProjectState;
  assetId: string;
  className?: string;
  title?: string;
}) {
  const colors = useMemo(() => assetSymbolColors(state), [state]);
  const sym = assetSymbol(state, assetId, colors);
  if (!sym) return null;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={sym.path} fill={sym.color} fillRule="nonzero" />
    </svg>
  );
}
