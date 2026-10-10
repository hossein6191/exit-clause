// Nothing personal and nothing internal in the site's files: no local paths, no e-mail addresses,
// no private keys, and no mention of the tools that helped write it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", "package-lock.json", ".DS_Store"]);
const self = fileURLToPath(import.meta.url);

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith("._")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|mjs|js|json|css|md|svg|example)$/.test(name) || name.startsWith(".")) out.push(p);
  }
  return out;
}

// Spelled in pieces so this file does not trip over itself.
const FORBIDDEN = [
  ["a local volume path", new RegExp("/" + "Volumes/")],
  ["a home directory", new RegExp("/" + "Users/")],
  ["an e-mail address", /[A-Za-z0-9._%+-]+@(?!\d)[A-Za-z0-9-]+\.(com|org|net|io|dev|ai)\b/],
  ["a private key", /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/],
  ["an assistant", new RegExp("\\b(" + ["Cla" + "ude", "Anth" + "ropic", "Chat" + "GPT", "Co-" + "Authored"].join("|") + ")\\b", "i")],
  ["a place this site must not name", new RegExp("\\b(" + ["Ir" + "an", "Teh" + "ran"].join("|") + ")\\b", "i")],
];

test("no file of the site carries anything personal or internal", () => {
  const found = [];
  // `next dev` writes two notes for coding tools when it runs under one; they never belong in the repository.
  for (const name of ["AGE" + "NTS.md", "CLA" + "UDE.md"]) {
    try {
      statSync(join(root, name));
      found.push(`${name}: a note written for a coding tool`);
    } catch {
      /* absent, as it should be */
    }
  }
  for (const f of files(root)) {
    if (f === self) continue;
    const text = readFileSync(f, "utf8");
    for (const [what, re] of FORBIDDEN) if (re.test(text)) found.push(`${relative(root, f)}: ${what}`);
  }
  assert.deepEqual(found, []);
});
