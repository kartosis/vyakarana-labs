import { describe, expect, it } from "vitest";
import { fromSlp1, toSlp1 } from "../src/lipi.js";
import { visargaSandhi, visargaFromR } from "../src/visarga.js";

/** Join two IAST words; forms come back in IAST with spaces removed, so they compare like answers. */
const join = (a: string, b: string, fromR?: boolean) => {
  const r = visargaSandhi(toSlp1(a, "iast"), toSlp1(b, "iast"), fromR === undefined ? {} : { fromR });
  const ia = (x: string) => fromSlp1(x, "iast").replace(/\s/g, "");
  return {
    result: ia(r.result),
    all: [r.result, ...r.alternatives.map((x) => x.form)].map(ia),
    sutras: r.steps.map((s) => s.sutra),
    untouched: r.untouched,
  };
};

describe("visarga sandhi: Varadarāja's examples (LSK 103–114)", () => {
  it.each([
    // LSK 103, 8.3.36: hariḥ śete, hariśśete
    ["hariḥ", "śete", ["hariḥśete", "hariśśete"]],
    // LSK 105, 6.1.113: śivo 'rcyaḥ
    ["śivaḥ", "arcyaḥ", ["śivo'rcyaḥ"]],
    // LSK 106, 6.1.114: śivo vandyaḥ
    ["śivaḥ", "vandyaḥ", ["śivovandyaḥ"]],
    // LSK 107, 8.3.17 (+ 8.3.19): devā iha, devāyiha
    ["devāḥ", "iha", ["devāiha", "devāyiha"]],
    // LSK 108, 8.3.22: bho devāḥ, bhago namaste, agho yāhi
    ["bhoḥ", "devāḥ", ["bhodevāḥ"]],
    ["bhagoḥ", "namaste", ["bhagonamaste"]],
    ["aghoḥ", "yāhi", ["aghoyāhi"]],
    // LSK 109, 8.2.69: aharahaḥ, ahargaṇaḥ
    ["ahan", "ahaḥ", ["aharahaḥ"]],
    ["ahan", "gaṇaḥ", ["ahargaṇaḥ"]],
    // LSK 111, 6.3.111 with 8.3.14: punā ramate, harī ramyaḥ, śambhū rājate
    ["punaḥ", "ramate", ["punāramate"]],
    ["hariḥ", "ramyaḥ", ["harīramyaḥ"]],
    ["śambhuḥ", "rājate", ["śambhūrājate"]],
    // LSK 111–112: manas + rathaḥ → manorathaḥ (8.3.14 is asiddha, so 6.1.114 wins)
    ["manaḥ", "rathaḥ", ["manorathaḥ"]],
    // LSK 113, 6.1.132: eṣa viṣṇuḥ, sa śambhuḥ; eṣako rudraḥ; eṣo 'tra
    ["eṣaḥ", "viṣṇuḥ", ["eṣaviṣṇuḥ"]],
    ["saḥ", "śambhuḥ", ["saśambhuḥ"]],
    ["eṣakaḥ", "rudraḥ", ["eṣakorudraḥ"]],
    ["eṣaḥ", "atra", ["eṣo'tra"]],
  ])("%s + %s", (a, b, forms) => {
    expect(join(a, b).all).toEqual(forms);
  });
});

describe("visarga sandhi: the Kāśikā's examples", () => {
  it.each([
    // 8.3.34, then ścutva / ṣṭutva
    ["vṛkṣaḥ", "chādayati", ["vṛkṣaśchādayati"]],
    ["vṛkṣaḥ", "cinoti", ["vṛkṣaścinoti"]],
    ["vṛkṣaḥ", "ṭīkate", ["vṛkṣaṣṭīkate"]],
    ["vṛkṣaḥ", "tarati", ["vṛkṣastarati"]],
    // 8.3.36 and the vārttika kharpare śari vā lopaḥ
    ["vṛkṣaḥ", "ṣaṇḍe", ["vṛkṣaḥṣaṇḍe", "vṛkṣaṣṣaṇḍe"]],
    ["vṛkṣāḥ", "sthātāraḥ", ["vṛkṣāḥsthātāraḥ", "vṛkṣāssthātāraḥ", "vṛkṣāsthātāraḥ"]],
    // 8.3.35: puruṣaḥ kṣuram, adbhiḥ psātam
    ["puruṣaḥ", "kṣuram", ["puruṣaḥkṣuram"]],
    ["adbhiḥ", "psātam", ["adbhiḥpsātam"]],
    // 8.3.37
    ["vṛkṣaḥ", "karoti", ["vṛkṣaḥkaroti", "vṛkṣaẖkaroti"]],
    ["vṛkṣaḥ", "phalati", ["vṛkṣaḥphalati", "vṛkṣaḫphalati"]],
    // 6.1.113: vṛkṣo 'tra; not after i (agnir atra); not before i (vṛkṣa iha); not for an original r (prātar atra)
    ["vṛkṣaḥ", "atra", ["vṛkṣo'tra"]],
    ["agniḥ", "atra", ["agniratra"]],
    ["vṛkṣaḥ", "iha", ["vṛkṣaiha", "vṛkṣayiha"]],
    // 6.1.114: puruṣo yāti, puruṣo hasati, puruṣo dadāti
    ["puruṣaḥ", "yāti", ["puruṣoyāti"]],
    ["puruṣaḥ", "hasati", ["puruṣohasati"]],
    // 8.3.17: ka āste, kayāste; brāhmaṇā dadati; 8.3.22: vṛkṣā hasanti
    ["kaḥ", "āste", ["kaāste", "kayāste"]],
    ["brāhmaṇāḥ", "dadati", ["brāhmaṇādadati"]],
    ["vṛkṣāḥ", "hasanti", ["vṛkṣāhasanti"]],
    // 8.3.14 + 6.3.111: agnī rathaḥ, indū rathaḥ, prātā rājakrayaḥ
    ["agniḥ", "rathaḥ", ["agnīrathaḥ"]],
    ["induḥ", "rathaḥ", ["indūrathaḥ"]],
    ["prātaḥ", "rājakrayaḥ", ["prātārājakrayaḥ"]],
    // 6.1.132: sa dadāti, eṣa bhuṅkte; yo dadāti (not tad / etad)
    ["saḥ", "dadāti", ["sadadāti"]],
    ["yaḥ", "dadāti", ["yodadāti"]],
    // 8.2.69: ahar dadāti
    ["ahan", "dadāti", ["ahardadāti"]],
  ])("%s + %s", (a, b, forms) => {
    expect(join(a, b).all).toEqual(forms);
  });

  it("an original r is not ru: prātar atra, svar atra stay", () => {
    expect(join("prātaḥ", "atra")).toMatchObject({ result: "prātaratra", untouched: true });
    expect(join("svar", "atra")).toMatchObject({ result: "svaratra", untouched: true });
    expect(join("punaḥ", "gacchati").result).toBe("punargacchati");
  });

  it("the r-words list and the explicit option decide what a visarga stands for", () => {
    expect(visargaFromR(toSlp1("punaḥ", "iast"))).toBe(true);
    expect(visargaFromR(toSlp1("rāmaḥ", "iast"))).toBe(false);
    expect(join("rāmaḥ", "atra", true).result).toBe("rāmaratra");
  });

  it("ahan: ru before rūpa, rātri, rathantara (vārttika); ahar, gīr, dhūr may keep r before pati", () => {
    expect(join("ahan", "rātraḥ").all).toEqual(["ahorātraḥ"]);
    expect(join("ahan", "rūpam").all).toEqual(["ahorūpam"]);
    expect(join("ahaḥ", "rathantaram").all).toEqual(["ahorathantaram"]);
    expect(join("ahaḥ", "patiḥ").all).toEqual(["ahaḥpatiḥ", "aharpatiḥ", "ahaḫpatiḥ"]);
    expect(join("gīḥ", "patiḥ").all).toContain("gīrpatiḥ");
  });

  it("after bho, bhago, agho the y before a vowel always drops (8.3.20); a light y may remain (8.3.18)", () => {
    expect(join("bhoḥ", "atra")).toMatchObject({ all: ["bhoatra", "bhoyatra"], sutras: ["8.2.66", "8.3.17", "8.3.20"] });
    expect(join("bhagoḥ", "idam").all).toEqual(["bhagoidam", "bhagoyidam"]);
  });

  it("in verse saḥ may lose its ending before a vowel (6.1.134)", () => {
    expect(join("saḥ", "eṣaḥ").all).toEqual(["saeṣaḥ", "sayeṣaḥ", "saiṣaḥ"]);
    expect(join("saḥ", "atra").all).toEqual(["so'tra", "sātra"]);
  });

  it("ṛ-stem vocatives end in an original r", () => {
    expect(join("kartaḥ", "atra").result).toBe("kartaratra");
  });

  it("orders the steps by the rules that apply", () => {
    expect(join("devāḥ", "ramante")).toMatchObject({ all: ["devāramante"], sutras: ["8.2.66", "8.3.14"] });
    expect(join("śivaḥ", "arcyaḥ").sutras).toEqual(["8.2.66", "6.1.113", "6.1.87", "6.1.109"]);
    expect(join("hariḥ", "ramyaḥ").sutras).toEqual(["8.2.66", "8.3.14", "6.3.111"]);
    expect(join("devāḥ", "gacchanti").sutras).toEqual(["8.2.66", "8.3.17", "8.3.22"]);
    expect(join("vṛkṣaḥ", "cinoti").sutras).toEqual(["8.2.66", "8.3.15", "8.3.34", "8.4.40"]);
  });
});
