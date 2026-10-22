// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const root = resolve(__dirname, '../../src');

function bareImports(source: string): string[] {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ast.statements.flatMap(statement =>
    ts.isImportDeclaration(statement) && !statement.importClause && ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text] : [],
  );
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? files(file) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

it('detects bare runtime imports, including multiline syntax', () => {
  expect(bareImports('import\n "./register"; import { init } from "./named"; // import "./comment";'))
    .toEqual(['./register']);
});

it('src contains no unreviewed runtime side-effect imports', () => {
  const violations = files(root).flatMap(file => bareImports(readFileSync(file, 'utf8')).flatMap(module => {
    const path = relative(root, file).replaceAll('\\', '/');
    if (/\.css$/.test(module)) return []; // Styles are intentional assets, not runtime registration.
    if (path === 'test/setup.ts' && module === '@testing-library/jest-dom/vitest') return [];
    return [`${path}: ${module}`];
  }));
  expect(violations).toEqual([]);
});