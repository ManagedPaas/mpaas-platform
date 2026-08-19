import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { trackedFiles } from "./check-format.mjs";

const credentialPatterns = [
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9_]{20,}/g],
  ["private key", /-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY-----/g]
];

export function secretViolations(source, filePath) {
  return credentialPatterns.flatMap(([label, pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(source) ? [`${filePath} contains a ${label} pattern`] : [];
  });
}

export function findSecretViolations() {
  return trackedFiles().flatMap((filePath) =>
    secretViolations(readFileSync(filePath, "utf8"), filePath)
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findSecretViolations();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("secret scan passed");
  }
}
