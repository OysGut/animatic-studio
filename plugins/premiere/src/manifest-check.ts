/**
 * Kontroll av UXP-manifestet (v5) for Premiere før pakking og i testene: vert «premierepro» fra 25.6 (UXP GA),
 * nettverk bare til appens domene uten jokertegn, bare https i launchProcess, ingen hemmeligheter, panelet finnes.
 */
export interface ManifestIssue { readonly path: string; readonly problem: string }
const SECRET = /(secret|password|token|api[_-]?key|sb_secret_|sk_live)/i;

export function checkPremiereManifest(m: unknown, opts: { allowedDomains: readonly string[]; panelIds: readonly string[] }): ManifestIssue[] {
  const out: ManifestIssue[] = [];
  const o = (m ?? {}) as any;
  if (o.manifestVersion !== 5) out.push({ path: "manifestVersion", problem: "must be 5" });
  if (typeof o.id !== "string" || !/^[a-z0-9.]+$/i.test(o.id)) out.push({ path: "id", problem: "required" });
  if (typeof o.version !== "string" || !/^\d+\.\d+\.\d+$/.test(o.version)) out.push({ path: "version", problem: "semver x.y.z" });
  if (o.main !== "index.html") out.push({ path: "main", problem: "must be index.html" });
  const hosts = Array.isArray(o.host) ? o.host : [o.host];
  const h = hosts.find((x: any) => x?.app === "premierepro");
  if (!h) out.push({ path: "host", problem: "premierepro required" });
  else {
    const [maj, min] = String(h.minVersion ?? "").split(".").map(Number);
    if (!(maj! > 25 || (maj === 25 && min! >= 6))) out.push({ path: "host.minVersion", problem: "25.6.0 or newer" });
  }
  const domains = o.requiredPermissions?.network?.domains;
  if (!Array.isArray(domains) || !domains.length) out.push({ path: "requiredPermissions.network.domains", problem: "required" });
  else for (const d of domains) if (typeof d !== "string" || d.includes("*") || !d.startsWith("https://") || !opts.allowedDomains.includes(d)) out.push({ path: "requiredPermissions.network.domains", problem: `not allowed: ${String(d)}` });
  const schemes = o.requiredPermissions?.launchProcess?.schemes;
  if (!Array.isArray(schemes) || schemes.some((x: unknown) => x !== "https")) out.push({ path: "requiredPermissions.launchProcess.schemes", problem: "only https" });
  const panels = (o.entrypoints ?? []).filter((e: any) => e?.type === "panel").map((e: any) => e.id);
  for (const id of opts.panelIds) if (!panels.includes(id)) out.push({ path: "entrypoints", problem: `missing panel ${id}` });
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string" && SECRET.test(v)) out.push({ path, problem: "looks like a secret" });
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (SECRET.test(k)) out.push({ path: `${path}.${k}`, problem: "secret-like key" }); walk(x, `${path}.${k}`); }
  };
  walk(o, "$");
  return out;
}
