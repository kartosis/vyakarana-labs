/**
 * Practice grading (second exit review Y2). A typed answer counts when any reading of it — the detected scheme,
 * Harvard-Kyoto, IAST or SLP1 — equals an accepted answer. Checked over every typed answer in the course data:
 * each must be accepted however the learner writes it, and a one-letter change must not be.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { answerMatches, fromSlp1, toSlp1 } from "../src/lipi.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "data", "exercises");
const answers: Array<[string, string]> = [];
for (const mod of readdirSync(ROOT)) {
  for (const f of readdirSync(join(ROOT, mod)).filter((x) => x.endsWith(".yaml"))) {
    const doc = parse(readFileSync(join(ROOT, mod, f), "utf8")) as { items: Array<{ id: string; type: string; answers?: string[] }> };
    for (const it of doc.items) if (it.type === "text") for (const a of it.answers ?? []) answers.push([`${mod}/${f} ${it.id}`, a]);
  }
}

describe("every typed answer in the course is accepted in every script (Y2)", () => {
  it("there are answers to check", () => expect(answers.length).toBeGreaterThan(100));
  it.each(answers)("%s: %s", (_id, a) => {
    const slp = toSlp1(a, "iast");
    const forms = {
      iast: a,
      "iast, capitalised": a.charAt(0).toUpperCase() + a.slice(1),
      devanagari: fromSlp1(slp, "deva"),
      "harvard-kyoto": fromSlp1(slp, "hk"),
      slp1: slp,
    };
    for (const [how, typed] of Object.entries(forms)) expect(answerMatches(typed, [a]), `${how}: ${typed}`).toBe(true);
  });
});

describe("answerMatches", () => {
  it("accepts the Harvard-Kyoto answers the scheme heuristic used to miss", () => {
    expect(answerMatches("ka Aste", ["ka āste"])).toBe(true);
    expect(answerMatches("A", ["ā"])).toBe(true);
    expect(answerMatches("Atman", ["ātman"])).toBe(true);
    expect(answerMatches("Adeza", ["ādeśa"])).toBe(true);
  });
  it("still accepts capitalised IAST and ignores spaces and the avagraha", () => {
    expect(answerMatches("Rama", ["rama"])).toBe(true);
    expect(answerMatches("śivo rcyaḥ", ["śivo 'rcyaḥ"])).toBe(true);
  });
  it("refuses a wrong answer in every reading", () => {
    expect(answerMatches("kāyaḥ", ["kāryaḥ"])).toBe(false);
    expect(answerMatches("rAmaH", ["rāmāḥ"])).toBe(false);
    expect(answerMatches("", ["a"])).toBe(false);
  });
});
