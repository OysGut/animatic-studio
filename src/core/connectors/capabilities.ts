/**
 * C-0 kapabilitetsmodell: hver adapter sier hva den faktisk kan. Brukerflaten viser bare det som virker,
 * og ellers «Eksporter for …» (eksisterende eksport), aldri en knapp som feiler.
 */
export const CAPABILITIES = ["read", "write", "layers", "audio", "timeline", "notes"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface AdapterDescriptor {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly Capability[];
  /** Eksportformat i eksisterende eksportvindu som brukes når en kapabilitet mangler. */
  readonly exportFallback: string;
}

export const ADAPTERS: readonly AdapterDescriptor[] = [
  { id: "adobe-photoshop-uxp", name: "Adobe Photoshop", capabilities: ["read", "write", "layers", "notes"], exportFallback: "psd" },
  { id: "adobe-premiere-uxp", name: "Adobe Premiere Pro", capabilities: ["read", "write", "audio", "timeline", "notes"], exportFallback: "fcp7" },
  { id: "adobe-after-effects-legacy", name: "Adobe After Effects", capabilities: ["read", "layers", "timeline"], exportFallback: "ae" },
  { id: "procreate-handoff", name: "Procreate", capabilities: ["read", "write"], exportFallback: "png" },
  { id: "daw-roundtrip", name: "DAW", capabilities: ["read", "write", "audio", "timeline"], exportFallback: "wav" },
  // C-4: Boords API (beta, betalt plan). Lese/skrive frames (action/sound/dialogue + bilde) og kommentarer.
  { id: "boords-api", name: "Boords", capabilities: ["read", "write", "notes"], exportFallback: "pdf" },
  { id: "toonboom-sbpro", name: "Toon Boom Storyboard Pro", capabilities: ["read", "write", "audio", "timeline", "notes"], exportFallback: "otio" },
  { id: "storyboard-interchange", name: "Storyboard Pro / OTIO", capabilities: ["read", "timeline", "notes"], exportFallback: "otio" },
];

export type ActionOffer = { readonly kind: "action"; readonly capability: Capability } | { readonly kind: "export"; readonly format: string };

/** Hva brukerflaten skal vise for en ønsket handling mot en adapter. */
export function offerFor(adapter: AdapterDescriptor, wanted: Capability): ActionOffer {
  return adapter.capabilities.includes(wanted) ? { kind: "action", capability: wanted } : { kind: "export", format: adapter.exportFallback };
}
export const validDescriptor = (a: AdapterDescriptor): boolean =>
  /^[a-z0-9-]{3,64}$/.test(a.id) && a.capabilities.length > 0 && a.capabilities.every(c => (CAPABILITIES as readonly string[]).includes(c)) && new Set(a.capabilities).size === a.capabilities.length;

/** C-4: det Boords-koblingen ikke kan, vist ærlig i innstillingene (i18n-nøkler under c4.limit.*). */
export const BOORDS_LIMITS = ["paid-plan", "beta", "no-layers", "no-audio", "no-timeline", "no-etag", "partial-webhooks", "no-auto-apply"] as const;

/** C-5: det skriptpakken for Storyboard Pro ikke kan, vist ærlig (i18n-nøkler under c5.limit.*). */
export const SBPRO_LIMITS = ["no-browser", "no-layers-back", "captions-only", "no-auto-apply", "lossless-conform-only", "unverified"] as const;
