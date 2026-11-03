#!/usr/bin/env node
// Applies the dopost product name to text inherited from upstream.
// Run after each upstream sync: `node scripts/dopost-brand.mjs` (add --check to
// list files that still need it). Licence and attribution files are left as they
// are, and so are protocol names (HTTP headers, SDK and n8n node identifiers)
// that external clients depend on.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const check = process.argv.includes("--check");
const skipFiles = new Set(["LICENSE", "NOTICE.md", "agents.md", "scripts/dopost-brand.mjs"]);
const skipPrefixes = [
  "licenses/",
  "third_party/",
  "docs/upstream/",
  "apps/cli/",
  "packages/sdk/",
  "packages/n8n-nodes-openpost/",
  "scripts/check-n8n-package-build.mjs",
  "scripts/verify-published-n8n-package.mjs",
  "scripts/verify-published-npm-package.mjs",
];
const protectedPatterns = [
  /X-OpenPost-[\w-]+/g,
  /\bOpenPost-(?:Signature|Workflows|Timestamp|Event|Delivery)\b/g,
  /[\w.-]*\/OpenPost\b[\w./-]*/g,
  /\bOpenPost(?=\/|\.node\b)/g,
  // SDK class name in code samples.
  /\bimport \{ OpenPost \}|\bnew (?:entry\.)?OpenPost\(/g,
  /github\.com\/getopenpost\/openpost\/(?:pull|issues|commit|blob|tree|releases|compare)\/[^\s)"'`<>\]]*/g,
];
const replacements = [
  [/https:\/\/github\.com\/getopenpost\/openpost(?![\w/-])/g, "https://github.com/dhtoan/dopost"],
  [/\b([Aa])n OpenPost\b/g, "$1 dopost"],
  [/\bOpenPost\b/g, "dopost"],
];

const files = execFileSync(
  "git",
  ["grep", "-I", "-l", "-e", "OpenPost", "-e", "getopenpost/openpost", "--", "."],
  {
    encoding: "utf8",
    maxBuffer: 64 << 20,
  },
)
  .split("\n")
  .filter(Boolean)
  .filter(
    (file) => !skipFiles.has(file) && !skipPrefixes.some((prefix) => file.startsWith(prefix)),
  );

function brand(text) {
  const held = [];
  let out = text;
  for (const pattern of protectedPatterns) {
    out = out.replace(pattern, (match) => `\u0000${held.push(match) - 1}\u0000`);
  }
  for (const [pattern, value] of replacements) out = out.replace(pattern, value);
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => held[Number(index)]);
}

let changed = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const next = brand(text);
  if (next === text) continue;
  changed += 1;
  if (check) console.log(file);
  else writeFileSync(file, next);
}
console.log(`${check ? "needs branding" : "branded"}: ${changed} file(s)`);
if (check && changed > 0) process.exitCode = 1;
