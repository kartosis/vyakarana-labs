/**
 * lipi — script conversion for Sanskrit.
 *
 * Internal representation is SLP1 (one ASCII character per phoneme), which makes
 * rule application a plain string operation. Supported schemes:
 *   - "slp1"  SLP1 (internal)
 *   - "iast"  IAST with diacritics (output uses diaeresis for vowel hiatus: aï, aü)
 *   - "deva"  Devanagari
 *   - "hk"    Harvard-Kyoto (keyboard-friendly input)
 */

export type Scheme = "slp1" | "iast" | "deva" | "hk";

/** SLP1 vowel letters. */
export const SLP1_VOWELS = "aAiIuUfFxXeEoO";
/** SLP1 consonant letters (incl. vedic L). */
export const SLP1_CONSONANTS = "kKgGNcCjJYwWqQRtTdDnpPbBmyrlvSzshL";

export const isVowel = (c: string): boolean => c.length === 1 && SLP1_VOWELS.includes(c);
export const isConsonant = (c: string): boolean => c.length === 1 && SLP1_CONSONANTS.includes(c);

// ---------------------------------------------------------------------------
// IAST
// ---------------------------------------------------------------------------

const IAST_TO_SLP1: ReadonlyArray<readonly [string, string]> = [
  // longest tokens first
  ["ai", "E"], ["au", "O"],
  ["kh", "K"], ["gh", "G"], ["ch", "C"], ["jh", "J"],
  ["ṭh", "W"], ["ḍh", "Q"], ["th", "T"], ["dh", "D"], ["ph", "P"], ["bh", "B"],
  ["ḹ", "X"], ["ḷ", "x"], ["ṝ", "F"], ["ṛ", "f"],
  ["ā", "A"], ["ī", "I"], ["ū", "U"], ["a", "a"], ["i", "i"], ["u", "u"],
  ["ï", "i"], ["ü", "u"], // hiatus markers
  ["e", "e"], ["o", "o"],
  ["ṃ", "M"], ["ṁ", "M"], ["ḥ", "H"], ["m̐", "~"],
  ["k", "k"], ["g", "g"], ["ṅ", "N"], ["c", "c"], ["j", "j"], ["ñ", "Y"],
  ["ṭ", "w"], ["ḍ", "q"], ["ṇ", "R"], ["t", "t"], ["d", "d"], ["n", "n"],
  ["p", "p"], ["b", "b"], ["m", "m"], ["y", "y"], ["r", "r"], ["l", "l"], ["v", "v"],
  ["ś", "S"], ["ṣ", "z"], ["s", "s"], ["h", "h"], ["ḻ", "L"],
  ["'", "'"], ["’", "'"],
];

const SLP1_TO_IAST: Record<string, string> = {
  a: "a", A: "ā", i: "i", I: "ī", u: "u", U: "ū", f: "ṛ", F: "ṝ", x: "ḷ", X: "ḹ",
  e: "e", E: "ai", o: "o", O: "au", M: "ṃ", H: "ḥ", "~": "m̐",
  k: "k", K: "kh", g: "g", G: "gh", N: "ṅ", c: "c", C: "ch", j: "j", J: "jh", Y: "ñ",
  w: "ṭ", W: "ṭh", q: "ḍ", Q: "ḍh", R: "ṇ", t: "t", T: "th", d: "d", D: "dh", n: "n",
  p: "p", P: "ph", b: "b", B: "bh", m: "m", y: "y", r: "r", l: "l", v: "v",
  S: "ś", z: "ṣ", s: "s", h: "h", L: "ḻ", "'": "'",
};

// ---------------------------------------------------------------------------
// Harvard-Kyoto
// ---------------------------------------------------------------------------

const HK_TO_SLP1: ReadonlyArray<readonly [string, string]> = [
  ["lRR", "X"], ["lR", "x"], ["RR", "F"], ["R", "f"],
  ["ai", "E"], ["au", "O"],
  ["kh", "K"], ["gh", "G"], ["ch", "C"], ["jh", "J"],
  ["Th", "W"], ["Dh", "Q"], ["th", "T"], ["dh", "D"], ["ph", "P"], ["bh", "B"],
  ["A", "A"], ["I", "I"], ["U", "U"], ["a", "a"], ["i", "i"], ["u", "u"], ["e", "e"], ["o", "o"],
  ["M", "M"], ["H", "H"],
  ["k", "k"], ["g", "g"], ["G", "N"], ["c", "c"], ["j", "j"], ["J", "Y"],
  ["T", "w"], ["D", "q"], ["N", "R"], ["t", "t"], ["d", "d"], ["n", "n"],
  ["p", "p"], ["b", "b"], ["m", "m"], ["y", "y"], ["r", "r"], ["l", "l"], ["v", "v"],
  ["z", "S"], ["S", "z"], ["s", "s"], ["h", "h"], ["'", "'"],
];

const SLP1_TO_HK: Record<string, string> = Object.fromEntries(
  HK_TO_SLP1.map(([hk, slp]) => [slp, hk]),
);

// ---------------------------------------------------------------------------
// Devanagari
// ---------------------------------------------------------------------------

const DEVA_VOWEL: Record<string, string> = {
  a: "अ", A: "आ", i: "इ", I: "ई", u: "उ", U: "ऊ", f: "ऋ", F: "ॠ", x: "ऌ", X: "ॡ",
  e: "ए", E: "ऐ", o: "ओ", O: "औ",
};
const DEVA_MATRA: Record<string, string> = {
  a: "", A: "ा", i: "ि", I: "ी", u: "ु", U: "ू", f: "ृ", F: "ॄ", x: "ॢ", X: "ॣ",
  e: "े", E: "ै", o: "ो", O: "ौ",
};
const DEVA_CONS: Record<string, string> = {
  k: "क", K: "ख", g: "ग", G: "घ", N: "ङ", c: "च", C: "छ", j: "ज", J: "झ", Y: "ञ",
  w: "ट", W: "ठ", q: "ड", Q: "ढ", R: "ण", t: "त", T: "थ", d: "द", D: "ध", n: "न",
  p: "प", P: "फ", b: "ब", B: "भ", m: "म", y: "य", r: "र", l: "ल", v: "व",
  S: "श", z: "ष", s: "स", h: "ह", L: "ळ",
};
const DEVA_SIGN: Record<string, string> = { M: "ं", H: "ः", "~": "ँ", "'": "ऽ" };
const VIRAMA = "्";
const DEVA_DIGITS = "०१२३४५६७८९";

const invert = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).filter(([, v]) => v !== "").map(([k, v]) => [v, k]));
const DEVA_VOWEL_INV = invert(DEVA_VOWEL);
const DEVA_MATRA_INV = invert(DEVA_MATRA);
const DEVA_CONS_INV = invert(DEVA_CONS);
const DEVA_SIGN_INV = invert(DEVA_SIGN);

// ---------------------------------------------------------------------------
// Tokenisers
// ---------------------------------------------------------------------------

function tokenize(
  text: string,
  table: ReadonlyArray<readonly [string, string]>,
): string {
  const src = text.normalize("NFC");
  let out = "";
  let i = 0;
  outer: while (i < src.length) {
    for (const [from, to] of table) {
      if (src.startsWith(from, i)) {
        out += to;
        i += from.length;
        continue outer;
      }
    }
    // Uppercase IAST letters (sentence-initial): fold to lowercase and retry once.
    const ch = src[i]!;
    const lower = ch.toLowerCase();
    if (lower !== ch && table === IAST_TO_SLP1) {
      const rest = lower + src.slice(i + 1);
      const tok = table.find(([from]) => rest.startsWith(from));
      if (tok) {
        out += tok[1];
        i += tok[0].length;
        continue;
      }
    }
    out += ch; // pass through spaces, punctuation, digits, hyphens
    i += 1;
  }
  return out;
}

function devaToSlp1(text: string): string {
  const src = text.normalize("NFC");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (DEVA_CONS_INV[ch]) {
      out += DEVA_CONS_INV[ch];
      const next = src[i + 1];
      if (next === "़") i++; // nukta: ignore
      const nn = src[i + 1];
      if (nn === VIRAMA) {
        i++;
      } else if (nn && DEVA_MATRA_INV[nn]) {
        out += DEVA_MATRA_INV[nn];
        i++;
      } else {
        out += "a";
      }
    } else if (DEVA_VOWEL_INV[ch]) {
      out += DEVA_VOWEL_INV[ch];
    } else if (DEVA_SIGN_INV[ch]) {
      out += DEVA_SIGN_INV[ch];
    } else if (ch === "॥") {
      out += "||";
    } else if (ch === "।") {
      out += "|";
    } else if (DEVA_DIGITS.includes(ch)) {
      out += String(DEVA_DIGITS.indexOf(ch));
    } else {
      out += ch;
    }
  }
  return out;
}

function slp1ToDeva(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (isConsonant(ch)) {
      out += DEVA_CONS[ch];
      const next = text[i + 1];
      if (next !== undefined && isVowel(next)) {
        out += DEVA_MATRA[next];
        i++;
      } else {
        out += VIRAMA;
      }
    } else if (isVowel(ch)) {
      out += DEVA_VOWEL[ch];
    } else if (DEVA_SIGN[ch]) {
      out += DEVA_SIGN[ch];
    } else if (ch === "|" && text[i + 1] === "|") {
      out += "॥";
      i++;
    } else if (ch === "|") {
      out += "।";
    } else if (ch >= "0" && ch <= "9") {
      out += DEVA_DIGITS[Number(ch)];
    } else {
      out += ch;
    }
  }
  return out;
}

function slp1ToIast(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = text[i - 1];
    // Mark vowel hiatus so "a" + "i" is not read as the diphthong "ai".
    if (prev === "a" && (ch === "i" || ch === "u")) {
      out += ch === "i" ? "ï" : "ü";
      continue;
    }
    out += SLP1_TO_IAST[ch] ?? ch;
  }
  return out;
}

function slp1ToHk(text: string): string {
  let out = "";
  for (const ch of text) out += SLP1_TO_HK[ch] ?? ch;
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function toSlp1(text: string, from: Scheme): string {
  switch (from) {
    case "slp1":
      return text;
    case "iast":
      return tokenize(text, IAST_TO_SLP1);
    case "hk":
      return tokenize(text, HK_TO_SLP1);
    case "deva":
      return devaToSlp1(text);
  }
}

export function fromSlp1(text: string, to: Scheme): string {
  switch (to) {
    case "slp1":
      return text;
    case "iast":
      return slp1ToIast(text);
    case "hk":
      return slp1ToHk(text);
    case "deva":
      return slp1ToDeva(text);
  }
}

export function transliterate(text: string, from: Scheme, to: Scheme): string {
  if (from === to) return text;
  return fromSlp1(toSlp1(text, from), to);
}

/** Heuristic scheme detection for free-form learner input. */
export function detectScheme(text: string): Scheme {
  if (/[ऀ-ॿ]/.test(text)) return "deva";
  if (/[āīūṛṝḷḹṅñṭḍṇśṣṃḥ]/i.test(text)) return "iast";
  if (/[AIURMHGJTDNSz]|lR/.test(text)) return "hk";
  return "iast";
}

/**
 * Normalise a learner's answer for comparison: convert to SLP1, drop spacing
 * differences, daṇḍas, hyphens and avagraha variants.
 */
export function normalizeAnswer(text: string, from: Scheme = detectScheme(text)): string {
  return toSlp1(text.trim(), from)
    .replace(/[|।॥\-–—·.,;:!?"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
