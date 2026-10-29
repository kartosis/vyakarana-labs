/**
 * Ac-sandhi: what happens when a word-final vowel meets a word-initial vowel (SLP1 in, SLP1 out),
 * with a sūtra-by-sūtra trace for teaching.
 *
 * Rules are tried in the order that resolves their conflicts the way the tradition does:
 *   prakṛtibhāva (1.1.11 + 6.1.125) → pūrvarūpa 6.1.109 → savarṇa-dīrgha 6.1.101 (beats 6.1.77 and 6.1.87)
 *   → vṛddhi 6.1.88 (exception to 6.1.87) → guṇa 6.1.87 → yaṇ 6.1.77 → ay/av/āy/āv 6.1.78 (+ optional 8.3.19).
 */
import { isVowel } from "./lipi.js";
import { isSavarna } from "./varna.js";

export interface SandhiStep {
  sutra: string;
  /** form after this step, SLP1 */
  form: string;
  note: string;
}

export interface SandhiResult {
  result: string;
  /** optional variants (e.g. 8.3.19 lopaḥ śākalyasya) */
  alternatives: string[];
  steps: SandhiStep[];
  /** true when no vowel-sandhi rule applies (e.g. a consonant is involved) */
  untouched: boolean;
}

export interface SandhiOptions {
  /** first word ends a pada (default true); 6.1.109 and 8.3.19 apply only at word end */
  padanta?: boolean;
  /** first word is pragṛhya (1.1.11: dual ending in ī, ū or e) */
  pragrhya?: boolean;
}

const AK = "aAiIuUfFxX";
const EC = "eEoO";
const IK = "iIuUfFxX";
const LONG: Record<string, string> = { a: "A", A: "A", i: "I", I: "I", u: "U", U: "U", f: "F", F: "F", x: "F", X: "F" };
const GUNA: Record<string, string> = { i: "e", I: "e", u: "o", U: "o", f: "ar", F: "ar", x: "al", X: "al" };
const VRDDHI: Record<string, string> = { e: "E", E: "E", o: "O", O: "O" };
const YAN: Record<string, string> = { i: "y", I: "y", u: "v", U: "v", f: "r", F: "r", x: "l", X: "l" };
const AYAV: Record<string, string> = { e: "ay", o: "av", E: "Ay", O: "Av" };

export function vowelSandhi(first: string, second: string, opts: SandhiOptions = {}): SandhiResult {
  const padanta = opts.padanta ?? true;
  const x = first.at(-1) ?? "";
  const y = second[0] ?? "";
  const head = first.slice(0, -1);
  const tail = second.slice(1);
  const start = `${first} ${second}`;
  const steps: SandhiStep[] = [];
  const done = (result: string, alternatives: string[] = []): SandhiResult => ({ result, alternatives, steps, untouched: false });

  if (!isVowel(x) || !isVowel(y)) {
    return { result: `${first} ${second}`, alternatives: [], steps: [], untouched: true };
  }

  // 1.1.11 + 6.1.125: a pragṛhya vowel stays as it is before a vowel.
  if (opts.pragrhya && "IUe".includes(x)) {
    steps.push({ sutra: "1.1.11", form: start, note: `Final ${x === "e" ? "e" : x === "I" ? "ī" : "ū"} of a dual is pragṛhya.` });
    steps.push({ sutra: "6.1.125", form: start, note: "A pragṛhya vowel undergoes no sandhi before a vowel." });
    return done(start);
  }

  // 6.1.109 eṅaḥ padāntād ati: word-final e/o + short a → the a merges into e/o (written with avagraha).
  if (padanta && (x === "e" || x === "o") && y === "a") {
    const r = `${first}'${tail}`;
    steps.push({ sutra: "6.1.84", form: start, note: "One substitute will replace both vowels (heading)." });
    steps.push({ sutra: "6.1.109", form: r, note: "Word-final e or o before short a: the earlier vowel's form replaces both (pūrvarūpa). The lost a is marked by an avagraha." });
    return done(r);
  }

  // 6.1.101 akaḥ savarṇe dīrghaḥ: like vowels merge into one long vowel.
  if (AK.includes(x) && isSavarna(x, y)) {
    const r = `${head}${LONG[x]}${tail}`;
    steps.push({ sutra: "6.1.84", form: start, note: "One substitute will replace both vowels (heading)." });
    steps.push({ sutra: "6.1.101", form: r, note: "An ak vowel and a following vowel of its own class become one long vowel. This later rule overrides 6.1.77 and 6.1.87." });
    return done(r);
  }

  if (x === "a" || x === "A") {
    steps.push({ sutra: "6.1.84", form: start, note: "One substitute will replace both vowels (heading)." });
    // 6.1.88 vṛddhir eci: a/ā + e ai o au → vṛddhi.
    if (EC.includes(y)) {
      const r = `${head}${VRDDHI[y]}${tail}`;
      steps.push({ sutra: "6.1.88", form: r, note: "a or ā before e, ai, o or au: both become the vṛddhi vowel (1.1.1). This is an exception to 6.1.87." });
      steps.push({ sutra: "1.1.50", form: r, note: `Of ā, ai, au, the one closest to the pair is ${VRDDHI[y] === "E" ? "ai" : "au"}.` });
      return done(r);
    }
    // 6.1.87 ād guṇaḥ: a/ā + i u ṛ ḷ → guṇa.
    const g = GUNA[y]!;
    const r = `${head}${g}${tail}`;
    steps.push({ sutra: "6.1.87", form: r, note: "a or ā with a following vowel: both become a guṇa vowel (1.1.2: a, e, o)." });
    steps.push({ sutra: "1.1.50", form: r, note: `Of a, e, o the closest is ${g[0] === "e" ? "e (palatal like i)" : g[0] === "o" ? "o (labial like u)" : "a"}.` });
    if (g.length === 2) {
      steps.push({ sutra: "1.1.51", form: r, note: `A guṇa replacing ${y === "x" || y === "X" ? "ḷ" : "ṛ"} is followed by ${g[1] === "r" ? "r" : "l"}: ${g === "ar" ? "ar" : "al"}.` });
    }
    return done(r);
  }

  // 6.1.77 iko yaṇ aci: i u ṛ ḷ before a vowel of another class → y v r l.
  if (IK.includes(x)) {
    const r = `${head}${YAN[x]}${second}`;
    steps.push({ sutra: "6.1.77", form: r, note: `${x} is an ik vowel and a vowel follows: it becomes a yaṇ sound.` });
    steps.push({ sutra: "1.1.50", form: r, note: `Of y v r l, the closest to ${x} is ${YAN[x] === "y" ? "y (palatal)" : YAN[x] === "v" ? "v (labial)" : YAN[x] === "r" ? "r (retroflex)" : "l (dental)"}.` });
    return done(r);
  }

  // 6.1.78 eco 'yavāyāvaḥ: e o ai au before a vowel → ay av āy āv.
  const sub = AYAV[x]!;
  const r = `${head}${sub}${second}`;
  steps.push({ sutra: "6.1.78", form: r, note: `${x === "E" ? "ai" : x === "O" ? "au" : x} before a vowel becomes ${sub.replace("A", "ā")}.` });
  const alternatives: string[] = [];
  if (padanta) {
    // 8.3.19 lopaḥ śākalyasya: word-final y/v after a/ā may be dropped before a vowel; the vowels then stay apart.
    const dropped = `${head}${sub.slice(0, -1)} ${second}`;
    alternatives.push(dropped);
    steps.push({
      sutra: "8.3.19",
      form: dropped,
      note: "Optionally (in Śākalya's view) the word-final y or v is dropped. The two vowels then stay apart: no further sandhi, because 8.3.19 is invisible to the earlier rules (8.2.1).",
    });
  }
  return done(r, alternatives);
}
