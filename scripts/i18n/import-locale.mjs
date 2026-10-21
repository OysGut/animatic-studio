import { importLocale, ROOT } from './locale-tools.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [code, directory] = process.argv.slice(2);
if (!code || !directory) throw new Error('Usage: import-locale.mjs <code> <directory>');
const { report } = importLocale(code, directory);
writeFileSync(join(ROOT, `docs/development/SPRAK/${code}-import-report.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`${code}: ${report.imported} imported, ${report.errors.length} errors, ${report.stale.length} stale, ${report.missing.length} missing`);
if (report.errors.length) process.exitCode = 1;