import { describe, expect, it } from "vitest";
import { consonantSandhi } from "../src/halsandhi.js";
import { fromSlp1, toSlp1 } from "../src/lipi.js";

/** Join two IAST words; return the main form and alternatives in IAST (as Varadarāja writes them, joined). */
const join = (a: string, b: string) => {
  const r = consonantSandhi(toSlp1(a, "iast"), toSlp1(b, "iast"));
  return {
    result: fromSlp1(r.result, "iast"),
    alts: r.alternatives.map((x) => fromSlp1(x.form, "iast")),
    all: [r.result, ...r.alternatives.map((x) => x.form)].map((x) => fromSlp1(x, "iast")),
    sutras: r.steps.map((s) => s.sutra),
    untouched: r.untouched,
  };
};

/** Every example below is printed in Varadarāja's vṛtti for the LSK number given (ashtadhyayi.com text). */
describe("hal-sandhi: Varadarāja's examples", () => {
  it.each([
    // LSK 62, 8.4.40 ścutva
    ["sat", "cit", "saccit", "8.4.40"],
    ["rāmas", "cinoti", null, null], // a final s belongs to visarga sandhi
    // LSK 64, 8.4.41 ṣṭutva
    ["tat", "ṭīkā", "taṭṭīkā", "8.4.41"],
    ["cakrin", "ḍhaukase", "cakriṇḍhaukase", "8.4.41"],
    // LSK 67, 8.2.39 jaśtva
    ["vāk", "īśaḥ", "vāgīśaḥ", "8.2.39"],
    // LSK 69, 8.4.60 tor li
    ["tat", "layaḥ", "tallayaḥ", "8.4.60"],
    ["vidvān", "likhati", "vidvām̐llikhati", "8.4.60"],
    // LSK 77, 8.3.23
    ["harim", "vande", "hariṃ vande", "8.3.23"],
    // LSK 89, 8.3.32 ṅamuṭ
    ["pratyaṅ", "ātmā", "pratyaṅṅātmā", "8.3.32"],
    ["sugaṇ", "īśaḥ", "sugaṇṇīśaḥ", "8.3.32"],
    ["san", "acyutaḥ", "sannacyutaḥ", "8.3.32"],
    // LSK 101, 6.1.73 tuk
    ["śiva", "chāyā", "śivacchāyā", "6.1.73"],
  ])("%s + %s → %s", (a, b, out, sutra) => {
    const r = join(a, b);
    if (out === null) {
      expect(r.untouched).toBe(true);
      return;
    }
    expect(r.result).toBe(out);
    expect(r.sutras).toContain(sutra);
  });

  it("LSK 63, 8.4.44: no ścutva after ś (praśnaḥ is internal; the rule is checked on the t of the junction)", () => {
    // ś cannot end a pada in this engine, so the check is that a t after a palatal stop does change
    expect(join("tad", "janāḥ").result).toBe("tajjanāḥ");
  });

  it("LSK 65, 8.4.42: no ṣṭutva after a word-final ṭ-row, except before nām", () => {
    expect(join("ṣaṭ", "santaḥ").all).toContain("ṣaṭsantaḥ");
    expect(join("ṣaṭ", "te").result).toBe("ṣaṭte");
    expect(join("ṣaṭ", "nām")).toMatchObject({ result: "ṣaṇṇām", alts: [] });
  });

  it("LSK 66, 8.4.43: no ṣṭutva of a dental before ṣ", () => {
    expect(join("san", "ṣaṣṭhaḥ").result).toBe("sanṣaṣṭhaḥ");
  });

  it("LSK 68, 8.4.45: a nasal may come in before a nasal", () => {
    expect(join("etad", "murāriḥ")).toMatchObject({ result: "etanmurāriḥ", alts: ["etadmurāriḥ"] });
  });

  it("LSK 75, 8.4.62: h after a stop may become the voiced aspirate", () => {
    expect(join("vāk", "hariḥ")).toMatchObject({ result: "vāgghariḥ", alts: ["vāg hariḥ"] });
  });

  it("vārttika on 8.4.45: before a suffix the nasal is compulsory", () => {
    const r = consonantSandhi(toSlp1("vāk", "iast"), toSlp1("maya", "iast"), { suffix: true });
    expect(fromSlp1(r.result, "iast")).toBe("vāṅmaya");
    expect(r.alternatives).toEqual([]);
  });

  it("LSK 76, 8.4.63: ś after a stop may become ch (after ścutva and cartva of d)", () => {
    const r = join("tad", "śivaḥ");
    expect(r).toMatchObject({ result: "tacchivaḥ", alts: ["tacśivaḥ"] });
    expect(r.sutras).toEqual(["8.4.40", "8.4.55", "8.4.63"]);
  });

  it("LSK 80, 8.4.59: parasavarṇa of a word-final anusvāra is optional", () => {
    expect(join("tvam", "karoṣi")).toMatchObject({ result: "tvaṅkaroṣi", alts: ["tvaṃ karoṣi"] });
  });

  it("LSK 81, 8.3.25: samrāṭ keeps its m", () => {
    expect(join("sam", "rāṭ").result).toBe("samrāṭ");
  });

  it("LSK 82–83, 8.3.26–27 and the vārttika", () => {
    expect(join("kim", "hmalayati").all).toEqual(["kimhmalayati", "kiṃ hmalayati"]);
    expect(join("kim", "hyaḥ").all).toEqual(["kiy̐ hyaḥ", "kiṃ hyaḥ"]);
    expect(join("kim", "hnute").all).toEqual(["kinhnute", "kiṃ hnute"]);
  });

  it("LSK 85, 8.3.28 with the vārttika on 8.4.48: three forms", () => {
    expect(join("prāṅ", "ṣaṣṭhaḥ").all).toEqual(["prāṅkhṣaṣṭhaḥ", "prāṅkṣaṣṭhaḥ", "prāṅṣaṣṭhaḥ"]);
    expect(join("sugaṇ", "ṣaṣṭhaḥ").all).toEqual(["sugaṇṭhṣaṣṭhaḥ", "sugaṇṭṣaṣṭhaḥ", "sugaṇṣaṣṭhaḥ"]);
  });

  it("Kāśikā on 8.3.28: prāṅk chete (k augment, then ś → ch)", () => {
    expect(join("prāṅ", "śete").all).toEqual(["prāṅkchete", "prāṅkśete", "prāṅśete"]);
  });

  it("Kāśikā on 8.3.7, 8.3.32, 8.4.62: counter-examples", () => {
    expect(join("bhavān", "karoti").result).toBe("bhavān karoti".replace(" ", ""));
    expect(join("bhavān", "tsarukaḥ").result).toBe("bhavāntsarukaḥ");
    expect(join("prāṅ", "āste").result).toBe("prāṅāste");
    expect(join("prāṅ", "hasati").untouched).toBe(true);
  });

  it("LSK 86–87, 8.3.29–30: dhuṭ, which becomes t", () => {
    expect(join("ṣaṭ", "santaḥ").all).toEqual(["ṣaṭtsantaḥ", "ṣaṭsantaḥ"]);
    expect(join("san", "saḥ").all).toEqual(["santsaḥ", "sansaḥ"]);
  });

  it("LSK 88, 8.3.31: the four forms of san + śambhuḥ", () => {
    expect(join("san", "śambhuḥ").all).toEqual(["sañchambhuḥ", "sañcchambhuḥ", "sañcśambhuḥ", "sañśambhuḥ"]);
  });

  it("LSK 95–96, 8.3.7 and 8.3.34: n before t, c becomes s with a nasal before it", () => {
    expect(join("cakrin", "trāyasva").all).toEqual(["cakrim̐strāyasva", "cakriṃstrāyasva"]);
    expect(join("bhavān", "ca").all).toEqual(["bhavām̐śca", "bhavāṃśca"]);
    expect(join("praśān", "tanoti").result).toBe("praśāntanoti");
  });

  it("LSK 102, 6.1.76: a long vowel may take t before ch", () => {
    expect(join("lakṣmī", "chāyā")).toMatchObject({ result: "lakṣmīcchāyā", alts: ["lakṣmī chāyā"] });
  });

  it("8.4.55: voiceless before voiceless", () => {
    expect(join("vāk", "patiḥ").result).toBe("vākpatiḥ");
    expect(join("tad", "karoti").result).toBe("tatkaroti");
  });

  it("words that only sit side by side", () => {
    expect(join("rāma", "gacchati")).toMatchObject({ result: "rāma gacchati", untouched: true });
  });

  it("refuses a word-final palatal", () => {
    expect(join("vāc", "atra").untouched).toBe(true);
  });
});

describe("hal-sandhi: why nothing happens", () => {
  const note = (a: string, b: string) => consonantSandhi(toSlp1(a, "iast"), toSlp1(b, "iast")).note ?? "";
  it.each([
    ["san", "ṣaṣṭhaḥ", "8.4.43"],
    ["praśān", "tanoti", "8.3.7"],
    ["bhavān", "āste", "8.3.32"],
    ["prāṅ", "āste", "8.3.32"],
    ["bhavān", "karoti", "No consonant-sandhi rule applies"],
  ])("%s + %s: the note names %s", (a, b, expected) => {
    expect(note(a, b)).toContain(expected);
  });
});

describe("external review fixes (PROGRESS §10)", () => {
  it("#11: 8.3.25 keeps m only before rāj with kvip; saṃrājitā etc. take anusvāra (Kāśikā on 8.3.25)", () => {
    expect(join("sam", "rāṭ").result).toBe("samrāṭ");
    expect(join("sam", "rājau").result).toBe("samrājau");
    expect(join("sam", "rājaḥ").result).toBe("samrājaḥ");
    // anusvāra, not m; the engine writes it with a space after a finished word, the Kāśikā joins the upasarga
    for (const w of ["rājitā", "rājitum", "rājitavyam"]) expect(join("sam", w).result.replace(" ", "")).toBe(`saṃ${w}`);
  });
  // P1 exit review X11: the fix for #11 was too narrow. Every form of samrāj (ashtadhyayi.com declension data:
  // सम्राड्-सम्राट् … सम्राट्सु-सम्राट्त्सु) and samrājñī (Ṛgveda 10.85.46) keep the m.
  it.each([
    "samrāḍ", "samrāṭ", "samrājau", "samrājaḥ", "samrājam", "samrājā", "samrāḍbhyām", "samrāḍbhiḥ", "samrāje",
    "samrāḍbhyaḥ", "samrājoḥ", "samrājām", "samrāji", "samrāṭsu", "samrāṭtsu", "samrājñī", "samrājñyau", "samrājñīm",
  ])("X11: sam + %s keeps the m (8.3.25)", (form) => {
    expect(join("sam", form.slice(3)).result).toBe(form);
  });
  it("#12: only the bare ending nām counts as a suffix; tad + nāma has both forms", () => {
    expect(join("tad", "nāma").all).toEqual(["tannāma", "tadnāma"]);
    expect(join("ṣaṭ", "nām").all).toEqual(["ṣaṇṇām"]);
  });
});
