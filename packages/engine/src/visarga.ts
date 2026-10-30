/**
 * Visarga sandhi (Laghusiddhāntakaumudī 103–114, with 8.3.15, 8.3.34 and 8.3.37 from the Hal-sandhi-prakaraṇa).
 *
 * The final is either s (or the visarga that writes it), which becomes ru by 8.2.66, or an r that was always r
 * (punar, prātar, antar, svar …), which is not ru. Several rules work only on ru:
 *   - before a vowel or a voiced consonant (aś):
 *       a + ru + short a → u (6.1.113) → o (6.1.87) → pūrvarūpa (6.1.109): śivo 'rcyaḥ
 *       a + ru + voiced consonant → u (6.1.114) → o: śivo vandyaḥ; also before r: manorathaḥ (8.3.14 is asiddha)
 *       a/ā or bho, bhago, agho + ru → y (8.3.17); before a vowel y may drop (8.3.19): devā iha, devāy iha;
 *       before a consonant it must (8.3.22): devā gacchanti
 *       any other r before r drops (8.3.14) and lengthens the vowel before it (6.3.111): harī ramyaḥ
 *   - before a voiceless consonant: visarga (8.3.15); then
 *       before a voiceless consonant + sibilant it stays (8.3.35): puruṣaḥ kṣuram
 *       before k kh p ph it stays or becomes the jihvāmūlīya / upadhmānīya (8.3.37)
 *       before ś ṣ s it stays (8.3.36) or becomes s (8.3.34, then ścutva / ṣṭutva); before a sibilant that is
 *       itself followed by a voiceless consonant it may also drop (vārttika): vṛkṣā sthātāraḥ
 *       before c ch ṭ ṭh t th it becomes s (8.3.34), then ś or ṣ (8.4.40, 8.4.41)
 * Two special words: saḥ and eṣaḥ lose their case ending before a consonant (6.1.132); ahan becomes ahar (8.2.69).
 * All forms are SLP1; Z and V are the jihvāmūlīya and upadhmānīya.
 */
import { isConsonant, isVowel } from "./lipi.js";
import { joinWords, type HalSandhiResult } from "./halsandhi.js";
import { consonantSandhi } from "./halsandhi.js";
import { vowelSandhi, type Alternative, type SandhiStep } from "./sandhi.js";

export interface VisargaOptions {
  /** the final is an original r, not s (punar, prātar …); when omitted, R_WORDS decides for a typed visarga */
  fromR?: boolean;
}

/** Words whose final visarga stands for an original r (stem as written before a vowel, SLP1). */
export const R_WORDS = ["punar", "prAtar", "antar", "svar", "ahar", "pitar", "mAtar", "BrAtar", "gIr", "DUr", "dvAr"];

const HAS = "hyvrlYmNRnJBGQDjbgqd"; // haś: the voiced consonants
const KHAR = "kKcCwWtTpPSzs"; // khar: the voiceless consonants
const SAR = "Szs"; // śar: the sibilants
const KU_PU = "kKpP";

/** A junction this module handles: the first word ends in s, r or visarga, or is ahan. */
export const isVisargaJunction = (first: string): boolean => /[Hsr]$/.test(first) || first === "ahan";

/** Does a typed visarga at the end of this word stand for r? */
export const visargaFromR = (first: string): boolean =>
  first.endsWith("r") || (first.endsWith("H") && R_WORDS.includes(first.slice(0, -1) + "r"));

const lengthen = (c: string) => ({ a: "A", i: "I", u: "U" })[c] ?? c;

export function visargaSandhi(first: string, second: string, opts: VisargaOptions = {}): HalSandhiResult {
  const y = second[0] ?? "";
  if (!first || !y) return { result: `${first} ${second}`, junction: null, alternatives: [], steps: [], untouched: true, note: "Two words are needed." };
  const steps: SandhiStep[] = [];
  const alternatives: Alternative[] = [];
  const say = (sutra: string, form: string, note: string) => steps.push({ sutra, form, note });
  const done = (result: string): HalSandhiResult => ({ result, junction: null, alternatives, steps, untouched: false });

  // 1. What the final is.
  let pre: string;
  let ru: boolean;
  if (first === "ahan") {
    pre = "aha";
    ru = false;
    say("8.2.69", `ahar ${second}`, "The n of ahan becomes r, not ru, when no case ending follows it.");
  } else {
    pre = first.slice(0, -1);
    const fromR = first.endsWith("r") || (first.endsWith("H") && (opts.fromR ?? R_WORDS.includes(pre + "r")));
    ru = !fromR;
    if (ru && (pre === "sa" || pre === "eza") && isConsonant(y)) {
      // 6.1.132: the su of tad / etad (saḥ, eṣaḥ) is dropped before a consonant; what remains is a vowel + consonant.
      say("6.1.132", `${pre} ${second}`, `The case ending of ${pre === "sa" ? "saḥ" : "eṣaḥ"} is dropped before a consonant.`);
      const rest = consonantSandhi(pre, second);
      if (!rest.untouched) {
        steps.push(...rest.steps);
        alternatives.push(...rest.alternatives);
        return done(rest.result);
      }
      return done(`${pre} ${second}`);
    }
    if (ru) say("8.2.66", `${pre}r ${second}`, "A word-final s becomes ru, written r here.");
  }
  const last = pre.at(-1) ?? "";

  // 2. Before a vowel or a voiced consonant (aś).
  if (isVowel(y) || HAS.includes(y)) {
    if (ru && last === "a" && (y === "a" || HAS.includes(y))) {
      const sutra = y === "a" ? "6.1.113" : "6.1.114";
      say(sutra, `${pre}u ${second}`, y === "a" ? "After short a, ru before short a becomes u." : "After short a, ru before a voiced consonant becomes u.");
      const o = vowelSandhi(pre, "u", { padanta: false });
      const word = o.result;
      say("6.1.87", `${word} ${second}`, "a + u become one guṇa vowel, o (6.1.84, 6.1.87).");
      if (y === "a") {
        const p = vowelSandhi(word, second);
        // 6.1.84, the heading "one for both", was already cited with 6.1.87
        for (const s of p.steps) if (s.sutra !== "6.1.84") steps.push(s);
        return done(p.result);
      }
      return done(`${word} ${second}`);
    }
    if (ru && (last === "a" || last === "A" || /^(Bo|Bago|aGo)$/.test(pre))) {
      say("8.3.17", `${pre}y ${second}`, "After a or ā (and after bho, bhago, agho), ru before a vowel or voiced consonant becomes y.");
      if (isVowel(y)) {
        say("8.3.19", `${pre} ${second}`, "In Śākalya's view the y is dropped. The vowels then stay apart: 8.3.19 is invisible to the vowel rules of chapter 6 (8.2.1).");
        alternatives.push({ form: `${pre}y${second}`, sutra: "8.3.19", note: "Keeping the y, which is optional (8.3.19)." });
        return done(`${pre} ${second}`);
      }
      say("8.3.22", `${pre} ${second}`, "Before a consonant the y is dropped, in every teacher's view.");
      return done(`${pre} ${second}`);
    }
    if (y === "r") {
      say("8.3.14", `${pre} ${second}`, "r before r is dropped.");
      if ("aiu".includes(last)) {
        const long = pre.slice(0, -1) + lengthen(last);
        say("6.3.111", `${long} ${second}`, "When r drops before r, the vowel before it is lengthened.");
        return done(`${long} ${second}`);
      }
      return done(`${pre} ${second}`);
    }
    // ru after another vowel, or an original r: it stays r.
    const note = ru
      ? "No rule changes ru after this vowel; it is pronounced r."
      : "This r is not ru, so 6.1.113, 6.1.114 and 8.3.17 do not touch it; it stays r.";
    if (!steps.length) return { result: `${pre}r${second}`, junction: null, alternatives, steps, untouched: true, note };
    return done(`${pre}r${second}`);
  }

  // 3. Before a voiceless consonant: visarga first.
  if (KHAR.includes(y)) {
    say("8.3.15", `${pre}H ${second}`, "Before a voiceless consonant, r becomes visarga.");
    const y2 = second[1] ?? "";
    if (SAR.includes(y2) && !SAR.includes(y)) {
      say("8.3.35", `${pre}H ${second}`, "Before a voiceless consonant that is followed by a sibilant, the visarga stays (Kāśikā: puruṣaḥ kṣuram). This rule is not in the Laghusiddhāntakaumudī.");
      return done(`${pre}H ${second}`);
    }
    if (KU_PU.includes(y)) {
      const breath = "kK".includes(y) ? "Z" : "V";
      say("8.3.37", `${pre}H ${second}`, "Before k, kh, p or ph the visarga stays, or becomes the jihvāmūlīya (before k, kh) or the upadhmānīya (before p, ph).");
      alternatives.push({ form: `${pre}${breath}${second}`, sutra: "8.3.37", note: `With the ${breath === "Z" ? "jihvāmūlīya" : "upadhmānīya"}, also correct; Varadarāja and the Kāśikā list this form first (8.3.37).` });
      return done(`${pre}H ${second}`);
    }
    if (SAR.includes(y)) {
      say("8.3.36", `${pre}H ${second}`, "Before a sibilant the visarga may stay visarga.");
      alternatives.push({ form: joinWords(pre + y, second), sutra: "8.3.34", note: `With s (8.3.34)${y === "S" ? ", which becomes ś next to ś (8.4.40)" : y === "z" ? ", which becomes ṣ next to ṣ (8.4.41)" : ""}, also correct.` });
      if (KHAR.includes(y2) && !SAR.includes(y2)) {
        alternatives.push({ form: `${pre} ${second}`, sutra: "8.3.36", varttika: true, note: "Dropping the visarga before a sibilant followed by a voiceless consonant (vārttika in the Kāśikā on 8.3.36), also correct." });
      }
      return done(`${pre}H ${second}`);
    }
    // c ch ṭ ṭh t th
    say("8.3.34", joinWords(pre + "s", second), "Before a voiceless consonant, visarga becomes s.");
    if ("cC".includes(y)) {
      say("8.4.40", joinWords(pre + "S", second), "s next to a palatal becomes ś (ścutva).");
      return done(joinWords(pre + "S", second));
    }
    if ("wW".includes(y)) {
      say("8.4.41", joinWords(pre + "z", second), "s next to a retroflex becomes ṣ (ṣṭutva).");
      return done(joinWords(pre + "z", second));
    }
    return done(joinWords(pre + "s", second));
  }
  return { result: `${first} ${second}`, junction: null, alternatives, steps, untouched: true, note: "No visarga-sandhi rule applies here." };
}
