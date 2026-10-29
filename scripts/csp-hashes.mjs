#!/usr/bin/env node
// Compute SHA-256 hashes of every inline <script> and <style> in the built site, so the
// CloudFront Content-Security-Policy can stay strict (no 'unsafe-inline').
// Usage: node scripts/csp-hashes.mjs <dist> <out.json> [--merge previous.json]
// --merge keeps the previous deploy's hashes too, so HTML still cached at the edge keeps working
// while a new deploy rolls out.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const mergeAt = args.indexOf("--merge");
const mergeFile = mergeAt >= 0 ? args.splice(mergeAt, 2)[1] : undefined;
const [distDir = "apps/web/dist", outFile = "infra/terraform/envs/prod/csp.auto.tfvars.json"] = args;

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(p);
    else if (entry.name.endsWith(".html")) yield p;
  }
}

const hash = (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
const scripts = new Set();
const styles = new Set();
let pages = 0;

for await (const file of htmlFiles(distDir)) {
  pages++;
  const html = await readFile(file, "utf8");
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) scripts.add(hash(m[1]));
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles.add(hash(m[1]));
  if (/\sstyle="/.test(html)) {
    console.error(`warning: ${file} has a style="" attribute, which a strict CSP blocks`);
  }
}

const current = { csp_script_hashes: [...scripts].sort(), csp_style_hashes: [...styles].sort() };
let out = current;
if (mergeFile) {
  try {
    const prev = JSON.parse(await readFile(mergeFile, "utf8"));
    out = {
      csp_script_hashes: [...new Set([...current.csp_script_hashes, ...(prev.csp_script_hashes ?? [])])].sort(),
      csp_style_hashes: [...new Set([...current.csp_style_hashes, ...(prev.csp_style_hashes ?? [])])].sort(),
    };
    console.log(`csp: merged previous deploy's hashes from ${mergeFile}`);
  } catch {
    console.log(`csp: no previous hashes at ${mergeFile}; using current build only`);
  }
}
// The current build alone is what the next deploy should carry forward.
await writeFile(outFile.replace(/\.json$/, ".current.json"), JSON.stringify(current, null, 2) + "\n");
await writeFile(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(`csp: ${pages} pages, ${scripts.size} inline script hashes, ${styles.size} inline style hashes → ${outFile}`);
