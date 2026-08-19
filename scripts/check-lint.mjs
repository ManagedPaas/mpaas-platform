import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { trackedFiles } from "./check-format.mjs";

const sourceExtensions = /\.(?:ts|tsx|js|jsx|mjs)$/;
const debuggerWord = ["debug", "ger"].join("");
const debuggerPattern = new RegExp(`\\b${debuggerWord}(?![A-Za-z0-9_$])\\s*;?`);

export function lintViolations(source, filePath) {
  const violations = [];
  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    if (/:\s*any\b|\bas\s+any\b/.test(line)) {
      violations.push(`${filePath}:${lineNumber} uses the any type`);
    }
    if (/@ts-(?:ignore|expect-error)\b/.test(line)) {
      const suppression = line.match(/@ts-(?:ignore|expect-error)/)?.[0];
      violations.push(`${filePath}:${lineNumber} uses ${suppression}`);
    }
    if (debuggerPattern.test(line)) {
      violations.push(`${filePath}:${lineNumber} contains ${debuggerWord}`);
    }
    if (/\bvar\s+[A-Za-z_$]/.test(line)) {
      violations.push(`${filePath}:${lineNumber} uses var; prefer const or let`);
    }
  });
  return violations;
}

export function findLintViolations() {
  return trackedFiles()
    .filter((filePath) => sourceExtensions.test(filePath))
    .flatMap((filePath) => lintViolations(readFileSync(filePath, "utf8"), filePath));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findLintViolations();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("lint check passed");
  }
}
