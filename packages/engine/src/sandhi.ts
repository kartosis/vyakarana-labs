/**
 * Ac-sandhi: what happens when a word-final vowel meets a word-initial vowel (SLP1 in, SLP1 out),
 * with a sūtra-by-sūtra trace for teaching.
 *
 * Rules are tried in the order that resolves their conflicts the way the tradition does:
 *   prakṛtibhāva (1.1.11 + 6.1.125) → pūrvarūpa 6.1.109 → savarṇa-dīrgha 6.1.101 (beats 6.1.77 and 6.1.87)
 *   → vṛddhi 6.1.88 (exception to 6.1.87) → guṇa 6.1.87 → yaṇ 6.1.77 → ay/av/āy/āv 6.1.78 (+ optional 8.3.19).
 */
import { fromSlp1, isVowel } from "./lipi.js";
import { isSavarna } from "./varna.js";

export interface SandhiStep {
  sutra: string;
  /** form after this step, SLP1 */
  form: string;
  note: string;
}

/** The two vowels that meet and what replaces them, e.g. a + i → e (SLP1). */
export interface Junction {
  left: string;
  right: string;
  out: string;
}

export interface SandhiResult {
  result: string;
  /** the vowel meeting itself, for the "a + i → e" line; null when untouched */
  junction: Junction | null;
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
  const done = (result: string, out: string, alternatives: string[] = []): SandhiResult => ({
    result,
    junction: { left: x, right: y, out },
    alternatives,
    steps,
    untouched: false,
  });

  if (!isVowel(x) || !isVowel(y)) {
    return { result: `${first} ${second}`, junction: null, alternatives: [], steps: [], untouched: true };
  }

  // 1.1.11 + 6.1.125: a pragṛhya vowel stays as it is before a vowel.
  if (opts.pragrhya && "IUe".includes(x)) {
    steps.push({ sutra: "1.1.11", form: start, note: `Final ${x === "e" ? "e" : x === "I" ? "ī" : "ū"} of a dual is pragṛhya.` });
    steps.push({ sutra: "6.1.125", form: start, note: "A pragṛhya vowel undergoes no sandhi before a vowel." });
    return done(start, `${x} ${y}`);
  }

  // 6.1.109 eṅaḥ padāntād ati: word-final e/o + short a → the a merges into e/o (written with avagraha).
  if (padanta && (x === "e" || x === "o") && y === "a") {
    const r = `${first}'${tail}`;
    steps.push({ sutra: "6.1.84", form: start, note: "One substitute will replace both vowels (heading)." });
    steps.push({ sutra: "6.1.109", form: r, note: "Word-final e or o before short a: the earlier vowel's form replaces both (pūrvarūpa). The lost a is marked by an avagraha." });
    return done(r, `${x}'`);
  }

  // 6.1.101 akaḥ savarṇe dīrghaḥ: like vowels merge into one long vowel.
  if (AK.includes(x) && isSavarna(x, y)) {
    const r = `${head}${LONG[x]}${tail}`;
    steps.push({ sutra: "6.1.84", form: start, note: "One substitute will replace both vowels (heading)." });
    steps.push({ sutra: "6.1.101", form: r, note: "An ak vowel and a following vowel of its own class become one long vowel. This later rule overrides 6.1.77 and 6.1.87." });
    return done(r, LONG[x]!);
  }

  if (x === "a" || x === "A") {
    steps.push({ sutra: "6.1.84", form: start, note: "One substitute will replace both vowels (heading)." });
    // 6.1.88 vṛddhir eci: a/ā + e ai o au → vṛddhi.
    if (EC.includes(y)) {
      const r = `${head}${VRDDHI[y]}${tail}`;
      steps.push({ sutra: "6.1.88", form: r, note: "a or ā before e, ai, o or au: both become the vṛddhi vowel (1.1.1). This is an exception to 6.1.87." });
      steps.push({ sutra: "1.1.50", form: r, note: `Of ā, ai, au, the one closest to the pair is ${VRDDHI[y] === "E" ? "ai" : "au"}.` });
      return done(r, VRDDHI[y]!);
    }
    // 6.1.87 ād guṇaḥ: a/ā + i u ṛ ḷ → guṇa.
    const g = GUNA[y]!;
    const r = `${head}${g}${tail}`;
    steps.push({ sutra: "6.1.87", form: r, note: "a or ā with a following vowel: both become a guṇa vowel (1.1.2: a, e, o)." });
    steps.push({ sutra: "1.1.50", form: r, note: `Of a, e, o the closest is ${g[0] === "e" ? "e (palatal like i)" : g[0] === "o" ? "o (labial like u)" : "a"}.` });
    if (g.length === 2) {
      steps.push({ sutra: "1.1.51", form: r, note: `A guṇa replacing ${y === "x" || y === "X" ? "ḷ" : "ṛ"} is followed by ${g[1] === "r" ? "r" : "l"}: ${g === "ar" ? "ar" : "al"}.` });
    }
    return done(r, g);
  }

  // 6.1.77 iko yaṇ aci: i u ṛ ḷ before a vowel of another class → y v r l.
  if (IK.includes(x)) {
    const r = `${head}${YAN[x]}${second}`;
    steps.push({ sutra: "6.1.77", form: r, note: `${x} is an ik vowel and a vowel follows: it becomes a yaṇ sound.` });
    steps.push({ sutra: "1.1.50", form: r, note: `Of y v r l, the closest to ${x} is ${YAN[x] === "y" ? "y (palatal)" : YAN[x] === "v" ? "v (labial)" : YAN[x] === "r" ? "r (retroflex)" : "l (dental)"}.` });
    return done(r, `${YAN[x]}${y}`);
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
  return done(r, `${sub}${y}`, alternatives);
}

export type CheckStatus = "applies" | "set-aside" | "no";
export interface RuleCheck {
  sutra: string;
  /** short name of the operation */
  name: string;
  status: CheckStatus;
  /** why it does or does not apply (IAST in plain English) */
  reason: string;
}

const v = (s: string) => fromSlp1(s, "iast");

/**
 * Every vowel-sandhi rule, tested on its own conditions, in the order the engine tries them.
 * The first rule that applies wins; later rules whose conditions also hold are reported as set aside.
 * This is how a learner sees why, for example, dadhi + iha takes 6.1.101 and not 6.1.77.
 */
export function sandhiChecks(first: string, second: string, opts: SandhiOptions = {}): RuleCheck[] {
  const padanta = opts.padanta ?? true;
  const x = first.at(-1) ?? "";
  const y = second[0] ?? "";
  if (!isVowel(x) || !isVowel(y)) return [];
  const isA = x === "a" || x === "A";
  const rules: Array<{ sutra: string; name: string; ok: boolean; yes: string; no: string }> = [
    {
      sutra: "6.1.125",
      name: "no sandhi for pragṛhya (prakṛtibhāva)",
      ok: !!opts.pragrhya && "IUe".includes(x),
      yes: `${v(x)} ends a dual, so it is pragṛhya (1.1.11) and is held apart.`,
      no: !opts.pragrhya ? "The first word is not marked as a dual in ī, ū or e (1.1.11)." : `A pragṛhya dual ends in ī, ū or e, not ${v(x)}.`,
    },
    {
      sutra: "6.1.109",
      name: "e, o absorb a following a (pūrvarūpa)",
      ok: padanta && (x === "e" || x === "o") && y === "a",
      yes: `Word-final ${v(x)} meets short a.`,
      no:
        x !== "e" && x !== "o"
          ? `Needs e or o at the end of the first word, not ${v(x)}.`
          : y !== "a"
            ? `Needs short a after it (“at”, 1.1.70), not ${v(y)}.`
            : `The ${v(x)} must end a word (padānta).`,
    },
    {
      sutra: "6.1.101",
      name: "like vowels lengthen (savarṇa-dīrgha)",
      ok: AK.includes(x) && isSavarna(x, y),
      yes: `${v(x)} and ${v(y)} are of one class (savarṇa, 1.1.9).`,
      no: !AK.includes(x) ? `${v(x)} is not an ak vowel (a i u ṛ ḷ).` : `${v(x)} and ${v(y)} are not of one class.`,
    },
    {
      sutra: "6.1.88",
      name: "a + e ai o au → vṛddhi",
      ok: isA && EC.includes(y),
      yes: `${v(x)} meets ${v(y)}, an ec vowel.`,
      no: !isA ? `Needs a or ā first, not ${v(x)}.` : `Needs e, ai, o or au second, not ${v(y)}.`,
    },
    {
      sutra: "6.1.87",
      name: "a + vowel → guṇa",
      ok: isA,
      yes: `${v(x)} meets a vowel.`,
      no: `Needs a or ā first, not ${v(x)}.`,
    },
    {
      sutra: "6.1.77",
      name: "i u ṛ ḷ → y v r l (yaṇ)",
      ok: IK.includes(x),
      yes: `${v(x)} is an ik vowel and a vowel follows.`,
      no: `${v(x)} is not an ik vowel (i u ṛ ḷ).`,
    },
    {
      sutra: "6.1.78",
      name: "e o ai au → ay av āy āv",
      ok: EC.includes(x),
      yes: `${v(x)} is an ec vowel and a vowel follows.`,
      no: `${v(x)} is not an ec vowel (e o ai au).`,
    },
  ];
  let winner: string | null = null;
  return rules.map((r) => {
    if (!r.ok) return { sutra: r.sutra, name: r.name, status: "no" as const, reason: r.no };
    if (winner) return { sutra: r.sutra, name: r.name, status: "set-aside" as const, reason: `${r.yes} But ${winner} is the more specific rule (an apavāda), so it wins.` };
    winner = r.sutra;
    return { sutra: r.sutra, name: r.name, status: "applies" as const, reason: r.yes };
  });
}
