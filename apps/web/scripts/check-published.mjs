#!/usr/bin/env node
// Lessons of modules that are not "open" must not be published: no page, no link, no sitemap entry
// (external review #13). Usage: node apps/web/scripts/check-published.mjs [dist-dir]   (after the site build)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = new URL("../../..", import.meta.url).pathname;
const dist = process.argv[2] ?? join(root, "apps/web/dist");
const course = parse(readFileSync(join(root, "data/course.yaml"), "utf8"));
const lessonsDir = join(root, "apps/web/src/content/lessons");
const problems = [];
const pages = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".html") && pages.push(join(d, e.name))));
walk(dist);
const sitemap = readdirSync(dist).filter((f) => f.startsWith("sitemap") && f.endsWith(".xml")).map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
let drafts = 0;
for (const m of course.modules.filter((m) => m.status !== "open")) {
  const dir = join(lessonsDir, m.id);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
    drafts++;
    const path = `/course/${m.id}/${f.replace(/\.mdx$/, "")}/`;
    if (existsSync(join(dist, path, "index.html"))) problems.push(`page built for draft ${path}`);
    if (sitemap.includes(path)) problems.push(`sitemap lists draft ${path}`);
    const linking = pages.filter((p) => readFileSync(p, "utf8").includes(`href="${path}"`));
    if (linking.length) problems.push(`${linking.length} page(s) link to draft ${path}`);
  }
}
for (const p of problems) console.log(`✗ ${p}`);
console.log(`checked ${drafts} draft lesson(s) in ${pages.length} pages: ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
