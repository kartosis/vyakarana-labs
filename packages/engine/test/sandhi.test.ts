import { describe, expect, it } from "vitest";
import { sandhiChecks, vowelSandhi, type SandhiOptions } from "../src/sandhi.js";
import { toSlp1, fromSlp1 } from "../src/lipi.js";

/** Join two IAST words and return IAST. */
const join = (a: string, b: string, opts: SandhiOptions = {}) => {
  const r = vowelSandhi(toSlp1(a, "iast"), toSlp1(b, "iast"), opts);
  return {
    result: fromSlp1(r.result, "iast"),
    alts: r.alternatives.map((x) => fromSlp1(x.form, "iast")),
    altSutras: r.alternatives.map((x) => x.sutra),
    sutras: r.steps.map((s) => s.sutra),
  };
};

/**
 * Examples from Varadarāja's Laghusiddhāntakaumudī (LSK n) and the Kāśikā (KV),
 * as given in the ashtadhyayi.com dataset. Each row: first, second, expected joined form, sūtra that decides it.
 */
describe("ac-sandhi: the textbook examples", () => {
  it.each([
    // 6.1.77 iko yaṇ aci (LSK 15, 21; KV)
    ["sudhī", "upāsyaḥ", "sudhyupāsyaḥ", "6.1.77"],
    ["madhu", "ariḥ", "madhvariḥ", "6.1.77"],
    ["dhātṛ", "aṃśaḥ", "dhātraṃśaḥ", "6.1.77"],
    ["ḷ", "ākṛtiḥ", "lākṛtiḥ", "6.1.77"],
    ["dadhi", "atra", "dadhyatra", "6.1.77"],
    ["madhu", "atra", "madhvatra", "6.1.77"],
    ["kartṛ", "artham", "kartrartham", "6.1.77"],
    // 6.1.87 ād guṇaḥ (LSK 27; KV), 1.1.51 uraṇ raparaḥ (LSK 29)
    ["upa", "indraḥ", "upendraḥ", "6.1.87"],
    ["gaṅgā", "udakam", "gaṅgodakam", "6.1.87"],
    ["khaṭvā", "indraḥ", "khaṭvendraḥ", "6.1.87"],
    ["tava", "idam", "tavedam", "6.1.87"],
    ["kṛṣṇa", "ṛddhiḥ", "kṛṣṇarddhiḥ", "1.1.51"],
    ["tava", "ḷkāraḥ", "tavalkāraḥ", "1.1.51"],
    ["sītā", "ṛcchati", "sītarcchati", "1.1.51"],
    // 6.1.88 vṛddhir eci (LSK 33; KV)
    ["kṛṣṇa", "ekatvam", "kṛṣṇaikatvam", "6.1.88"],
    ["gaṅgā", "oghaḥ", "gaṅgaughaḥ", "6.1.88"],
    ["deva", "aiśvaryam", "devaiśvaryam", "6.1.88"],
    ["kṛṣṇa", "autkaṇṭhyam", "kṛṣṇautkaṇṭhyam", "6.1.88"],
    ["khaṭvā", "odanaḥ", "khaṭvaudanaḥ", "6.1.88"],
    // 6.1.101 akaḥ savarṇe dīrghaḥ (LSK 42; KV)
    ["daitya", "ariḥ", "daityāriḥ", "6.1.101"],
    ["śrī", "īśaḥ", "śrīśaḥ", "6.1.101"],
    ["viṣṇu", "udayaḥ", "viṣṇūdayaḥ", "6.1.101"],
    ["hotṛ", "ṛkāraḥ", "hotṝkāraḥ", "6.1.101"],
    ["daṇḍa", "agram", "daṇḍāgram", "6.1.101"],
    ["draupadī", "indram", "draupadīndram", "6.1.101"],
    // 6.1.109 eṅaḥ padāntād ati (LSK 43; KV)
    ["hare", "ava", "hare'va", "6.1.109"],
    ["viṣṇo", "ava", "viṣṇo'va", "6.1.109"],
    ["agne", "atra", "agne'tra", "6.1.109"],
    ["vāyo", "atra", "vāyo'tra", "6.1.109"],
    // 6.1.95 omāṅoś ca (LSK 40)
    ["śivāya", "om", "śivāyom", "6.1.95"],
  ])("%s + %s → %s (%s)", (a, b, out, sutra) => {
    const r = join(a, b);
    expect(r.result).toBe(out);
    expect(r.sutras).toContain(sutra);
  });
});

describe("ac-sandhi: optional forms", () => {
  it("6.1.78 with 8.3.19 at word end (LSK 31; KV)", () => {
    expect(join("hare", "iha")).toMatchObject({ result: "harayiha", alts: ["hara iha"], altSutras: ["8.3.19"] });
    expect(join("viṣṇo", "iha")).toMatchObject({ result: "viṣṇaviha", alts: ["viṣṇa iha"] });
    expect(join("asmai", "uddhara")).toMatchObject({ result: "asmāyuddhara", alts: ["asmā uddhara"] });
    expect(join("dvau", "atra")).toMatchObject({ result: "dvāvatra", alts: ["dvā atra"] });
    expect(join("asau", "ādityaḥ")).toMatchObject({ result: "asāvādityaḥ", alts: ["asā ādityaḥ"] });
  });

  it("6.1.127: an ik may stay unjoined before a dissimilar vowel (LSK 59; KV)", () => {
    expect(join("cakrī", "atra")).toMatchObject({ result: "cakryatra", alts: ["cakri atra"], altSutras: ["6.1.127"] });
    expect(join("kumārī", "atra").alts).toContain("kumāri atra");
    expect(join("madhu", "atra").alts).toContain("madhu atra");
  });

  it("6.1.128: before short ṛ (LSK 61; KV)", () => {
    expect(join("brahma", "ṛṣiḥ")).toMatchObject({ result: "brahmarṣiḥ", alts: ["brahma ṛṣiḥ"], altSutras: ["6.1.128"] });
    expect(join("khaṭvā", "ṛśyaḥ").alts).toContain("khaṭva ṛśyaḥ");
  });

  it("vārttika on 6.1.101 and 6.1.128 for hotṛ + ṛkāraḥ (KV)", () => {
    const r = join("hotṛ", "ṛkāraḥ");
    expect(r.result).toBe("hotṝkāraḥ");
    expect(r.alts).toEqual(["hotṛkāraḥ", "hotṛ ṛkāraḥ"]);
    expect(r.altSutras).toEqual(["6.1.101", "6.1.128"]);
  });

  it("8.4.47 + 8.4.53: doubling before a new yaṇ (LSK 18–19; KV)", () => {
    expect(join("sudhī", "upāsyaḥ").alts).toContain("suddhyupāsyaḥ");
    expect(join("madhu", "ariḥ").alts).toContain("maddhvariḥ");
    expect(join("dadhi", "atra").alts).toContain("daddhyatra");
    // a consonant cluster before the vowel blocks doubling: the k of cakrī is not preceded by a vowel
    expect(join("cakrī", "atra").alts).not.toContain("cakkryatra");
  });

  it("no Śākalya forms inside a compound (vārttika na samāse, LSK 60)", () => {
    const c = join("vāpī", "aśvaḥ", { compound: true });
    expect(c.result).toBe("vāpyaśvaḥ");
    expect(c.altSutras).not.toContain("6.1.127");
    expect(join("vāpī", "aśvaḥ").alts).toContain("vāpi aśvaḥ");
  });

  it("inside a word, e/o + a uses 6.1.78 (no pūrvarūpa, no 8.3.19)", () => {
    expect(join("ne", "a", { padanta: false })).toMatchObject({ result: "naya", alts: [] });
    expect(join("bho", "a", { padanta: false })).toMatchObject({ result: "bhava", alts: [] });
    expect(join("ce", "anam", { padanta: false })).toMatchObject({ result: "cayanam" });
    expect(join("lau", "akaḥ", { padanta: false })).toMatchObject({ result: "lāvakaḥ" });
  });
});

describe("ac-sandhi: pragṛhya", () => {
  it("duals in ī, ū, e stay apart (1.1.11, 6.1.125; LSK 51)", () => {
    expect(join("harī", "etau", { pragrhya: true })).toMatchObject({ result: "harī etau", sutras: ["1.1.11", "6.1.125"] });
    expect(join("viṣṇū", "imau", { pragrhya: true }).result).toBe("viṣṇū imau");
    expect(join("gaṅge", "amū", { pragrhya: true }).result).toBe("gaṅge amū");
  });
  it("a particle in o (1.1.15; LSK 56)", () => {
    expect(join("aho", "īśāḥ", { pragrhya: true })).toMatchObject({ result: "aho īśāḥ", sutras: ["1.1.15", "6.1.125"] });
  });
  it("a one-vowel particle (1.1.14; LSK 55)", () => {
    expect(join("i", "indraḥ", { pragrhya: true })).toMatchObject({ result: "i indraḥ", sutras: ["1.1.14", "6.1.125"] });
  });
});

describe("ac-sandhi: structure", () => {
  it("leaves consonant junctions alone", () => {
    expect(vowelSandhi("vAk", "atra").untouched).toBe(true);
  });

  it("every step names a sūtra", () => {
    const r = vowelSandhi("sItA", "fcCati");
    expect(r.steps.map((s) => s.sutra)).toEqual(["6.1.84", "6.1.87", "1.1.50", "1.1.51"]);
  });

  it("notes are written in IAST, never raw SLP1", () => {
    for (const [a, b] of [["pitf", "artham"], ["daDi", "atra"], ["hare", "iha"], ["hotf", "fkAraH"]] as const) {
      const r = vowelSandhi(a, b);
      for (const s of [...r.steps.map((x) => x.note), ...r.alternatives.map((x) => x.note)]) {
        expect(s).not.toMatch(/\b[fFxXIUEO]\b/);
      }
    }
  });

  it("reports the meeting vowels and their substitute", () => {
    expect(vowelSandhi("deva", "indraH").junction).toEqual({ left: "a", right: "i", out: "e" });
    expect(vowelSandhi("daDi", "atra").junction).toEqual({ left: "i", right: "a", out: "ya" });
    expect(vowelSandhi("hare", "iha").junction).toEqual({ left: "e", right: "i", out: "ayi" });
    expect(vowelSandhi("vAk", "atra").junction).toBeNull();
  });
});

describe("rule checks explain the choice", () => {
  const cases: Array<[string, string, SandhiOptions]> = [
    ["daDi", "atra", {}], ["daDi", "iha", {}], ["deva", "indraH", {}], ["sadA", "eva", {}], ["te", "atra", {}],
    ["hare", "iha", {}], ["harI", "etO", { pragrhya: true }], ["harI", "etO", {}], ["ne", "a", { padanta: false }],
    ["pitf", "fRam", {}], ["mahA", "fziH", {}], ["guru", "AjYA", {}], ["SrI", "Isa", {}], ["SivAya", "om", {}],
  ];
  it.each(cases)("%s + %s: the first applicable check is the sūtra the engine used", (a, b, o) => {
    const checks = sandhiChecks(a, b, o);
    const used = vowelSandhi(a, b, o).steps.map((s) => s.sutra);
    const winners = checks.filter((c) => c.status === "applies");
    expect(winners).toHaveLength(1);
    expect(used).toContain(winners[0]!.sutra);
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

  it("śivāya + om: 6.1.95 sets aside 6.1.88 and 6.1.87", () => {
    const c = sandhiChecks("SivAya", "om");
    expect(c.find((r) => r.sutra === "6.1.95")?.status).toBe("applies");
    expect(c.find((r) => r.sutra === "6.1.88")?.status).toBe("set-aside");
  });
});
