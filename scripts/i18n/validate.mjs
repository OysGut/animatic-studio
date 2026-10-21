/** Catalog checks share the exact pure runtime validator, transpiled without executing app code. */
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, inventorySource, sourceFiles } from './inventory.mjs';
import { localeFreshnessErrors } from './locale-tools.mjs';
const code = ts.transpileModule(readFileSync(join(ROOT, 'src/core/i18n/messages.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { catalogErrors, messageParameterNames } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
export function checkKeyedCatalogs(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'src/core/i18n/manifest.json'), 'utf8'));
  const catalogs = Object.fromEntries(manifest.languages.map((lang) => [lang.tag, JSON.parse(readFileSync(join(root, `src/core/i18n/locales/${lang.tag}.json`), 'utf8'))]));
  const errors = [...catalogErrors(manifest, catalogs), ...localeFreshnessErrors(root)];
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, 'utf8');
    for (const reference of inventorySource(source, path).references.filter((ref) => ref.kind === 't')) {
      if (!reference.key) errors.push(`Dynamic translation key requires explicit key union: ${reference.file}:${reference.line}`);
      else if (!catalogs.nb[reference.key]) errors.push(`Unknown translation key ${reference.key}: ${reference.file}:${reference.line}`);
      else if (reference.parameterNames !== null && JSON.stringify(reference.parameterNames) !== JSON.stringify(messageParameterNames(catalogs.nb[reference.key]))) errors.push(`Translation parameter mismatch ${reference.key}: ${reference.file}:${reference.line}`);
    }
  }
  return errors;
}
