/**
 * Lager plugins/audition/dist/com.pentoglass.audition/ (mappe for sidelasting i CEP-extensions-mappen) og en
 * usignert ZIP med samme innhold. Kjør: bun plugins/audition/scripts/pack.ts
 *
 * Signering (forberedt, ikke gjort): en signert .zxp lages senere med Adobes ZXPSignCmd og et eget sertifikat:
 *   ZXPSignCmd -selfSignedCert NO Oslo "Trollfilm" "From Pen to Glass" <passord> cert.p12
 *   ZXPSignCmd -sign dist/com.pentoglass.audition dist/com.pentoglass.audition_<versjon>.zxp cert.p12 <passord> -tsa http://timestamp.digicert.com
 * Sertifikat og passord skal aldri inn i repoet.
 * CSInterface.js er Adobes fil (github.com/Adobe-CEP/CEP-Resources); legg den i plugins/audition/vendor/ før pakking.
 */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { storedZip } from "../../../src/core/handoff/bytes";
import { checkAuditionManifest } from "../src/manifest-check";

const DIR = join(new URL(".", import.meta.url).pathname, "..");
const OUT = join(DIR, "dist/com.pentoglass.audition");
const manifest = readFileSync(join(DIR, "CSXS/manifest.xml"), "utf8");
const issues = checkAuditionManifest(manifest);
if (issues.length) { console.error(issues); process.exit(1); }
const version = /ExtensionBundleVersion="([^"]+)"/.exec(manifest)![1]!;

rmSync(join(DIR, "dist"), { recursive: true, force: true });
mkdirSync(join(OUT, "CSXS"), { recursive: true });
mkdirSync(join(OUT, "jsx"), { recursive: true });
await build({ entryPoints: [join(DIR, "src/main.ts")], bundle: true, format: "iife", platform: "browser", target: "chrome100", outfile: join(OUT, "main.js"), legalComments: "none", minify: false });
cpSync(join(DIR, "CSXS/manifest.xml"), join(OUT, "CSXS/manifest.xml"));
cpSync(join(DIR, "index.html"), join(OUT, "index.html"));
cpSync(join(DIR, "jsx/host.jsx"), join(OUT, "jsx/host.jsx"));
const vendor = join(DIR, "vendor/CSInterface.js");
if (existsSync(vendor)) cpSync(vendor, join(OUT, "CSInterface.js"));
else console.warn("Mangler vendor/CSInterface.js – hent den fra Adobe-CEP/CEP-Resources før prøving i Audition.");
const files = ["CSXS/manifest.xml", "index.html", "main.js", "jsx/host.jsx", ...(existsSync(vendor) ? ["CSInterface.js"] : [])]
  .map(p => ({ path: `com.pentoglass.audition/${p}`, data: readFileSync(join(OUT, p)) }));
const zip = join(DIR, `dist/com.pentoglass.audition_${version}_unsigned.zip`);
writeFileSync(zip, storedZip(files));
console.log(`Laget ${OUT} og ${zip} (${files.length} filer, usignert)`);
