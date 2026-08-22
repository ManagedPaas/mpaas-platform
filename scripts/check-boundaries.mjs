import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx"]);

export const moduleRoots = new Map([
  ["apps/web", "apps/web/src"],
  ["apps/api", "apps/api/src"],
  ["apps/worker", "apps/worker/src"],
  ["apps/runner", "apps/runner/src"],
  ["packages/domain", "packages/domain/src"],
  ["packages/contracts", "packages/contracts/src"],
  ["packages/tool-sdk", "packages/tool-sdk/src"],
  ["packages/persistence", "packages/persistence/src"]
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function moduleForPath(path) {
  const projectRelative = normalize(relative(projectRoot, path));
  for (const [moduleName, sourceRoot] of moduleRoots) {
    const normalizedRoot = normalize(sourceRoot);
    if (projectRelative === normalizedRoot || projectRelative.startsWith(`${normalizedRoot}/`)) {
      return moduleName;
    }
  }
  return undefined;
}

function resolveTypeScriptImport(importerPath, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const withoutRuntimeExtension = specifier.replace(/\.(?:js|mjs|cjs)$/, ".ts");
  return resolve(dirname(importerPath), withoutRuntimeExtension);
}

export function validateImport(importerPath, specifier) {
  const importerModule = moduleForPath(importerPath);
  const targetPath = resolveTypeScriptImport(importerPath, specifier);
  const targetModule = targetPath && moduleForPath(targetPath);

  if (!importerModule || !targetModule || importerModule === targetModule) return [];

  const publicApi = resolve(projectRoot, moduleRoots.get(targetModule), "index.ts");
  if (normalize(targetPath) !== normalize(publicApi)) {
    return [`${relative(projectRoot, importerPath)} imports ${specifier}; cross-module imports must target ${relative(projectRoot, publicApi)}`];
  }
  if (normalize(targetPath).includes("/internal/")) {
    return [`${relative(projectRoot, importerPath)} imports internal module ${specifier}`];
  }
  return [];
}

export function findImportViolations() {
  const violations = [];
  for (const [moduleName, sourceRoot] of moduleRoots) {
    const directory = resolve(projectRoot, sourceRoot);
    for (const file of sourceFiles(directory)) {
      const source = readFileSync(file, "utf8");
      const importPattern = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g;
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1] ?? match[2] ?? match[3];
        for (const violation of validateImport(file, specifier)) {
          violations.push(`${moduleName}: ${violation}`);
        }
      }
    }
  }
  return violations;
}

const violations = findImportViolations();
if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("module boundary check passed");
}
