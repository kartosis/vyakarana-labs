import { describe, expect, it } from "vitest";
import { detectScheme, normalizeAnswer, transliterate } from "../src/lipi.js";

describe("lipi: IAST ↔ SLP1 ↔ Devanagari", () => {
  const cases: Array<[iast: string, slp1: string, deva: string]> = [
    ["vṛddhir ādaic", "vfdDir AdEc", "वृद्धिर् आदैच्"],
    ["adeṅ guṇaḥ", "adeN guRaH", "अदेङ् गुणः"],
    ["hal antyam", "hal antyam", "हल् अन्त्यम्"],
    ["ādir antyena sahetā", "Adir antyena sahetA", "आदिर् अन्त्येन सहेता"],
    ["kṛṣṇa", "kfzRa", "कृष्ण"],
    ["jñāna", "jYAna", "ज्ञान"],
    ["saṃskṛtam", "saMskftam", "संस्कृतम्"],
    ["aïuṇ", "aiuR", "अइउण्"],
    ["hayavaraṭ", "hayavaraw", "हयवरट्"],
    ["khaphachaṭhathacaṭatav", "KaPaCaWaTacawatav", "खफछठथचटतव्"],
  ];

  it.each(cases)("IAST %s → SLP1", (iast, slp1) => {
    expect(transliterate(iast, "iast", "slp1")).toBe(slp1);
  });

  it.each(cases)("IAST %s → Devanagari", (iast, _slp1, deva) => {
    expect(transliterate(iast, "iast", "deva")).toBe(deva);
  });

  it.each(cases)("Devanagari round trip for %s", (_iast, slp1, deva) => {
    expect(transliterate(deva, "deva", "slp1")).toBe(slp1);
  });

  it("marks vowel hiatus with a diaeresis in IAST output", () => {
    // a + i in hiatus (not the diphthong ai)
    expect(transliterate("aiuR", "slp1", "iast")).toBe("aïuṇ");
    expect(transliterate("aïuṇ", "iast", "slp1")).toBe("aiuR");
  });

  it("reads Harvard-Kyoto input", () => {
    expect(transliterate("vRddhir Adaic", "hk", "slp1")).toBe("vfdDir AdEc");
    expect(transliterate("kRSNa", "hk", "iast")).toBe("kṛṣṇa");
    expect(transliterate("jJAna", "hk", "deva")).toBe("ज्ञान");
  });

  it("converts daṇḍas and digits", () => {
    expect(transliterate("vfdDirAdEc || 1 ||", "slp1", "deva")).toBe("वृद्धिरादैच् ॥ १ ॥");
  });

  it("detects schemes and normalises answers", () => {
    expect(detectScheme("रामः")).toBe("deva");
    expect(detectScheme("rāmaḥ")).toBe("iast");
    expect(detectScheme("rAmaH")).toBe("hk");
    expect(normalizeAnswer("रामः")).toBe(normalizeAnswer("rāmaḥ"));
    expect(normalizeAnswer(" rAmaH ", "hk")).toBe("rAmaH");
  });
});

describe("candrabindu on a semivowel; jihvāmūlīya and upadhmānīya", () => {
  it("writes a nasalised semivowel with the candrabindu on it, not as m̐", () => {
    expect(transliterate("kiy~ hyaH", "slp1", "iast")).toBe("kiy̐ hyaḥ");
    expect(transliterate("kiy̐ hyaḥ", "iast", "slp1")).toBe("kiy~ hyaH");
    expect(transliterate("kiy̐ hyaḥ", "iast", "deva")).toBe("किय्ँ ह्यः");
    expect(transliterate("vidvām̐llikhati", "iast", "slp1")).toBe("vidvA~lliKati");
    expect(transliterate("vidvA~lliKati", "slp1", "iast")).toBe("vidvām̐llikhati");
  });
  it("reads and writes ᳵ and ᳶ", () => {
    expect(transliterate("कुप्वोः ᳵकᳶपौ च", "deva", "iast")).toBe("kupvoḥ ẖkaḫpau ca");
    expect(transliterate("नॄंᳶपाहि", "deva", "slp1")).toBe("nFMVpAhi");
    expect(transliterate("nFMVpAhi", "slp1", "deva")).toBe("नॄंᳶपाहि");
  });
});
