import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function isText(content) {
  return !content.includes("\u0000");
}

export function formatViolations(filePath, content) {
  if (!isText(content)) return [];

  const violations = [];
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    const withoutCarriageReturn = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (/[ \t]+$/.test(withoutCarriageReturn)) {
      violations.push(`${filePath}:${index + 1} has trailing whitespace`);
    }
  });
  if (content.length > 0 && !content.endsWith("\n")) {
    violations.push(`${filePath} is missing a final newline`);
  }
  return violations;
}

export function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\u0000")
    .filter(Boolean);
}

export function findFormatViolations() {
  return trackedFiles().flatMap((filePath) => {
    const content = readFileSync(filePath, "utf8");
    return formatViolations(filePath, content);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findFormatViolations();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("format check passed");
  }
}
