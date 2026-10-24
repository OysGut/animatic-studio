/**
 * Lager plugins/photoshop/dist/ og en .ccx for sidelasting (UXP Developer Tool eller dobbeltklikk).
 * En .ccx er et ZIP-arkiv med manifest.json øverst. Kjør: bun plugins/photoshop/scripts/pack.ts
 * Ikonene tegnes her (enkle, rettighetsfrie), så repoet ikke trenger binærfiler.
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { storedZip } from "../../../src/core/handoff/bytes";
import { encodePng } from "../../../src/core/handoff/png";
import { checkUxpManifest } from "../src/manifest-check";

const DIR = join(import.meta.dir, "..");
const DIST = join(DIR, "dist");
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const issues = checkUxpManifest(manifest, { allowedDomains: ["https://pentoglass.com"], panelIds: ["ptgPanel"] });
if (issues.length) { console.error(issues); process.exit(1); }

function icon(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, inGlass = Math.abs(x - size / 2) < size * 0.28 && y > size * 0.2 && y < size * 0.8, pen = Math.abs(x - y) < size * 0.08;
    const v = pen ? 240 : inGlass ? 150 : 0;
    px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = pen || inGlass ? 255 : 0;
  }
  return encodePng(size, size, px);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "icons"), { recursive: true });
await build({ entryPoints: [join(DIR, "src/main.ts")], bundle: true, format: "iife", platform: "browser", target: "es2020", outfile: join(DIST, "main.js"), legalComments: "none", minify: false });
const files: { path: string; data: Uint8Array }[] = [
  { path: "manifest.json", data: readFileSync(join(DIR, "manifest.json")) },
  { path: "index.html", data: readFileSync(join(DIR, "index.html")) },
  { path: "main.js", data: readFileSync(join(DIST, "main.js")) },
  { path: "icons/panel.png", data: icon(23) }, { path: "icons/panel@2x.png", data: icon(46) },
  { path: "icons/plugin.png", data: icon(48) }, { path: "icons/plugin@2x.png", data: icon(96) },
];
for (const f of files) writeFileSync(join(DIST, f.path), f.data);
const ccx = join(DIST, `com.pentoglass.photoshop_${manifest.version}.ccx`);
writeFileSync(ccx, storedZip(files));
console.log(`Laget ${ccx} (${files.length} filer)`);
