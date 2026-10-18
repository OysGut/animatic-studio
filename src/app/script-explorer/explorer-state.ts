export interface ExplorerState {
  readonly modus: "follow" | "search";
  readonly scene?: string;
  readonly blokk?: string;
  readonly q?: string;
  readonly karakter?: string;
  readonly kilde?: string;
}
export function validateExplorerSearch(search: Record<string, unknown>): ExplorerState {
  const id = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
  const scene = id(search["scene"]), blokk = id(search["blokk"]), kilde = id(search["kilde"]);
  return {
    modus: search["modus"] === "search" ? "search" : "follow",
    ...(scene ? { scene } : {}), ...(blokk ? { blokk } : {}), ...(kilde ? { kilde } : {}),
    ...(typeof search["q"] === "string" ? { q: search["q"].slice(0, 1000) } : {}),
    ...(typeof search["karakter"] === "string" ? { karakter: search["karakter"].slice(0, 300) } : {}),
  };
}
export function explorerUrl(projectId: string, source: string, state: ExplorerState): string {
  const search = new URLSearchParams({ ...state, kilde: source });
  return `/manusutforsker/${encodeURIComponent(projectId)}?${search}`;
}