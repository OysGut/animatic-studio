/**
 * B-105a: forhåndsvisningen av bildeprompten hentes fra serveren (malene og stilreglene ligger bare der).
 * Klienten sender innstillingene; svaret er beskrivelsen brukeren kan se og redigere.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { previewImagePrompt, type ImagePromptPreview } from "@/adapters/ai/image-prompt.functions";

/** Innstillingene prompten bygges fra (valideres med zod på serveren). */
export type ImagePromptRequestInput = Record<string, unknown> & { readonly kind: string };

const stateIds = new WeakMap<object, number>();
let nextStateId = 0;
/** Et tall som endres når prosjekttilstanden (uforanderlig objekt) byttes ut. */
function stateKey(state: object | null): number {
  if (!state) return 0;
  let id = stateIds.get(state);
  if (id === undefined) stateIds.set(state, (id = ++nextStateId));
  return id;
}

export function useImagePromptPreview(
  projectId: string,
  request: ImagePromptRequestInput | null,
  /** Prosjekttilstanden prompten bygger på: ny tilstand gir ny forhåndsvisning. */
  state: object | null = null,
) {
  const fn = useServerFn(previewImagePrompt);
  const revision = stateKey(state);
  const key = request ? JSON.stringify(request) : "";
  return useQuery({
    queryKey: ["image-prompt-preview", projectId, key, revision],
    enabled: request !== null,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<ImagePromptPreview | null> => {
      const r = await fn({ data: { projectId, request } });
      return r.ok ? r.preview : null;
    },
  });
}
