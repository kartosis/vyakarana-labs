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
    /** Siddhāntakaumudī number */
    sk: z.number().int().nullable(),
    deva: z.string(),
    pada: z.array(z.string()),
    /** words carried over from earlier sūtras: [word, a.p.s] */
    anuvrtti: z.array(z.tuple([z.string(), z.string()])),
    /** headings (adhikāra) in force: [heading, a.p.s] */
    adhikara: z.array(z.tuple([z.string(), z.string()])).default([]),
    vrtti: z.string().optional(),
    vrttiVerified: z.boolean(),
    kind: z.enum(["saṃjñā", "paribhāṣā", "vidhi", "niyama", "atideśa", "adhikāra"]),
    meaning: z.string(),
    note: z.string().optional(),
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

/** Practice items and review cards per lesson: data/exercises/{module}/{lesson}.yaml, id "module/lesson". */
const choice = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/),
  type: z.literal("choice"),
  prompt: z.string(),
  options: z.array(z.string()).min(2).max(4),
  answer: z.number().int().min(0),
  explain: z.string().optional(),
});
const text = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/),
  type: z.literal("text"),
  prompt: z.string(),
  answers: z.array(z.string()).min(1),
  explain: z.string().optional(),
});
const exercises = defineCollection({
  loader: async () => {
    const root = new URL("exercises/", DATA);
    const out: Array<Record<string, unknown> & { id: string }> = [];
    for (const mod of await readdir(fileURLToPath(root))) {
      for (const f of (await readdir(fileURLToPath(new URL(`${mod}/`, root)))).filter((x) => x.endsWith(".yaml"))) {
        const doc = parse(await readFile(new URL(`${mod}/${f}`, root), "utf8")) as Record<string, unknown>;
        out.push({ ...doc, id: `${mod}/${f.replace(/\.yaml$/, "")}` });
      }
    }
    return out;
  },
  schema: z.object({
    id: z.string(),
    cards: z.array(
      z.object({ id: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/), front: z.string(), back: z.string() }),
    ),
    items: z.array(z.discriminatedUnion("type", [choice, text])).min(1),
  }),
});

export const collections = { sutras, quotes, modules, lessons, exercises };
