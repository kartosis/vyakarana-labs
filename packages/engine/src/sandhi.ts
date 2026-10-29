/**
 * Ac-sandhi: what happens when a word-final vowel meets a word-initial vowel (SLP1 in, SLP1 out),
 * with a sūtra-by-sūtra trace for teaching.
 *
 * Rules are tried in the order that resolves their conflicts the way the tradition does:
 *   prakṛtibhāva (1.1.11–16 + 6.1.125) → pūrvarūpa 6.1.109 → savarṇa-dīrgha 6.1.101 (beats 6.1.77 and 6.1.87)
 *   → pararūpa before om 6.1.95 → vṛddhi 6.1.88 (exception to 6.1.87) → guṇa 6.1.87 → yaṇ 6.1.77
 *   → ay/av/āy/āv 6.1.78.
 * Optional forms the Laghusiddhāntakaumudī and the Kāśikā accept are returned as alternatives:
 *   8.3.19 (y/v dropped), 6.1.127 and 6.1.128 (left unjoined, shortened), the vārttika on 6.1.101 (ṛ, ḷ),
 *   and 8.4.47 + 8.4.53 (consonant doubled before a yaṇ).
 * Not modelled here (taught in the lessons): upasarga + root (6.1.89, 6.1.91, 6.1.94), āṅ (6.1.95),
 * go (6.1.122–124), pluta (8.2.84, 6.1.125).
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

/** Another correct form, with the rule that allows it. */
export interface Alternative {
  form: string;
  /** a.p.s; a vārttika is cited under its sūtra */
  sutra: string;
  /** set when the alternative rests on a vārttika rather than the sūtra itself */
  varttika?: boolean;
  note: string;
}

export interface SandhiResult {
  result: string;
  /** the vowel meeting itself, for the "a + i → e" line; null when untouched */
  junction: Junction | null;
  /** other correct forms (8.3.19, 6.1.127, 6.1.128, 8.4.47, vārttika on 6.1.101) */
  alternatives: Alternative[];
  steps: SandhiStep[];
  /** true when no vowel-sandhi rule applies (e.g. a consonant is involved) */
  untouched: boolean;
}

export interface SandhiOptions {
  /** first word ends a pada (default true); 6.1.109, 8.3.19, 6.1.127 and 6.1.128 apply only at word end */
  padanta?: boolean;
  /** first word is pragṛhya: a dual in ī, ū or e (1.1.11), amī/amū (1.1.12), a one-vowel particle (1.1.14), a particle in o (1.1.15) */
  pragrhya?: boolean;
  /** the two words form a compound: Śākalya's unjoined forms (6.1.127, 6.1.128) are then not allowed (vārttika "na samāse") */
  compound?: boolean;
}

const AK = "aAiIuUfFxX";
const EC = "eEoO";
const IK = "iIuUfFxX";
const LONG: Record<string, string> = { a: "A", A: "A", i: "I", I: "I", u: "U", U: "U", f: "F", F: "F", x: "F", X: "F" };
const GUNA: Record<string, string> = { i: "e", I: "e", u: "o", U: "o", f: "ar", F: "ar", x: "al", X: "al" };
const VRDDHI: Record<string, string> = { e: "E", E: "E", o: "O", O: "O" };
const YAN: Record<string, string> = { i: "y", I: "y", u: "v", U: "v", f: "r", F: "r", x: "l", X: "l" };
const AYAV: Record<string, string> = { e: "ay", o: "av", E: "Ay", O: "Av" };
const SHORT: Record<string, string> = { a: "a", A: "a", i: "i", I: "i", u: "u", U: "u", f: "f", F: "f", x: "x", X: "x" };
/** voiced stops (part of jhaś) and their jaś (unaspirated voiced) counterparts, for 8.4.53 */
const JAS: Record<string, string> = { g: "g", G: "g", j: "j", J: "j", q: "q", Q: "q", d: "d", D: "d", b: "b", B: "b" };
const VOICELESS_PLAIN = "kcwtp";
const isOm = (w: string) => w === "om" || w === "oM";
const v = (s: string) => fromSlp1(s, "iast");

export function vowelSandhi(first: string, second: string, opts: SandhiOptions = {}): SandhiResult {
  const padanta = opts.padanta ?? true;
  const x = first.at(-1) ?? "";
  const y = second[0] ?? "";
  const head = first.slice(0, -1);
  const tail = second.slice(1);
  const start = `${first} ${second}`;
  const steps: SandhiStep[] = [];
  const done = (result: string, out: string, alternatives: Alternative[] = []): SandhiResult => ({
    result,
    junction: { left: x, right: y, out },
    alternatives,
    steps,
    untouched: false,
  });

  if (!isVowel(x) || !isVowel(y)) {
    return { result: `${first} ${second}`, junction: null, alternatives: [], steps: [], untouched: true };
  }

  /**
   * 6.1.127 iko 'savarṇe śākalyasya hrasvaś ca / 6.1.128 ṛty akaḥ: a word-final ik before a dissimilar vowel,
   * or a word-final ak before short ṛ, may stay unjoined, shortened if long. Not inside a compound.
   */
  function sakalyaUnjoined(): Alternative | null {
    if (!padanta || opts.compound) return null;
    const unjoined = `${head}${SHORT[x]} ${second}`;
    if (y === "f" && AK.includes(x)) {
      return { form: unjoined, sutra: "6.1.128", note: `Before short ṛ, the word-final ${v(x)} may stay unjoined${SHORT[x] !== x ? `, shortened to ${v(SHORT[x]!)}` : ""} (Śākalya's view).` };
    }
    if (IK.includes(x) && !isSavarna(x, y)) {
      return { form: unjoined, sutra: "6.1.127", note: `The word-final ${v(x)} may stay unjoined before a dissimilar vowel${SHORT[x] !== x ? `, shortened to ${v(SHORT[x]!)}` : ""} (Śākalya's view). The shortening would be pointless if sandhi followed, so none does.` };
    }
    return null;
  }

  // 1.1.11–16 + 6.1.125: a pragṛhya vowel stays as it is before a vowel.
  if (opts.pragrhya) {
    const dual = "IUe".includes(x);
    steps.push({
      sutra: dual ? "1.1.11" : x === "o" ? "1.1.15" : "1.1.14",
      form: start,
      note: dual
        ? `The final ${v(x)} of a dual form is pragṛhya.`
        : x === "o"
          ? "A particle ending in o is pragṛhya."
          : "A particle consisting of a single vowel is pragṛhya.",
    });
    steps.push({ sutra: "6.1.125", form: start, note: "A pragṛhya vowel stays as it is before a vowel: no sandhi." });
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
    steps.push({ sutra: "6.1.101", form: r, note: "An ak vowel and a following vowel of its own class become one long vowel. This rule sets aside 6.1.77 and 6.1.87." });
    const alts: Alternative[] = [];
    if ("fFxX".includes(x) && (y === "f" || y === "x")) {
      alts.push({
        form: `${head}${y}${tail}`,
        sutra: "6.1.101",
        varttika: true,
        note: `A vārttika on this rule allows ${v(y)} instead of the long vowel before ${v(y)}: ${y === "f" ? "ṛti ṛ vā" : "ḷti ḷ vā"}.`,
      });
    }
    const unjoined = sakalyaUnjoined();
    if (unjoined) alts.push(unjoined);
    return done(r, LONG[x]!, alts);
  }

  if (x === "a" || x === "A") {
    steps.push({ sutra: "6.1.84", form: start, note: "One substitute will replace both vowels (heading)." });
    // 6.1.95 omāṅoś ca: a/ā + om → the later vowel replaces both (pararūpa), setting aside 6.1.88.
    if (isOm(second)) {
      const r = `${head}${second}`;
      steps.push({ sutra: "6.1.95", form: r, note: "a or ā before om: the later vowel alone replaces both (pararūpa). This sets aside vṛddhi (6.1.88)." });
      return done(r, "o");
    }
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
    const unjoined = sakalyaUnjoined();
    return done(r, g, unjoined ? [unjoined] : []);
  }

  // 6.1.77 iko yaṇ aci: i u ṛ ḷ before a vowel of another class → y v r l.
  if (IK.includes(x)) {
    const r = `${head}${YAN[x]}${second}`;
    steps.push({ sutra: "6.1.77", form: r, note: `${v(x)} is an ik vowel and a vowel follows: it becomes a yaṇ sound.` });
    steps.push({ sutra: "1.1.50", form: r, note: `Of y v r l, the closest to ${v(x)} is ${YAN[x] === "y" ? "y (palatal)" : YAN[x] === "v" ? "v (teeth and lips, nearest to the labial u)" : YAN[x] === "r" ? "r (retroflex)" : "l (dental)"}.` });
    const alts: Alternative[] = [];
    // 8.4.47 anaci ca (+ 8.4.53): the consonant before the new y v r l, if it follows a vowel, may be doubled.
    const c = head.at(-1) ?? "";
    const p = head.at(-2) ?? "";
    if (isVowel(p) && (c in JAS || VOICELESS_PLAIN.includes(c))) {
      const lead = JAS[c] ?? c;
      alts.push({
        form: `${head.slice(0, -1)}${lead}${c}${YAN[x]}${second}`,
        sutra: "8.4.47",
        note:
          lead === c
            ? `${v(c)} comes after a vowel and is not followed by one, so it may be doubled.`
            : `${v(c)} comes after a vowel and is not followed by one, so it may be doubled (8.4.47); the first ${v(c)}, before a voiced stop, becomes ${v(lead)} (8.4.53).`,
      });
    }
    const unjoined = sakalyaUnjoined();
    if (unjoined) alts.push(unjoined);
    return done(r, `${YAN[x]}${y}`, alts);
  }

  // 6.1.78 eco 'yavāyāvaḥ: e o ai au before a vowel → ay av āy āv.
  const sub = AYAV[x]!;
  const r = `${head}${sub}${second}`;
  steps.push({ sutra: "6.1.78", form: r, note: `${x === "E" ? "ai" : x === "O" ? "au" : x} before a vowel becomes ${sub.replace("A", "ā")}.` });
  const alternatives: Alternative[] = [];
  if (padanta) {
    // 8.3.19 lopaḥ śākalyasya: word-final y/v after a/ā may be dropped before a vowel; the vowels then stay apart.
    alternatives.push({
      form: `${head}${sub.slice(0, -1)} ${second}`,
      sutra: "8.3.19",
      note: "In Śākalya's view the word-final y or v may be dropped. The two vowels then stay apart: 8.3.19 belongs to the last three quarters of the grammar, so the vowel rules of chapter 6 cannot see its result (8.2.1).",
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
      ok: !!opts.pragrhya,
      yes: `The first word is pragṛhya (1.1.11–16), so its ${v(x)} is held apart.`,
      no: "The first word is not pragṛhya: not a dual in ī, ū or e (1.1.11) or a particle of 1.1.14–15.",
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
      sutra: "6.1.95",
      name: "a + om → om (pararūpa)",
      ok: isA && isOm(second),
      yes: `${v(x)} meets the word om.`,
      no: !isA ? `Needs a or ā first, not ${v(x)}.` : "The second word is not om.",
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
