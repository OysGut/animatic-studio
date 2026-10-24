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
  /**
   * C-9: hvordan koblingen faktisk går. «plugin»/«api»: bygget kobling (A/B). «handoff»: C-1-filvei med
   * returside (send og ta imot). «export»: bare «Eksporter for …» med eksisterende formater; ingen knapper
   * for lesing eller skriving, selv om programmet har et API vi ikke har bygget mot.
   */
  readonly connection: ConnectionKind;
  /** C-9: eksisterende eksportformater som passer programmet (vises under «Eksporter for …»). */
  readonly exportFormats?: readonly string[];
}
/** Formater vi faktisk lager i dag (C-1, PTG3 Dragonframe, PTG6 klippefiler, PTG7 Fusion, filmeksport, B-102). */
export const EXISTING_EXPORT_FORMATS = ["psd", "png", "svg", "wav", "otio", "fcp7", "edl", "fusion", "dragonframe", "mp4", "fbx", "ae", "pdf"] as const;
export const CONNECTION_KINDS = ["plugin", "api", "handoff", "export"] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const ADAPTERS: readonly AdapterDescriptor[] = [
  { id: "adobe-photoshop-uxp", name: "Adobe Photoshop", capabilities: ["read", "write", "layers", "notes"], exportFallback: "psd", connection: "plugin" },
  { id: "adobe-premiere-uxp", name: "Adobe Premiere Pro", capabilities: ["read", "write", "audio", "timeline", "notes"], exportFallback: "fcp7", connection: "plugin" },
  { id: "adobe-after-effects-legacy", name: "Adobe After Effects", capabilities: ["read", "layers", "timeline"], exportFallback: "ae", connection: "plugin" },
  { id: "procreate-handoff", name: "Procreate", capabilities: ["read", "write"], exportFallback: "png", connection: "handoff" },
  // C-7: Illustrator via CEP/ExtendScript (UXP ikke offentlig). SVG/.ai ut med lag; retur som flat PNG-kandidat.
  { id: "adobe-illustrator-cep", name: "Adobe Illustrator", capabilities: ["read", "write", "layers"], exportFallback: "svg", connection: "plugin" },
  // C-6: Audition via CEP (ikke UXP). Lyd ut som BWF med ID-er og multitrack-økt; retur blir kandidatversjon.
  { id: "adobe-audition-cep", name: "Adobe Audition", capabilities: ["read", "write", "audio", "timeline"], exportFallback: "wav", connection: "plugin" },
  // C-8: Python-tillegg. Krita: lag inn, flat PNG-kandidat tilbake. Blender: kamera/referanser inn, rendringer tilbake.
  { id: "krita-python", name: "Krita", capabilities: ["read", "write", "layers"], exportFallback: "psd", connection: "plugin" },
  { id: "blender-python", name: "Blender", capabilities: ["read", "write", "timeline"], exportFallback: "fbx", connection: "plugin" },
  { id: "daw-roundtrip", name: "DAW", capabilities: ["read", "write", "audio", "timeline"], exportFallback: "wav", connection: "handoff" },
  // C-4: Boords API (beta, betalt plan). Lese/skrive frames (action/sound/dialogue + bilde) og kommentarer.
  { id: "boords-api", name: "Boords", capabilities: ["read", "write", "notes"], exportFallback: "pdf", connection: "api" },
  { id: "toonboom-sbpro", name: "Toon Boom Storyboard Pro", capabilities: ["read", "write", "audio", "timeline", "notes"], exportFallback: "otio", connection: "plugin" },
  { id: "storyboard-interchange", name: "Storyboard Pro / OTIO", capabilities: ["read", "timeline", "notes"], exportFallback: "otio", connection: "handoff" },
  // C-9 (docs/connectors/CAPABILITY_MATRIX.md): bare filvei i dag. Ingen plugin er bygget, så brukerflaten
  // viser bare «Eksporter for …» med formatene vi allerede lager.
  { id: "toonboom-harmony", name: "Toon Boom Harmony", capabilities: [], exportFallback: "psd", connection: "export", exportFormats: ["psd", "png", "wav"] },
  { id: "davinci-resolve", name: "DaVinci Resolve", capabilities: [], exportFallback: "otio", connection: "export", exportFormats: ["otio", "fcp7", "edl", "wav"] },
  { id: "blackmagic-fusion", name: "Fusion", capabilities: [], exportFallback: "fusion", connection: "export", exportFormats: ["fusion", "png"] },
  { id: "clip-studio-paint", name: "Clip Studio Paint", capabilities: [], exportFallback: "psd", connection: "export", exportFormats: ["psd", "png"] },
  { id: "procreate-dreams", name: "Procreate Dreams", capabilities: [], exportFallback: "png", connection: "export", exportFormats: ["png", "mp4", "wav"] },
  { id: "dragonframe", name: "Dragonframe", capabilities: [], exportFallback: "dragonframe", connection: "export", exportFormats: ["dragonframe", "wav"] },
  { id: "reaper", name: "REAPER", capabilities: [], exportFallback: "wav", connection: "export", exportFormats: ["wav"] },
];

export type ActionOffer = { readonly kind: "action"; readonly capability: Capability } | { readonly kind: "export"; readonly format: string };

/** Hva brukerflaten skal vise for en ønsket handling mot en adapter. */
export function offerFor(adapter: AdapterDescriptor, wanted: Capability): ActionOffer {
  if (adapter.connection === "export") return { kind: "export", format: adapter.exportFallback };
  return adapter.capabilities.includes(wanted) ? { kind: "action", capability: wanted } : { kind: "export", format: adapter.exportFallback };
}
export const validDescriptor = (a: AdapterDescriptor): boolean =>
  /^[a-z0-9-]{3,64}$/.test(a.id) && (CONNECTION_KINDS as readonly string[]).includes(a.connection)
  && (a.connection === "export" ? a.capabilities.length === 0 && (a.exportFormats?.length ?? 0) > 0 : a.capabilities.length > 0) && a.capabilities.every(c => (CAPABILITIES as readonly string[]).includes(c)) && new Set(a.capabilities).size === a.capabilities.length;

/** C-4: det Boords-koblingen ikke kan, vist ærlig i innstillingene (i18n-nøkler under c4.limit.*). */
export const BOORDS_LIMITS = ["paid-plan", "beta", "no-layers", "no-audio", "no-timeline", "no-etag", "partial-webhooks", "no-auto-apply"] as const;

/** C-5: det skriptpakken for Storyboard Pro ikke kan, vist ærlig (i18n-nøkler under c5.limit.*). */
export const SBPRO_LIMITS = ["no-browser", "no-layers-back", "captions-only", "no-auto-apply", "lossless-conform-only", "unverified"] as const;
