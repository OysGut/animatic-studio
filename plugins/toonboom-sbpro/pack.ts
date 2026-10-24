/** Pakker skriptene til dist/PtG-sbpro-<versjon>.zip (kjør: bun plugins/toonboom-sbpro/pack.ts). Ingen hemmeligheter. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { storedZip } from "../../src/core/handoff/bytes";
import { findSecrets } from "../../src/core/connectors/manifest";

const dir = join(import.meta.dirname, "scripts");
const lib = readFileSync(join(dir, "PtG_lib.js"), "utf8");
const version = /P\.VERSION = "([^"]+)"/.exec(lib)?.[1] ?? "0.0.0";
const files = readdirSync(dir).filter(f => f.endsWith(".js")).sort().map(f => ({ path: `PtG/${f}`, data: new Uint8Array(readFileSync(join(dir, f))) }));
for (const f of files) {
  const text = new TextDecoder().decode(f.data);
  if (/\b(let|const)\s|=>|`/.test(text)) throw new Error(`${f.path}: ikke ES5`);
  if (/sb_secret_|service_role|ptg_(access|refresh)_[A-Za-z0-9]{10}/.test(text) || findSecrets({ text }).length) throw new Error(`${f.path}: mulig hemmelighet`);
}
files.push({ path: "PtG/README.md", data: new Uint8Array(readFileSync(join(import.meta.dirname, "README.md"))) });
mkdirSync(join(import.meta.dirname, "dist"), { recursive: true });
const out = join(import.meta.dirname, "dist", `PtG-sbpro-${version}.zip`);
writeFileSync(out, storedZip(files));
console.log(out);
