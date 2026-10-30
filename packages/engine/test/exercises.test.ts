/**
 * Every exercise file in data/exercises is checked here:
 *  - structure: unique ids, a valid answer index, distinct options;
 *  - sandhi answers: for a typed item whose prompt joins two words ("‹A› + ‹B›"), each accepted answer must be a
 *    form the engine produces (the result or one of its alternatives), and the main result must be accepted
 *    unless the prompt asks for one particular alternative. Vowel + vowel goes to vowelSandhi ("(compound)",
 *    "(inside a word)" set its options); any other junction goes to consonantSandhi ("(suffix)" sets its option),
 *    and there every correct form must also be accepted, since the optional consonant rules give several.
 * Prompts that depend on things the engine does not model (prefix + root, the word go, suffixes in y) are listed
 * in MANUAL with the reason they were checked by hand.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { consonantSandhi } from "../src/halsandhi.js";
import { isVowel, toSlp1 } from "../src/lipi.js";
import { vowelSandhi } from "../src/sandhi.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "data", "exercises");

interface Item {
  id: string;
  type: "choice" | "text";
  prompt: string;
  options?: string[];
  answer?: number;
  answers?: string[];
}

/** Checked by hand against the Laghusiddhāntakaumudī / Kāśikā; the engine does not model these. */
const MANUAL: Record<string, string> = {
  "ac-sandhi/ayadi:ay7": "6.1.79 before a suffix in y: go + ya → gavyam (LSK 24)",
  "ac-sandhi/dirgha:di9": "6.1.124 avaṅ before indra: gavendraḥ (LSK 48)",
  "ac-sandhi/pragrhya:pr9": "8.4.46 doubles y after r: gauryyau (LSK 60)",
  "ac-sandhi/vrddhi:vr7": "śivāyoṃ is the anusvāra form before a consonant (LSK 40: śivāyoṃ namaḥ)",
};

interface ExerciseFile {
  key: string;
  doc: { items: Item[]; cards: Array<{ id: string }> };
}
const files: ExerciseFile[] = readdirSync(ROOT).flatMap((mod: string) =>
  readdirSync(join(ROOT, mod))
    .filter((f: string) => f.endsWith(".yaml"))
    .map((f: string) => ({ key: `${mod}/${f.replace(/\.yaml$/, "")}`, doc: parse(readFileSync(join(ROOT, mod, f), "utf8")) as ExerciseFile["doc"] })),
);

/** Compare forms as phonemes, ignoring spaces and the avagraha. */
const key = (s: string, scheme: "iast" | "slp1" = "iast") =>
  (scheme === "iast" ? toSlp1(s.normalize("NFC"), "iast") : s).replace(/[\s']/g, "");

describe("exercise files", () => {
  it.each(files)("$key: structure", ({ doc }: ExerciseFile) => {
    const ids = [...doc.items.map((i) => i.id), ...doc.cards.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of doc.items) {
      if (it.type === "choice") {
        expect(it.options!.length).toBeGreaterThanOrEqual(2);
        expect(it.answer).toBeGreaterThanOrEqual(0);
        expect(it.answer).toBeLessThan(it.options!.length);
        expect(new Set(it.options).size).toBe(it.options!.length);
      } else {
        expect(it.answers!.length).toBeGreaterThan(0);
      }
    }
  });

  const joins: Array<{ id: string; item: Item }> = files.flatMap(({ key: file, doc }) =>
    doc.items
      .filter((i) => i.type === "text" && /‹[^›]+› \+ ‹[^›]+›/.test(i.prompt))
      .map((i) => ({ id: `${file}:${i.id}`, item: i })),
  );

  it.each(joins)("$id: every accepted answer is a form the engine derives", ({ id, item }: { id: string; item: Item }) => {
    if (MANUAL[id]) return;
    const [, a, b] = /‹([^›]+)› \+ ‹([^›]+)›/.exec(item.prompt)!;
    const first = toSlp1(a!, "iast");
    const second = toSlp1(b!, "iast");
    const vowels = isVowel(first.at(-1)!) && isVowel(second[0]!);
    const res = vowels
      ? vowelSandhi(first, second, { compound: /\(compound\)/.test(item.prompt), padanta: !/\(inside a word\)/.test(item.prompt) })
      : consonantSandhi(first, second, { suffix: /\(suffix\)/.test(item.prompt) });
    if (vowels) expect(res.untouched, `${id}: no vowel junction`).toBe(false);
    else expect("outOfScope" in res, `${id}: junction outside consonant sandhi`).toBe(false);
    const forms = new Set([key(res.result, "slp1"), ...res.alternatives.map((x) => key(x.form, "slp1"))]);
    const given = item.answers!.map((x) => key(x));
    for (const ans of item.answers!) expect(forms, `${id}: ${ans}`).toContain(key(ans));
    const asksForAlternative = /give the form|unjoined form/.test(item.prompt);
    if (!asksForAlternative) expect(given).toContain(key(res.result, "slp1"));
    if (!vowels && !asksForAlternative) for (const f of forms) expect(given, `${id}: also correct, not accepted`).toContain(f);
  });
});
