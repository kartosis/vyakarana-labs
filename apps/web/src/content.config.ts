import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

// Astro runs from apps/web; shared data lives at the repo root (also read by the API and tests).
const DATA = new URL("../../data/", pathToFileURL(`${process.cwd()}/`));

/** All sūtra YAML files in /data/sutras, flattened into one collection keyed by a.p.s. */
const sutras = defineCollection({
  loader: async () => {
    const dir = new URL("sutras/", DATA);
    const files = (await readdir(fileURLToPath(dir))).filter((f) => f.endsWith(".yaml"));
    const all: Array<Record<string, unknown>> = [];
    for (const f of files) {
      const rows = parse(await readFile(new URL(f, dir), "utf8")) as Array<Record<string, unknown>>;
      for (const row of rows) all.push({ ...row, source: f });
    }
    return all.map((r) => ({ ...r, id: String(r.id) }));
  },
  schema: z.object({
    id: z.string().regex(/^\d\.\d\.\d+$/),
    lsk: z.number().int().nullable(),
    lskVerified: z.boolean(),
    deva: z.string(),
    pada: z.array(z.string()),
    anuvrtti: z.array(z.tuple([z.string(), z.string()])),
    vrtti: z.string().optional(),
    vrttiVerified: z.boolean(),
    kind: z.string(),
    meaning: z.string(),
    source: z.string(),
  }),
});

const quotes = defineCollection({
  loader: async () => {
    const rows = parse(await readFile(new URL("quotes.yaml", DATA), "utf8")) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ ...r, id: String(r.id) }));
  },
  schema: z.object({
    id: z.string(),
    author: z.string(),
    work: z.string(),
    ref: z.string(),
    deva: z.string(),
    translation: z.string(),
    verified: z.boolean(),
    checkedAt: z.string().url(),
  }),
});

const modules = defineCollection({
  loader: async () => {
    const doc = parse(await readFile(new URL("course.yaml", DATA), "utf8")) as {
      modules: Array<Record<string, unknown>>;
    };
    return doc.modules.map((m) => ({ ...m, id: String(m.id) }));
  },
  schema: z.object({
    id: z.string(),
    order: z.number().int(),
    deva: z.string(),
    title: z.string(),
    summary: z.string(),
    lsk: z.boolean(),
    status: z.enum(["open", "soon"]),
  }),
});

const lessons = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/lessons" }),
  schema: z.object({
    title: z.string(),
    deva: z.string(),
    module: z.string(),
    order: z.number().int(),
    summary: z.string(),
    minutes: z.number().int(),
    sutras: z.array(z.string()).default([]),
    lskRange: z.string().optional(),
  }),
});

export const collections = { sutras, quotes, modules, lessons };
