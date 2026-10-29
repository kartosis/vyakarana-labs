import { describe, expect, it } from "vitest";
import { sandhiChecks, vowelSandhi } from "../src/sandhi.js";
import { toSlp1, fromSlp1 } from "../src/lipi.js";

/** Join two IAST words and return IAST. */
const join = (a: string, b: string, opts = {}) => {
  const r = vowelSandhi(toSlp1(a, "iast"), toSlp1(b, "iast"), opts);
  return { result: fromSlp1(r.result, "iast"), alts: r.alternatives.map((x) => fromSlp1(x, "iast")), sutras: r.steps.map((s) => s.sutra) };
};

describe("ac-sandhi (vowel junctions)", () => {
  it.each([
    // 6.1.77 iko yaṇ aci
    ["dadhi", "atra", "dadhyatra", "6.1.77"],
    ["madhu", "atra", "madhvatra", "6.1.77"],
    ["pitṛ", "artham", "pitrartham", "6.1.77"],
    // 6.1.87 ād guṇaḥ (+ 1.1.51)
    ["deva", "indraḥ", "devendraḥ", "6.1.87"],
    ["sītā", "indram", "sītendram", "6.1.87"],
    ["mahā", "utsavaḥ", "mahotsavaḥ", "6.1.87"],
    ["sītā", "ṛcchati", "sītarcchati", "1.1.51"],
    // 6.1.88 vṛddhir eci
    ["sadā", "eva", "sadaiva", "6.1.88"],
    ["mahā", "oṣadhiḥ", "mahauṣadhiḥ", "6.1.88"],
    // 6.1.101 akaḥ savarṇe dīrghaḥ — beats 6.1.77
    ["daitya", "ariḥ", "daityāriḥ", "6.1.101"],
    ["śrī", "īśaḥ", "śrīśaḥ", "6.1.101"],
    ["viṣṇu", "udayaḥ", "viṣṇūdayaḥ", "6.1.101"],
    ["draupadī", "indram", "draupadīndram", "6.1.101"],
    ["hotṛ", "ṛkāraḥ", "hotṝkāraḥ", "6.1.101"],
    // 6.1.109 eṅaḥ padāntād ati
    ["te", "atra", "te'tra", "6.1.109"],
    ["vaiṣṇavo", "aham", "vaiṣṇavo'ham", "6.1.109"],
  ])("%s + %s → %s (%s)", (a, b, out, sutra) => {
    const r = join(a, b);
    expect(r.result).toBe(out);
    expect(r.sutras).toContain(sutra);
  });

  it("6.1.78 + optional 8.3.19 at word end", () => {
    expect(join("hare", "iha")).toMatchObject({ result: "harayiha", alts: ["hara iha"] });
    expect(join("viṣṇo", "iha")).toMatchObject({ result: "viṣṇaviha", alts: ["viṣṇa iha"] });
    expect(join("śriyai", "udyataḥ")).toMatchObject({ result: "śriyāyudyataḥ", alts: ["śriyā udyataḥ"] });
  });

  it("inside a word, e/o + a uses 6.1.78 (no pūrvarūpa, no 8.3.19)", () => {
    expect(join("ne", "a", { padanta: false })).toMatchObject({ result: "naya", alts: [] });
    expect(join("bho", "a", { padanta: false })).toMatchObject({ result: "bhava", alts: [] });
  });

  it("pragṛhya duals stay apart (1.1.11, 6.1.125)", () => {
    expect(join("harī", "etau", { pragrhya: true })).toMatchObject({ result: "harī etau", sutras: ["1.1.11", "6.1.125"] });
  });

  it("leaves consonant junctions alone", () => {
    const r = vowelSandhi("vAk", "atra");
    expect(r.untouched).toBe(true);
  });

  it("every step names a sūtra", () => {
    const r = vowelSandhi("sItA", "fcCati");
    expect(r.steps.map((s) => s.sutra)).toEqual(["6.1.84", "6.1.87", "1.1.50", "1.1.51"]);
  });

  it("reports the meeting vowels and their substitute", () => {
    expect(vowelSandhi("deva", "indraH").junction).toEqual({ left: "a", right: "i", out: "e" });
    expect(vowelSandhi("daDi", "atra").junction).toEqual({ left: "i", right: "a", out: "ya" });
    expect(vowelSandhi("hare", "iha").junction).toEqual({ left: "e", right: "i", out: "ayi" });
    expect(vowelSandhi("vAk", "atra").junction).toBeNull();
  });
});

describe("rule checks explain the choice", () => {
  const cases: Array<[string, string, object]> = [
    ["daDi", "atra", {}], ["daDi", "iha", {}], ["deva", "indraH", {}], ["sadA", "eva", {}], ["te", "atra", {}],
    ["hare", "iha", {}], ["harI", "etO", { pragrhya: true }], ["harI", "etO", {}], ["ne", "a", { padanta: false }],
    ["pitf", "fRam", {}], ["mahA", "fziH", {}], ["guru", "AjYA", {}], ["SrI", "Isa", {}],
  ];
  it.each(cases)("%s + %s: the first applicable check is the sūtra the engine used", (a, b, o) => {
    const checks = sandhiChecks(a, b, o);
    const used = vowelSandhi(a, b, o).steps.map((s) => s.sutra);
    const winners = checks.filter((c) => c.status === "applies");
    expect(winners).toHaveLength(1);
    expect(used).toContain(winners[0]!.sutra);
    // nothing before the winner applies
    const idx = checks.findIndex((c) => c.status === "applies");
    expect(checks.slice(0, idx).every((c) => c.status === "no")).toBe(true);
  });

  it("dadhi + iha: 6.1.101 sets aside 6.1.77", () => {
    const c = sandhiChecks("daDi", "iha");
    expect(c.find((r) => r.sutra === "6.1.101")?.status).toBe("applies");
    expect(c.find((r) => r.sutra === "6.1.77")?.status).toBe("set-aside");
  });

  it("sadā + eva: 6.1.88 sets aside 6.1.87", () => {
    const c = sandhiChecks("sadA", "eva");
    expect(c.find((r) => r.sutra === "6.1.88")?.status).toBe("applies");
    expect(c.find((r) => r.sutra === "6.1.87")?.status).toBe("set-aside");
  });
});
